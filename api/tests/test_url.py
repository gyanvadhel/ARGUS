from datetime import datetime, timedelta, timezone

import httpx
import respx

from argus_api.checkers import url as u
from argus_api.http import make_client


def test_normalize_url_adds_https():
    assert u.normalize_url("example.com/x") == "https://example.com/x"
    assert u.normalize_url("http://a.com") == "http://a.com"


def test_heuristics_flags_brand_impersonation():
    s = u.heuristics("http://paypal-security-alert.net/verify")
    assert s.status == "suspicious" and s.score >= 40
    assert any("PayPal" in r for r in s.evidence["reasons"])


def test_heuristics_flags_lookalike_characters():
    assert u.heuristics("https://amaz0n-support.com").score >= 45


def test_heuristics_trusts_real_brand_domain():
    s = u.heuristics("https://www.paypal.com/signin")
    assert (s.status, s.score) == ("clean", 0)


def test_heuristics_flags_raw_ip():
    assert u.heuristics("http://185.12.4.9/login").score >= 35


def test_local_intel_hit():
    s = u.local_intel("paypal-security-alert.net")
    assert s.status == "malicious" and s.score == 90


async def test_urlhaus_hit(monkeypatch):
    monkeypatch.setenv("ABUSECH_AUTH_KEY", "k")
    with respx.mock:
        respx.post("https://urlhaus-api.abuse.ch/v1/url/").respond(
            json={"query_status": "ok", "threat": "malware_download", "url_status": "online", "tags": ["emotet"]})
        async with make_client() as c:
            s = await u.urlhaus(c, "http://bad.example/x.exe")
    assert s.status == "malicious" and s.authoritative


async def test_urlhaus_without_key_is_unavailable():
    async with make_client() as c:
        s = await u.urlhaus(c, "http://x.example")
    assert s.status == "unavailable"


async def test_safe_browsing_match(monkeypatch):
    monkeypatch.setenv("GOOGLE_SAFE_BROWSING_KEY", "k")
    with respx.mock:
        respx.post(url__startswith="https://safebrowsing.googleapis.com/v4/threatMatches:find").respond(
            json={"matches": [{"threatType": "SOCIAL_ENGINEERING"}]})
        async with make_client() as c:
            s = await u.safe_browsing(c, "http://x.example")
    assert s.status == "malicious" and s.evidence["threat_type"] == "Phishing"


async def test_virustotal_url_counts_engines(monkeypatch):
    monkeypatch.setenv("VIRUSTOTAL_API_KEY", "k")
    stats = {"malicious": 7, "suspicious": 1, "harmless": 60, "undetected": 20}
    with respx.mock:
        respx.get(url__startswith="https://www.virustotal.com/api/v3/urls/").respond(
            json={"data": {"attributes": {"last_analysis_stats": stats}}})
        async with make_client() as c:
            s = await u.virustotal_url(c, "http://x.example")
    assert s.status == "malicious" and "7/88" in s.summary


async def test_virustotal_url_unknown(monkeypatch):
    monkeypatch.setenv("VIRUSTOTAL_API_KEY", "k")
    with respx.mock:
        respx.get(url__startswith="https://www.virustotal.com/api/v3/urls/").respond(404, json={"error": {}})
        async with make_client() as c:
            s = await u.virustotal_url(c, "http://x.example")
    assert s.status == "unknown"


async def test_domain_age_new_domain():
    registered = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
    with respx.mock:
        respx.get("https://rdap.org/domain/brand-new.xyz").respond(
            json={"events": [{"eventAction": "registration", "eventDate": registered}]})
        async with make_client() as c:
            s = await u.domain_age(c, "login.brand-new.xyz")
    assert (s.status, s.score) == ("suspicious", 65)


async def test_domain_age_old_domain():
    with respx.mock:
        respx.get("https://rdap.org/domain/example.com").respond(
            json={"events": [{"eventAction": "registration", "eventDate": "1995-08-14T04:00:00Z"}]})
        async with make_client() as c:
            s = await u.domain_age(c, "www.example.com")
    assert s.status == "clean"


async def test_check_url_survives_failures():
    with respx.mock:
        respx.get(url__startswith="https://rdap.org/").mock(side_effect=httpx.ConnectTimeout("slow"))
        v = await u.check_url("paypal-security-alert.net/verify")
    statuses = {s.source: s.status for s in v.signals}
    assert v.kind == "url"
    assert statuses["URLhaus"] == "unavailable"
    assert statuses["Domain age (RDAP)"] == "error"
    assert v.score >= 60
