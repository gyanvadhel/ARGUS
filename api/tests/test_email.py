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
