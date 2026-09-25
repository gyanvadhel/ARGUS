from email import policy
from email.parser import Parser

import respx

from argus_api.checkers.email import check_email, header_signal, parse_auth_results

SPOOFED = """From: "PayPal Security" <security@paypa1-security.com>
Reply-To: refunds@secure-helpdesk.xyz
To: you@example.com
Subject: Final notice: account suspended
Authentication-Results: mx.example.com; spf=fail smtp.mailfrom=paypa1-security.com; dkim=none; dmarc=fail

Dear customer, we detected an unusual sign-in. Verify your password immediately."""

CLEAN = """From: Alice <alice@example.com>
To: you@example.com
Subject: lunch
Authentication-Results: mx.example.com; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com; dmarc=pass

Hey are we still on for lunch tomorrow at noon?"""

HTML_ONLY = """From: Shop <news@shop.example>
To: you@example.com
Subject: deal
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<p>Your parcel is waiting. <a href="http://paypal-security-alert.net/login">Track it</a></p>"""


def parse(raw):
    return Parser(policy=policy.default).parsestr(raw)


def test_parse_auth_results():
    assert parse_auth_results(parse(CLEAN)) == {"spf": "pass", "dkim": "pass", "dmarc": "pass"}
    assert parse_auth_results(parse(SPOOFED)) == {"spf": "fail", "dkim": "none", "dmarc": "fail"}


def test_spoofed_headers_flagged():
    s = header_signal(parse(SPOOFED))
    assert s.status == "suspicious" and s.score >= 80
    assert any("secure-helpdesk.xyz" in r for r in s.evidence["reasons"])
    assert any("PayPal" in r for r in s.evidence["reasons"])


async def test_clean_email_is_safe():
    v = await check_email(CLEAN)
    assert v.kind == "email"
    assert v.level == "SAFE"
    assert v.subject == "lunch"


async def test_spoofed_email_scores_high():
    v = await check_email(SPOOFED)
    assert v.score >= 60


async def test_links_in_html_are_scanned():
    with respx.mock:
        v = await check_email(HTML_ONLY)
    assert any(s.source == "Link: paypal-security-alert.net" for s in v.signals)


RECEIPT = """From: PayPal <service@paypal.com>
To: you@example.com
Subject: Your receipt
Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=paypal.com; dkim=pass header.d=paypal.com; dmarc=pass

You sent $20.00 USD to Alice. Thanks for using PayPal."""

STRANGER_ON_GMAIL = RECEIPT.replace("PayPal <service@paypal.com>", "Dave <dave.prizes@gmail.com>") \
    .replace("paypal.com", "gmail.com")


async def test_authenticated_mail_from_a_well_known_sender_is_verified():
    v = await check_email(RECEIPT)
    assert (v.level, v.verified) == ("SAFE", True)
    sender = next(s for s in v.signals if s.source == "Sender authentication")
    assert sender.trust >= 0.5 and "paypal.com" in sender.summary


async def test_authentication_alone_does_not_vouch_for_a_stranger():
    v = await check_email(CLEAN)  # passes SPF/DKIM/DMARC, but nobody knows example.com
    assert (v.level, v.verified) == ("SAFE", False)


async def test_free_mail_accounts_are_never_vouched_for():
    v = await check_email(STRANGER_ON_GMAIL)  # anyone can pass authentication as gmail.com
    assert v.verified is False


async def test_bulk_mail_bouncing_through_a_mail_service_can_still_be_verified():
    # DMARC already proved who sent it; bouncing via a subdomain or a mail service like Amazon SES is normal.
    for bounce in ("bounces+123@em.paypal.com", "0100018f-abc@amazonses.com"):
        raw = RECEIPT.replace("To: you@example.com", f"Return-Path: <{bounce}>\nTo: you@example.com")
        v = await check_email(raw)
        assert v.verified is True, bounce


def test_a_different_bounce_domain_still_counts_when_dmarc_did_not_pass():
    raw = CLEAN.replace("dmarc=pass", "dmarc=none").replace("To: you@example.com", "Return-Path: <x@bulk-mailer.biz>\nTo: you@example.com")
    s = header_signal(parse(raw))
    assert any("Bounce address" in r for r in s.evidence["reasons"])


# --- visiting links safely: a visit can use up a one-time link or tell a spammer your address is live -----
from argus_api.checkers import url as _url  # noqa: E402
from tests.test_url import live_feeds, web  # noqa: E402,F401 - shared fixtures: fake feeds and a fake internet


def _mail_with(link):
    return (
        "From: Shop <news@shop.example>\nTo: you@example.com\nSubject: hello\nMIME-Version: 1.0\n"
        f'Content-Type: text/html; charset=utf-8\n\n<p>Hi <a href="{link}">here</a></p>'
    )


def test_one_time_links_and_well_known_sites_are_not_opened_automatically(live_feeds):
    assert _url.visit_decision("http://tiny-shop.example/sale", "inbox") is None  # unknown site: worth a look
    for link in ("http://tiny-shop.example/unsubscribe?u=42", "https://tiny-shop.example/verify-email?token=abc",
                 "https://tiny-shop.example/reset-password?code=9", "https://tiny-shop.example/magic-link/xyz"):
        assert "one-time" in _url.visit_decision(link, "inbox"), link
    assert "well-known" in _url.visit_decision("https://www.google.com/search?q=hi", "inbox")
    assert "spam" in _url.visit_decision("http://tiny-shop.example/sale", "spam")
    assert _url.visit_decision("https://tiny-shop.example/verify-email?token=abc", None) is None  # you pasted it: look


async def test_inbox_scans_open_unknown_links_but_never_one_time_ones(live_feeds, web):
    await check_email(_mail_with("http://tiny-shop.example/sale"), mailbox="inbox")
    await check_email(_mail_with("http://tiny-shop.example/unsubscribe?u=42"), mailbox="inbox")
    assert web["fetched"] == ["http://tiny-shop.example/sale"]


async def test_links_in_spam_are_never_opened_but_still_judged(live_feeds, web):
    v = await check_email(_mail_with("http://secure-paypal-verify.com/login"), mailbox="spam")
    assert web["fetched"] == []
    link = next(s for s in v.signals if s.source.startswith("Link:"))
    nested = {s["source"]: s for s in link.evidence["signals"]}
    assert nested["Phishing.Database"]["status"] == "malicious"  # the feeds still catch it
    assert "spam" in nested["Page visit"]["summary"]


async def test_emails_you_paste_yourself_are_checked_in_full(live_feeds, web):
    await check_email(_mail_with("https://tiny-shop.example/verify-email?token=abc"))
    assert web["fetched"] == ["https://tiny-shop.example/verify-email?token=abc"]
