"""AlienVault OTX: whether security researchers have named a site or file in a published threat report ("pulse").

Optional (OTX_API_KEY, from a free account). A pulse is a researcher's list of the addresses and files a campaign
used, so one mention is a warning and several are strong evidence. Well-known sites also turn up in pulses (as
the brand being copied, say), which is why the caller skips them and why OTX's own known-good list wins here.
"""
from __future__ import annotations

import time
from urllib.parse import quote

import httpx

from argus_api import config
from argus_api.http import unavailable
from argus_api.intel import netcheck
from argus_api.models import Signal

OTX_BASE = "https://otx.alienvault.com/api/v1/indicators/"
KEY_NAME = "OTX_API_KEY"
SOURCE = "AlienVault OTX"
CACHE_SECONDS = 6 * 3600
_cache: dict[str, tuple[float, Signal]] = {}


def clear_cache() -> None:
    _cache.clear()


def _reports(n: int) -> str:
    return f"{n} threat report{'s' if n != 1 else ''}"


def summarize(kind: str, data: dict) -> Signal:
    info = data.get("pulse_info") or {}
    count = int(info.get("count") or 0)
    names = [str(p.get("name"))[:80] for p in (info.get("pulses") or [])[:3] if p.get("name")]
    evidence = {"pulses": count, "examples": names}
    what = "This file" if kind == "file" else "This site"
    if data.get("validation"):
        return Signal(source=SOURCE, status="clean", score=0, weight=0.5,
                      summary="On OTX's list of known legitimate sites", evidence=evidence)
    if count and kind == "file":
        return Signal(source=SOURCE, status="malicious", score=90, weight=1.3,
                      summary=f"{what} appears in {_reports(count)} from security researchers",
                      evidence={**evidence, "threat_type": "Known malware"})
    if count >= 3:
        return Signal(source=SOURCE, status="malicious", score=82, weight=1.2,
                      summary=f"{what} is named in {_reports(count)} from security researchers",
                      evidence={**evidence, "threat_type": "Reported in threat intelligence"})
    if count:
        return Signal(source=SOURCE, status="suspicious", score=40 if count == 1 else 60, weight=1.0,
                      summary=f"{what} is named in {_reports(count)} from security researchers",
                      evidence={**evidence, "threat_type": "Reported in threat intelligence"})
    return Signal(source=SOURCE, status="clean", score=0, weight=0.5,
                  summary="Not named in any OTX threat report", evidence=evidence)


async def otx_signal(client: httpx.AsyncClient, kind: str, indicator: str) -> Signal:
    """`kind` is OTX's indicator type: "domain", "hostname" or "file" (a hash)."""
    key = config.key(KEY_NAME)
    if not key:
        return unavailable(SOURCE, KEY_NAME)
    if netcheck.offline():
        return Signal(source=SOURCE, status="unknown", score=0, weight=0, summary="OTX lookups are off in offline mode")
    cache_key = f"{kind}:{indicator.lower()}"
    cached = _cache.get(cache_key)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]
    r = await client.get(f"{OTX_BASE}{kind}/{quote(indicator, safe='')}/general", headers={"X-OTX-API-KEY": key})
    if r.status_code in (400, 404):
        return Signal(source=SOURCE, status="unknown", score=0, weight=0, summary="OTX has no record of this")
    r.raise_for_status()
    body = r.json()
    signal = summarize(kind, body if isinstance(body, dict) else {})
    _cache[cache_key] = (time.time(), signal)
    return signal
