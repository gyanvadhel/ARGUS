import respx

from argus_api.checkers.text import check_text, extract_urls, intel_signal


def test_extract_urls_finds_schemes_www_and_bare_domains():
    text = "Go to https://evil.example.com/login now, or www.test.com. Also paypal-security-alert.net/verify"
    assert extract_urls(text) == ["https://evil.example.com/login", "www.test.com", "paypal-security-alert.net/verify"]


def test_extract_urls_ignores_email_addresses():
    assert extract_urls("mail bob@gmail.com please") == []


async def test_scam_text_scores_high():
    v = await check_text("URGENT: your account has been suspended. Verify your password and send gift cards "
                         "immediately or you will be arrested.")
    assert v.kind == "text"
    assert v.score >= 60
    rules = next(s for s in v.signals if s.source == "Scam phrase rules")
    assert rules.status == "suspicious"


async def test_benign_text_is_safe():
    v = await check_text("Hey are we still on for lunch tomorrow at noon?")
    assert v.level == "SAFE"


async def test_links_inside_messages_are_scanned():
    with respx.mock:  # every outbound call is unmocked -> error signals, no real network
        v = await check_text("Verify now at http://paypal-security-alert.net/verify")
    assert any(s.source == "Link: paypal-security-alert.net" for s in v.signals)


def test_intel_hit_on_known_scam_number():
    s = intel_signal("please call 1-800-555-0142 right away")
    assert s.status == "malicious"
