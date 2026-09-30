"""Free extra threat sources: AlienVault OTX, AbuseIPDB (email senders) and certificate history (crt.sh)."""
from datetime import datetime, timedelta, timezone
from email import policy
from email.parser import Parser

import httpx
import pytest
import respx

from argus_api.intel import abuseipdb, certs, otx
from argus_api.models import Signal


@pytest.fixture
def online(monkeypatch):
    monkeypatch.delenv("ARGUS_OFFLINE", raising=False)
    otx.clear_cache()
    abuseipdb.clear_cache()
    certs.clear_cache()


@pytest.fixture
def keys(monkeypatch, online):
    monkeypatch.setenv(otx.KEY_NAME, "otx-key")
    monkeypatch.setenv(abuseipdb.KEY_NAME, "abuse-key")


# --- AlienVault OTX ------------------------------------------------------------------------------------------------
def pulses(n, validation=None):
    return {"pulse_info": {"count": n, "pulses": [{"name": f"Phishing campaign {i}"} for i in range(n)]},
            "validation": validation or []}


async def test_otx_needs_a_key(online):
    async with httpx.AsyncClient() as c:
        s = await otx.otx_signal(c, "domain", "evil.example")
    assert s.status == "unavailable" and otx.KEY_NAME in s.summary


async def test_otx_site_named_in_several_threat_reports_is_high_risk(keys):
    with respx.mock:
        route = respx.get(f"{otx.OTX_BASE}domain/evil.example/general").respond(json=pulses(4))
        async with httpx.AsyncClient() as c:
            s = await otx.otx_signal(c, "domain", "evil.example")
    assert s.status == "malicious" and "4 threat reports" in s.summary
    assert route.calls[0].request.headers["X-OTX-API-KEY"] == "otx-key"


async def test_otx_one_report_is_a_warning(keys):
    with respx.mock:
        respx.get(f"{otx.OTX_BASE}domain/odd.example/general").respond(json=pulses(1))
        async with httpx.AsyncClient() as c:
            s = await otx.otx_signal(c, "domain", "odd.example")
    assert s.status == "suspicious" and "1 threat report" in s.summary


async def test_otx_known_good_list_wins_over_reports(keys):
    with respx.mock:
        respx.get(f"{otx.OTX_BASE}domain/big.example/general").respond(
            json=pulses(9, validation=[{"source": "majestic", "message": "Whitelisted domain"}]))
        async with httpx.AsyncClient() as c:
            s = await otx.otx_signal(c, "domain", "big.example")
    assert s.status == "clean"


async def test_otx_no_reports_is_clean_and_cached(keys):
    with respx.mock:
        route = respx.get(f"{otx.OTX_BASE}domain/fine.example/general").respond(json=pulses(0))
        async with httpx.AsyncClient() as c:
            first = await otx.otx_signal(c, "domain", "fine.example")
            await otx.otx_signal(c, "domain", "fine.example")
    assert first.status == "clean" and route.call_count == 1


async def test_otx_a_file_in_a_threat_report_is_known_malware(keys):
    with respx.mock:
        respx.get(f"{otx.OTX_BASE}file/abc123/general").respond(json=pulses(1))
        async with httpx.AsyncClient() as c:
            s = await otx.otx_signal(c, "file", "abc123")
    assert s.status == "malicious" and s.score >= 85


# --- AbuseIPDB: the server that sent an email ------------------------------------------------------------------------
def parse(raw):
    return Parser(policy=policy.default).parsestr(raw)


def test_sender_ip_comes_from_the_spf_check_first():
    msg = parse("Received-SPF: pass (google.com: domain of a@b.example designates 209.85.220.41 as permitted sender) "
                "client-ip=209.85.220.41;\nReceived: from x ([8.8.4.4]) by mx\n\nhi")
    assert abuseipdb.sender_ip(msg) == "209.85.220.41"


def test_sender_ip_falls_back_to_received_and_skips_private_addresses():
    msg = parse("Received: from inner ([10.0.0.5]) by relay\nReceived: from mail.sender.example ([8.8.4.4]) by mx\n\nhi")
    assert abuseipdb.sender_ip(msg) == "8.8.4.4"
    assert abuseipdb.sender_ip(parse("From: a@b.example\n\nno servers here")) is None


def report(score, reports=10, whitelisted=False):
    return {"data": {"ipAddress": "203.0.113.9", "abuseConfidenceScore": score, "totalReports": reports,
                     "isWhitelisted": whitelisted, "isp": "Example ISP", "countryCode": "IN", "usageType": "Data Center"}}


async def test_no_sending_server_means_no_signal(keys):
    assert await abuseipdb.sender_ip_signal(None) is None


async def test_a_heavily_reported_sender_is_high_risk(keys):
    with respx.mock:
        route = respx.get(abuseipdb.ABUSEIPDB_URL).respond(json=report(92, 140))
        s = await abuseipdb.sender_ip_signal("203.0.113.9")
    assert s.status == "malicious" and "92%" in s.summary and "140 reports" in s.summary
    assert route.calls[0].request.headers["Key"] == "abuse-key"


async def test_some_reports_are_a_warning_and_few_are_clean(keys):
    with respx.mock:
        respx.get(abuseipdb.ABUSEIPDB_URL).respond(json=report(40))
        mid = await abuseipdb.sender_ip_signal("203.0.113.9")
    abuseipdb.clear_cache()
    with respx.mock:
        respx.get(abuseipdb.ABUSEIPDB_URL).respond(json=report(3, 1))
        low = await abuseipdb.sender_ip_signal("203.0.113.9")
    assert mid.status == "suspicious" and low.status == "clean"


async def test_a_known_good_sender_is_clean(keys):
    with respx.mock:
        respx.get(abuseipdb.ABUSEIPDB_URL).respond(json=report(80, whitelisted=True))
        s = await abuseipdb.sender_ip_signal("203.0.113.9")
    assert s.status == "clean"


async def test_abuseipdb_needs_a_key(online):
    s = await abuseipdb.sender_ip_signal("203.0.113.9")
    assert s.status == "unavailable" and abuseipdb.KEY_NAME in s.summary


# --- Certificate history (crt.sh) ------------------------------------------------------------------------------------
def certs_since(days):
    first = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")
    later = (datetime.now(timezone.utc) - timedelta(days=max(0, days - 1))).strftime("%Y-%m-%dT%H:%M:%S")
    return [{"not_before": later}, {"not_before": first}]


@pytest.mark.parametrize("days, status, score", [(3, "suspicious", 45), (20, "suspicious", 30), (800, "clean", 0)])
async def test_certificate_history_shows_how_new_a_site_is(online, days, status, score):
    with respx.mock:
        respx.get(url__startswith=certs.CRT_URL).respond(json=certs_since(days))
        async with httpx.AsyncClient() as c:
            s = await certs.cert_age_signal(c, "shop.example")
    assert (s.status, s.score) == (status, score)


async def test_no_certificates_is_unknown(online):
    with respx.mock:
        respx.get(url__startswith=certs.CRT_URL).respond(json=[])
        async with httpx.AsyncClient() as c:
            s = await certs.cert_age_signal(c, "plain.example")
    assert s.status == "unknown" and s.weight == 0


def test_certificate_history_is_only_asked_when_the_registry_had_no_answer():
    def rdap(status):
        return Signal(source="Domain age (RDAP)", status=status, score=0, weight=0, summary="...")
    assert not certs.needed(rdap("clean")) and not certs.needed(rdap("suspicious"))
    assert certs.needed(rdap("unknown")) and certs.needed(rdap("error"))


async def test_certificate_history_is_skipped_offline():
    async with httpx.AsyncClient() as c:
        assert await certs.cert_age_signal(c, "shop.example") is None


# --- wired into link, email and file checks --------------------------------------------------------------------------
from argus_api.checkers import email as email_checker  # noqa: E402
from argus_api.checkers import file as file_checker  # noqa: E402
from argus_api.checkers import url as url_checker  # noqa: E402
from argus_api.intel import netcheck  # noqa: E402
from tests.test_url import live_feeds  # noqa: E402,F401 - shared fixture: fake threat feeds


@pytest.fixture
def net(monkeypatch, keys, live_feeds):
    """Online, with a fake internet: every page exists and every other HTTP call must be mocked by the test."""
    async def resolve(host):
        return ["93.184.216.34"]

    async def certificate(host, port=443):
        return None

    async def fetch_page(client, url):
        return netcheck.PageFetch(final_url=url, status=200, content_type="text/html", html="<p>hi</p>")

    monkeypatch.setattr(netcheck, "resolve", resolve)
    monkeypatch.setattr(netcheck, "certificate", certificate)
    monkeypatch.setattr(netcheck, "fetch_page", fetch_page)
    with respx.mock(assert_all_called=False) as router:
        router.get(url__startswith="https://rdap.org/").respond(404)
        router.get(url__startswith=certs.CRT_URL).respond(json=[])
        yield router


def by_source(verdict):
    return {s.source: s for s in verdict.signals}


async def test_link_checks_ask_otx_about_the_domain(net):
    route = net.get(f"{otx.OTX_BASE}domain/prize-desk.example/general").respond(json=pulses(5))
    v = await url_checker.check_url("https://claim.prize-desk.example/win")
    assert route.called and by_source(v)[otx.SOURCE].status == "malicious"


async def test_pages_on_shared_platforms_are_looked_up_by_their_own_address(net):
    route = net.get(f"{otx.OTX_BASE}hostname/fake-bank.pages.dev/general").respond(json=pulses(0))
    await url_checker.check_url("https://fake-bank.pages.dev/")
    assert route.called


async def test_well_known_sites_are_not_sent_to_otx(net):
    route = net.get(url__startswith=otx.OTX_BASE).respond(json=pulses(9))
    v = await url_checker.check_url("https://www.paypal.com/signin")
    assert not route.called and otx.SOURCE not in by_source(v)


async def test_certificate_history_fills_in_when_the_registry_has_no_date(net):
    net.get(url__startswith=otx.OTX_BASE).respond(json=pulses(0))
    net.get(url__startswith=certs.CRT_URL).respond(json=certs_since(2))
    v = await url_checker.check_url("https://new-shop.example/")
    assert by_source(v)[certs.SOURCE].status == "suspicious"


async def test_certificate_history_is_not_asked_when_the_registry_answers(net):
    net.get(url__startswith=otx.OTX_BASE).respond(json=pulses(0))
    net.get(url__startswith="https://rdap.org/").respond(  # replaces the fixture's "no record" answer
        json={"events": [{"eventAction": "registration", "eventDate": "2001-01-01T00:00:00Z"}]})
    crt = net.get(url__startswith=certs.CRT_URL).respond(json=certs_since(2))
    v = await url_checker.check_url("https://old-shop.example/")
    assert not crt.called and certs.SOURCE not in by_source(v)


SPAM_SERVER_MAIL = """From: Prize Team <win@prize-desk.example>
To: you@example.com
Subject: You won
Received-SPF: pass (mx.example.com: domain of win@prize-desk.example designates 185.220.101.4 as permitted sender) client-ip=185.220.101.4;

Claim your prize today."""


async def test_email_checks_ask_about_the_sending_server(net):
    route = net.get(abuseipdb.ABUSEIPDB_URL).respond(json=report(97, 300))
    v = await email_checker.check_email(SPAM_SERVER_MAIL)
    assert route.calls[0].request.url.params["ipAddress"] == "185.220.101.4"
    assert by_source(v)[abuseipdb.SOURCE].status == "malicious"


async def test_emails_without_server_headers_skip_the_lookup(net):
    v = await email_checker.check_email("From: a@b.example\nSubject: hi\n\nlunch at noon?")
    assert abuseipdb.SOURCE not in by_source(v)


async def test_file_checks_ask_otx_about_the_fingerprint(net):
    data = b"just some bytes"
    sha = __import__("hashlib").sha256(data).hexdigest()
    route = net.get(f"{otx.OTX_BASE}file/{sha}/general").respond(json=pulses(2))
    v = await file_checker.check_file("invoice.bin", data)
    assert route.called and by_source(v)[otx.SOURCE].status == "malicious"
