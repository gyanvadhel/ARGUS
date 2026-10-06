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


async def test_phone_numbers_inside_messages_are_checked():
    v = await check_text("Your parcel is held. Call 1 800 555 0142 now to release it.")
    phone = next(s for s in v.signals if s.source == "Phone: +18005550142")
    assert phone.status == "malicious"
    assert v.level == "HIGH RISK"


async def test_links_on_the_same_host_are_checked_once():
    with respx.mock:
        v = await check_text("See http://evil.xyz/a and also http://evil.xyz/b")
    assert [s.source for s in v.signals].count("Link: evil.xyz") == 1


from tests.test_url import live_feeds, web  # noqa: E402,F401 - shared fixtures: fake feeds and a fake internet


async def test_text_whose_links_all_go_to_verified_sites_is_verified(live_feeds, web):
    v = await check_text("See you at noon, the place is on https://www.google.com/")
    assert (v.level, v.verified) == ("SAFE", True)


async def test_a_famous_link_does_not_vouch_for_a_scam_text(live_feeds, web):
    v = await check_text("URGENT: your account has been suspended. Verify your password at https://www.google.com/ "
                         "or you will be arrested.")
    assert v.verified is False and v.score >= 60


from argus_api.checkers.text import bank_mobile_signal


def test_bank_asking_you_to_call_a_mobile_is_flagged():
    s = bank_mobile_signal("Dear customer your SBI account KYC is pending. Call 9876543210 now to avoid blocking.")
    assert s is not None and s.status == "suspicious"
    assert "personal mobile" in s.summary


async def test_bank_mobile_rule_reaches_the_text_verdict():
    v = await check_text("Dear customer your SBI account KYC is pending. Call 9876543210 now to avoid blocking.")
    assert any(s.source == "Bank call-back rule" for s in v.signals)


def test_bank_text_with_a_1600_line_is_not_flagged():
    assert bank_mobile_signal("Your HDFC account statement is ready. Call 1600 202 6161 for help.") is None


def test_chat_with_a_mobile_number_is_not_flagged():
    assert bank_mobile_signal("Call me on 9876543210 when you reach") is None
