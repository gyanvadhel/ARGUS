"""Live network checks on a link: does the domain exist, is its certificate sound, and what does the page do.

Pages are fetched hop by hop so every redirect is visible, and any hop that resolves to a private or local
address is refused, so a scanned link can never make ARGUS poke at your own network.
"""
from __future__ import annotations

import asyncio
import ipaddress
import os
import socket
import ssl
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import unquote, urljoin, urlsplit

import httpx

MAX_BYTES = 1_500_000
MAX_HOPS = 5
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
HTML_TYPES = {"text/html", "application/xhtml+xml", ""}
_NXDOMAIN_ERRNOS = {getattr(socket, "EAI_NONAME", -2), getattr(socket, "EAI_NODATA", -5), 11001, 11004}
_resolver_check: dict[str, float | bool] = {"at": 0.0, "ok": False}


def offline() -> bool:
    """Tests (and air-gapped demos) set ARGUS_OFFLINE=1 to skip every live network check."""
    return os.environ.get("ARGUS_OFFLINE") == "1"


def is_public(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    return addr.is_global and not addr.is_multicast


async def _lookup(host: str) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await asyncio.wait_for(loop.getaddrinfo(host, None, type=socket.SOCK_STREAM), 4)
    return sorted({info[4][0] for info in infos})


async def _resolver_works() -> bool:
    """A known domain must resolve before we believe any 'this domain doesn't exist' answer."""
    now = time.monotonic()
    if now - float(_resolver_check["at"]) > 60:
        try:
            _resolver_check["ok"] = bool(await _lookup("example.com"))
        except (OSError, asyncio.TimeoutError):
            _resolver_check["ok"] = False
        _resolver_check["at"] = now
    return bool(_resolver_check["ok"])


async def resolve(host: str) -> list[str] | None:
    """The host's IP addresses; [] if the domain doesn't exist; None if the lookup couldn't be done."""
    if offline() or not host:
        return None
    try:
        return [str(ipaddress.ip_address(host))]
    except ValueError:
        pass
    try:
        return await _lookup(host)
    except socket.gaierror as exc:
        if exc.errno in _NXDOMAIN_ERRNOS and await _resolver_works():
            return []
        return None
    except (OSError, asyncio.TimeoutError):
        return None


@dataclass
class Hop:
    url: str
    status: int


@dataclass
class PageFetch:
    final_url: str
    chain: list[Hop] = field(default_factory=list)
    status: int | None = None
    content_type: str = ""
    html: str | None = None
    download: str | None = None
    blocked: str | None = None
    error: str | None = None


def _download_name(resp: httpx.Response, url: str, content_type: str) -> str | None:
    disposition = resp.headers.get("content-disposition", "")
    # "inline" pages may still carry a filename (Vercel does this), so only attachments or non-pages count.
    if "filename=" in disposition.lower() and (disposition.lower().startswith("attachment") or content_type not in HTML_TYPES):
        return unquote(disposition.split("filename=", 1)[1].strip("\"'; "))[:120]
    if content_type not in HTML_TYPES and not content_type.startswith("text/") and not content_type.startswith("image/"):
        name = urlsplit(url).path.rsplit("/", 1)[-1]
        return name[:120] or content_type
    return None


async def fetch_page(client: httpx.AsyncClient, url: str) -> PageFetch:
    if offline():
        return PageFetch(final_url=url, error="offline")
    chain: list[Hop] = []
    current = url
    for _ in range(MAX_HOPS + 1):
        host = urlsplit(current).hostname or ""
        ips = await resolve(host)
        if ips == []:
            return PageFetch(final_url=current, chain=chain, error="nxdomain")
        if ips and not all(is_public(ip) for ip in ips):
            return PageFetch(final_url=current, chain=chain, blocked=f"{host} points to a private network address")
        request = client.build_request("GET", current, headers={"User-Agent": BROWSER_UA, "Accept": "text/html,*/*;q=0.8"})
        try:
            resp = await client.send(request, stream=True, follow_redirects=False)
        except httpx.ConnectError as exc:
            message = str(exc)
            if "CERTIFICATE_VERIFY_FAILED" in message or "certificate" in message.lower():
                return PageFetch(final_url=current, chain=chain, error=f"certificate: {message[:160]}")
            return PageFetch(final_url=current, chain=chain, error=f"unreachable: {message[:160]}")
        try:
            chain.append(Hop(current, resp.status_code))
            if resp.is_redirect and resp.headers.get("location"):
                current = urljoin(current, resp.headers["location"])
                continue
            content_type = resp.headers.get("content-type", "").split(";")[0].strip().lower()
            download = _download_name(resp, current, content_type)
            html = None
            if content_type in HTML_TYPES and download is None:
                body = bytearray()
                async for chunk in resp.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_BYTES:
                        break
                html = body.decode(resp.encoding or "utf-8", errors="ignore")
            return PageFetch(final_url=current, chain=chain, status=resp.status_code, content_type=content_type, html=html, download=download)
        finally:
            await resp.aclose()
    return PageFetch(final_url=current, chain=chain, error="too many redirects")


@dataclass
class CertInfo:
    issuer: str = ""
    not_before: datetime | None = None
    not_after: datetime | None = None
    error: str | None = None


async def certificate(host: str, port: int = 443) -> CertInfo | None:
    """The site's TLS certificate, or why it failed verification. None when there's no answer at all."""
    if offline() or not host:
        return None
    context = ssl.create_default_context()
    try:
        _, writer = await asyncio.wait_for(asyncio.open_connection(host, port, ssl=context, server_hostname=host), 5)
    except ssl.SSLCertVerificationError as exc:
        return CertInfo(error=exc.verify_message or str(exc))
    except (OSError, asyncio.TimeoutError, ssl.SSLError):
        return None
    try:
        cert = writer.get_extra_info("peercert") or {}
        issuer = dict(item[0] for item in cert.get("issuer", ()))
        return CertInfo(
            issuer=issuer.get("organizationName") or issuer.get("commonName", ""),
            not_before=datetime.fromtimestamp(ssl.cert_time_to_seconds(cert["notBefore"]), tz=timezone.utc),
            not_after=datetime.fromtimestamp(ssl.cert_time_to_seconds(cert["notAfter"]), tz=timezone.utc),
        )
    except (KeyError, ValueError):
        return None
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except (OSError, ssl.SSLError):
            pass
