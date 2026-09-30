"""AbuseIPDB: whether the server that sent an email has been reported for spam, phishing or attacks.

Optional (ABUSEIPDB_API_KEY, from a free account; 1,000 lookups a day, so answers are cached for a day). The
sending server is read from the email's own headers: the SPF check's client-ip, or else the first public address
in its Received lines. Big mail providers send for everyone, so a clean result never vouches for the email.
"""
from __future__ import annotations

import ipaddress
import re
import time
from email.message import EmailMessage

from argus_api import config
from argus_api.http import make_client, unavailable
from argus_api.intel import netcheck
from argus_api.models import Signal

ABUSEIPDB_URL = "https://api.abuseipdb.com/api/v2/check"
KEY_NAME = "ABUSEIPDB_API_KEY"
SOURCE = "Sending server (AbuseIPDB)"
CACHE_SECONDS = 24 * 3600
_cache: dict[str, tuple[float, Signal]] = {}
_CLIENT_IP = re.compile(r"client-ip=([0-9a-fA-F:.]+)")
_BRACKETED = re.compile(r"\[([0-9a-fA-F:.]+)\]|\(([0-9.]{7,15})\)")


def clear_cache() -> None:
    _cache.clear()


def _public(candidate: str) -> str | None:
    try:
        addr = ipaddress.ip_address(candidate.strip().removeprefix("IPv6:"))
    except ValueError:
        return None
    return str(addr) if addr.is_global and not addr.is_multicast else None


def sender_ip(msg: EmailMessage) -> str | None:
    """The address of the server that handed the email to the recipient's provider, if the headers show it."""
    for header in msg.get_all("Received-SPF") or []:
        match = _CLIENT_IP.search(str(header))
        if match and _public(match.group(1)):
            return _public(match.group(1))
    for header in msg.get_all("Received") or []:
        text = str(header)
        origin = text.split(" by ", 1)[0] if " by " in text else text
        for bracketed, parenthesized in _BRACKETED.findall(origin):
            found = _public(bracketed or parenthesized)
            if found:
                return found
    return None


def summarize(data: dict) -> Signal:
    ip = str(data.get("ipAddress") or "")
    score = int(data.get("abuseConfidenceScore") or 0)
    reports = int(data.get("totalReports") or 0)
    evidence = {"ip": ip, "abuse_confidence": score, "reports": reports, "isp": data.get("isp"),
                "country": data.get("countryCode"), "usage": data.get("usageType")}
    plural = f"{reports} report{'s' if reports != 1 else ''}"
    if data.get("isWhitelisted"):
        return Signal(source=SOURCE, status="clean", score=0, weight=0.3,
                      summary=f"Sent from a known legitimate server ({data.get('isp') or ip})", evidence=evidence)
    if score >= 75:
        return Signal(source=SOURCE, status="malicious", score=78, weight=1.1,
                      summary=f"Sent from a server widely reported for spam or attacks ({score}% abuse confidence, {plural})",
                      evidence={**evidence, "threat_type": "Spam server"})
    if score >= 25:
        return Signal(source=SOURCE, status="suspicious", score=40, weight=1.0,
                      summary=f"Sent from a server with abuse reports ({score}% abuse confidence, {plural})",
                      evidence={**evidence, "threat_type": "Spam server"})
    return Signal(source=SOURCE, status="clean", score=0, weight=0.3,
                  summary=f"The sending server has no serious abuse reports ({score}% abuse confidence)",
                  evidence=evidence)


async def sender_ip_signal(ip: str | None) -> Signal | None:
    if not ip:
        return None
    key = config.key(KEY_NAME)
    if not key:
        return unavailable(SOURCE, KEY_NAME)
    if netcheck.offline():
        return Signal(source=SOURCE, status="unknown", score=0, weight=0, summary="AbuseIPDB lookups are off in offline mode")
    cached = _cache.get(ip)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]
    try:
        async with make_client() as client:
            r = await client.get(ABUSEIPDB_URL, params={"ipAddress": ip, "maxAgeInDays": 90},
                                 headers={"Key": key, "Accept": "application/json"}, timeout=8)
            r.raise_for_status()
            body = r.json()
    except Exception as exc:  # noqa: BLE001 - any failure becomes an "error" signal
        return Signal(source=SOURCE, status="error", score=0, weight=0, summary=f"AbuseIPDB couldn't be reached ({type(exc).__name__})")
    signal = summarize((body or {}).get("data") or {})
    _cache[ip] = (time.time(), signal)
    return signal
