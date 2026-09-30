"""Certificate history (crt.sh): when a site got its first security certificate, as a stand-in for its age.

Keyless. Every certificate a public authority issues is logged, so the first one shows roughly when a site went
live. It's only asked when the domain registry has no answer (many country domains publish no dates), and never
for well-known sites or shared platforms, whose history is huge or not their own.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

import httpx

from argus_api.intel import netcheck
from argus_api.models import Signal

CRT_URL = "https://crt.sh/"
SOURCE = "Certificate history (crt.sh)"
CACHE_SECONDS = 24 * 3600
_cache: dict[str, tuple[float, Signal]] = {}


def clear_cache() -> None:
    _cache.clear()


def needed(rdap: Signal) -> bool:
    """True when the registry lookup gave no age, so certificate history is worth asking."""
    return rdap.status not in ("clean", "suspicious")


def _parse(stamp: str) -> datetime | None:
    try:
        when = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def summarize(domain: str, rows: list) -> Signal:
    dates = [d for d in (_parse(r.get("not_before", "")) for r in rows if isinstance(r, dict)) if d]
    if not dates:
        return Signal(source=SOURCE, status="unknown", score=0, weight=0,
                      summary="No security certificates on record for this site", evidence={"domain": domain})
    first = min(dates)
    days = max(0, (datetime.now(timezone.utc) - first).days)
    evidence = {"domain": domain, "first_certificate": first.date().isoformat(), "age_days": days}
    ago = f"{days} day{'s' if days != 1 else ''} ago"
    if days < 14:
        return Signal(source=SOURCE, status="suspicious", score=45, weight=1.0,
                      summary=f"Its first security certificate was issued only {ago}, so the site is brand new",
                      evidence={**evidence, "threat_type": "Newly created site"})
    if days < 90:
        return Signal(source=SOURCE, status="suspicious", score=30, weight=1.0,
                      summary=f"Its first security certificate was issued {ago}, so the site is new",
                      evidence={**evidence, "threat_type": "Newly created site"})
    years = days // 365
    age = f"{years} year{'s' if years != 1 else ''}" if years else f"{days} days"
    return Signal(source=SOURCE, status="clean", score=0, weight=0.5,
                  summary=f"Has had security certificates for {age}", evidence=evidence)


async def cert_age_signal(client: httpx.AsyncClient, domain: str) -> Signal | None:
    if netcheck.offline():
        return None
    cached = _cache.get(domain)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]
    r = await client.get(CRT_URL, params={"q": domain, "output": "json", "deduplicate": "Y"}, timeout=9)
    r.raise_for_status()
    rows = r.json()
    signal = summarize(domain, rows if isinstance(rows, list) else [])
    _cache[domain] = (time.time(), signal)
    return signal
