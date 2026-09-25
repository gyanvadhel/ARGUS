"""Link analysis: heuristics + ARGUS intel + URLhaus + Safe Browsing + VirusTotal + domain age."""
from __future__ import annotations

import asyncio
import base64
import ipaddress
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

from argus_api import config
from argus_api.aggregate import combine
from argus_api.checkers.vt import VT_BASE, vt_stats_signal
from argus_api.http import guarded, make_client, unavailable
from argus_api.models import Signal, Verdict
from argus_api.risk_engine import get_engine

URLHAUS_URL = "https://urlhaus-api.abuse.ch/v1/url/"
SAFE_BROWSING_URL = "https://safebrowsing.googleapis.com/v4/threatMatches:find"
RDAP_URL = "https://rdap.org/domain/"

SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "ow.ly", "cutt.ly", "rb.gy", "grabify.link", "shorturl.at"}
RISKY_TLDS = {"zip", "mov", "xyz", "top", "click", "country", "gq", "tk", "ml", "cf", "work", "support", "rest", "cam", "icu"}
TWO_LEVEL_SUFFIXES = {"co.uk", "org.uk", "ac.uk", "co.in", "org.in", "gov.in", "ac.in", "net.in",
                      "com.au", "co.jp", "com.br", "co.nz", "com.sg"}
BRAND_DOMAINS: dict[str, tuple[str, ...]] = {
    "paypal": ("paypal.com",),
    "amazon": ("amazon.com", "amazon.in", "amazon.co.uk", "amazon.de"),
    "microsoft": ("microsoft.com", "live.com", "office.com", "microsoftonline.com"),
    "apple": ("apple.com", "icloud.com"),
    "google": ("google.com", "gmail.com", "youtube.com"),
    "netflix": ("netflix.com",),
    "facebook": ("facebook.com", "fb.com"),
    "instagram": ("instagram.com",),
    "whatsapp": ("whatsapp.com",),
    "chase": ("chase.com",),
    "wellsfargo": ("wellsfargo.com",),
    "hdfc": ("hdfcbank.com",),
    "icici": ("icicibank.com",),
    "sbi": ("onlinesbi.sbi", "sbi.co.in"),
    "paytm": ("paytm.com",),
}
SAFE_BROWSING_TYPES = {"MALWARE": "Malware", "SOCIAL_ENGINEERING": "Phishing",
                       "UNWANTED_SOFTWARE": "Unwanted software", "POTENTIALLY_HARMFUL_APPLICATION": "Harmful app"}
LOCAL_SEVERITY = {"strong": 90, "medium": 60, "weak": 30}
_LOOKALIKES = [str.maketrans({"0": "o", "1": "l", "3": "e", "5": "s", "4": "a"}),
               str.maketrans({"0": "o", "1": "i", "3": "e", "5": "s", "4": "a"})]


def normalize_url(raw: str) -> str:
    s = raw.strip()
    return s if re.match(r"^[a-z][a-z0-9+.-]*://", s, re.I) else "https://" + s


def host_of(url: str) -> str:
    return (urlparse(normalize_url(url)).hostname or "").lower().rstrip(".")


def registrable_domain(host: str) -> str:
    parts = host.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in TWO_LEVEL_SUFFIXES:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def _is_official(host: str, domains: tuple[str, ...]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def _brand_hits(host: str) -> list[str]:
    tokens = re.split(r"[.\-]", host)
    return [b for b in BRAND_DOMAINS
            if any(t == b or (len(b) >= 6 and t.startswith(b)) for t in tokens)]


def heuristics(url: str) -> Signal:
    parsed = urlparse(url)
    host = host_of(url)
    points = 0
    reasons: list[str] = []
    threat = None

    def flag(n: int, why: str) -> None:
        nonlocal points
        points += n
        reasons.append(why)

    if _is_ip(host):
        flag(35, "Uses a raw IP address instead of a domain name")
    if "@" in parsed.netloc:
        flag(30, "Hides the real destination behind an '@' in the address")
    if "xn--" in host:
        flag(30, "Uses look-alike international characters (punycode)")
    for brand in _brand_hits(host):
        if not _is_official(host, BRAND_DOMAINS[brand]):
            flag(40, f"Mentions {brand.title()} but isn't an official {brand.title()} domain")
            threat = "Phishing"
    if threat is None:
        for table in _LOOKALIKES:
            swapped = host.translate(table)
            if swapped == host:
                continue
            brand = next((b for b in _brand_hits(swapped) if not _is_official(swapped, BRAND_DOMAINS[b])), None)
            if brand:
                flag(45, f"Imitates {brand.title()} by swapping look-alike characters")
                threat = "Phishing"
                break
    if host in SHORTENERS or registrable_domain(host) in SHORTENERS:
        flag(20, "Link shortener hides the final destination")
    tld = host.rsplit(".", 1)[-1] if "." in host else ""
    if tld in RISKY_TLDS:
        flag(15, f"Uses the .{tld} domain ending, popular with scammers")
    if host.count("-") >= 3 or len(host) > 40:
        flag(10, "Unusually long or hyphen-heavy domain name")
    if parsed.scheme == "http":
        flag(10, "Not encrypted (plain http)")

    score = min(points, 100)
    return Signal(
        source="ARGUS heuristics",
        status="suspicious" if score >= 30 else "clean",
        score=score,
        weight=1.0,
        summary=reasons[0] if reasons else "No suspicious patterns in the address",
        evidence={"reasons": reasons, "host": host, "threat_type": threat or "Suspicious link"},
    )


def local_intel(host: str) -> Signal:
    hits = [e for e in get_engine().threat_intel
            if e["type"] == "domain" and (host == e["indicator"].lower() or host.endswith("." + e["indicator"].lower()))]
    if not hits:
        return Signal(source="ARGUS threat intel", status="clean", score=0, weight=0.5, summary="Not on the ARGUS blocklist")
    top = max(hits, key=lambda e: LOCAL_SEVERITY.get(e["severity"], 30))
    score = LOCAL_SEVERITY.get(top["severity"], 30)
    return Signal(
        source="ARGUS threat intel",
        status="malicious" if score >= 60 else "suspicious",
        score=score,
        weight=1.0,
        summary=top["notes"],
        evidence={"indicator": top["indicator"], "category": top["category"], "threat_type": top["category"]},
    )


async def urlhaus(client: httpx.AsyncClient, url: str) -> Signal:
    key = config.key("ABUSECH_AUTH_KEY")
    if not key:
        return unavailable("URLhaus", "ABUSECH_AUTH_KEY")
    r = await client.post(URLHAUS_URL, data={"url": url}, headers={"Auth-Key": key})
    r.raise_for_status()
    body = r.json()
    if body.get("query_status") == "ok":
        threat = (body.get("threat") or "malware").replace("_", " ")
        return Signal(source="URLhaus", status="malicious", score=95, weight=1.5, authoritative=True,
                      summary=f"Listed on URLhaus as {threat} ({body.get('url_status', 'unknown')})",
                      evidence={"threat": threat, "url_status": body.get("url_status"),
                                "tags": body.get("tags") or [], "threat_type": "Malware distribution"})
    return Signal(source="URLhaus", status="clean", score=0, weight=1.0, summary="Not listed on URLhaus")


async def safe_browsing(client: httpx.AsyncClient, url: str) -> Signal:
    key = config.key("GOOGLE_SAFE_BROWSING_KEY")
    if not key:
        return unavailable("Google Safe Browsing", "GOOGLE_SAFE_BROWSING_KEY")
    body = {
        "client": {"clientId": "argus", "clientVersion": "1.0"},
        "threatInfo": {"threatTypes": list(SAFE_BROWSING_TYPES), "platformTypes": ["ANY_PLATFORM"],
                       "threatEntryTypes": ["URL"], "threatEntries": [{"url": url}]},
    }
    r = await client.post(SAFE_BROWSING_URL, params={"key": key}, json=body)
    r.raise_for_status()
    matches = r.json().get("matches") or []
    if matches:
        label = SAFE_BROWSING_TYPES.get(matches[0].get("threatType"), "Unsafe site")
        return Signal(source="Google Safe Browsing", status="malicious", score=95, weight=1.5, authoritative=True,
                      summary=f"Google flags this as {label.lower()}",
                      evidence={"threat_type": label, "matches": [m.get("threatType") for m in matches]})
    return Signal(source="Google Safe Browsing", status="clean", score=0, weight=1.0,
                  summary="Google Safe Browsing has no warnings")


async def virustotal_url(client: httpx.AsyncClient, url: str) -> Signal:
    key = config.key("VIRUSTOTAL_API_KEY")
    if not key:
        return unavailable("VirusTotal", "VIRUSTOTAL_API_KEY")
    url_id = base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")
    r = await client.get(f"{VT_BASE}/urls/{url_id}", headers={"x-apikey": key})
    if r.status_code == 404:
        return Signal(source="VirusTotal", status="unknown", score=0, weight=0,
                      summary="VirusTotal has no record of this link yet")
    r.raise_for_status()
    return vt_stats_signal("VirusTotal", r.json()["data"]["attributes"]["last_analysis_stats"], "link")


async def domain_age(client: httpx.AsyncClient, host: str) -> Signal:
    source = "Domain age (RDAP)"
    if not host or _is_ip(host):
        return Signal(source=source, status="unknown", score=0, weight=0, summary="No domain name to look up")
    domain = registrable_domain(host)
    r = await client.get(RDAP_URL + domain)
    if r.status_code == 404:
        return Signal(source=source, status="unknown", score=0, weight=0,
                      summary="No public registration record found", evidence={"domain": domain})
    r.raise_for_status()
    events = r.json().get("events") or []
    registered = next((e.get("eventDate") for e in events if e.get("eventAction") == "registration"), None)
    if not registered:
        return Signal(source=source, status="unknown", score=0, weight=0,
                      summary="Registration date isn't published", evidence={"domain": domain})
    created = datetime.fromisoformat(registered.replace("Z", "+00:00"))
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    days = max(0, (datetime.now(timezone.utc) - created).days)
    evidence = {"domain": domain, "registered": created.date().isoformat(), "age_days": days}
    if days < 30:
        return Signal(source=source, status="suspicious", score=65, weight=1.0,
                      summary=f"Domain registered only {days} day{'s' if days != 1 else ''} ago",
                      evidence={**evidence, "threat_type": "Newly registered domain"})
    if days < 180:
        return Signal(source=source, status="suspicious", score=35, weight=1.0,
                      summary=f"Domain is only {days} days old",
                      evidence={**evidence, "threat_type": "Newly registered domain"})
    years = days // 365
    return Signal(source=source, status="clean", score=0, weight=0.8,
                  summary=f"Domain has existed for {years} year{'s' if years != 1 else ''}" if years
                  else f"Domain is {days} days old",
                  evidence=evidence)


async def check_url(raw: str) -> Verdict:
    url = normalize_url(raw)
    host = host_of(url)
    async with make_client() as client:
        remote = await asyncio.gather(
            guarded("URLhaus", urlhaus(client, url)),
            guarded("Google Safe Browsing", safe_browsing(client, url)),
            guarded("VirusTotal", virustotal_url(client, url)),
            guarded("Domain age (RDAP)", domain_age(client, host)),
        )
    return combine("url", url, [heuristics(url), local_intel(host), *remote])
