"""Email analysis: sender authentication + spoofing tells + body model + every link inside."""
from __future__ import annotations

import asyncio
import re
from email import policy
from email.message import EmailMessage
from email.parser import Parser
from email.utils import parseaddr

from argus_api.aggregate import combine, verdict_as_signal
from argus_api.checkers.text import extract_urls, ml_signal, rules_signal
from argus_api.checkers.url import BRAND_DOMAINS, brand_name, check_url, host_of
from argus_api.models import Signal, Verdict

_HREF = re.compile(r"""href\s*=\s*["'](https?://[^"']+)""", re.I)
_TAG = re.compile(r"<[^>]+>")
_ADDRESS = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def _domain(address: str) -> str:
    return address.rsplit("@", 1)[-1].lower() if "@" in address else ""


def parse_auth_results(msg: EmailMessage) -> dict[str, str]:
    header = " ".join(str(h) for h in (msg.get_all("Authentication-Results") or []))
    results = {}
    for mech in ("spf", "dkim", "dmarc"):
        match = re.search(rf"\b{mech}\s*=\s*([a-z]+)", header, re.I)
        results[mech] = match.group(1).lower() if match else "none"
    return results


def header_signal(msg: EmailMessage) -> Signal:
    auth = parse_auth_results(msg)
    points = 0
    reasons: list[str] = []
    if auth["spf"] in ("fail", "softfail"):
        points += 30
        reasons.append(f"SPF {auth['spf']}: the sending server isn't authorized to send for this domain")
    if auth["dkim"] == "fail":
        points += 25
        reasons.append("DKIM failed: the message was altered or forged")
    if auth["dmarc"] == "fail":
        points += 40
        reasons.append("DMARC failed: the sender's domain doesn't vouch for this email")

    from_name, from_addr = parseaddr(str(msg.get("From", "")))
    from_domain = _domain(from_addr)
    reply_domain = _domain(parseaddr(str(msg.get("Reply-To", "")))[1])
    if reply_domain and from_domain and reply_domain != from_domain:
        points += 25
        reasons.append(f"Replies go to a different domain ({reply_domain})")

    embedded = _ADDRESS.search(from_name)
    if embedded and _domain(embedded.group(0)) != from_domain:
        points += 30
        reasons.append(f"Display name shows {_domain(embedded.group(0))} but the real sender is {from_domain}")
    else:
        squashed = from_name.lower().replace(" ", "")
        for brand, domains in BRAND_DOMAINS.items():
            if brand in squashed and from_domain and not any(from_domain == d or from_domain.endswith("." + d) for d in domains):
                points += 30
                reasons.append(f"Claims to be {brand_name(brand)} but was sent from {from_domain}")
                break

    bounce_domain = _domain(parseaddr(str(msg.get("Return-Path", "")))[1])
    if bounce_domain and from_domain and bounce_domain != from_domain:
        points += 10
        reasons.append(f"Bounce address uses a different domain ({bounce_domain})")

    score = min(points, 100)
    if reasons:
        summary = reasons[0]
    elif all(v == "pass" for v in auth.values()):
        summary = "SPF, DKIM and DMARC all passed"
    else:
        summary = "No sender red flags found"
    return Signal(source="Sender authentication", status="suspicious" if score >= 30 else "clean", score=score,
                  weight=1.2, summary=summary,
                  evidence={"auth": auth, "from": from_addr, "reply_to": reply_domain or None,
                            "reasons": reasons, "threat_type": "Phishing / spoofing"})


def extract_body(msg: EmailMessage) -> tuple[str, list[str]]:
    plain: list[str] = []
    html: list[str] = []
    for part in msg.walk():
        if part.is_multipart() or part.get_content_disposition() == "attachment":
            continue
        try:
            content = part.get_content()
        except Exception:  # noqa: BLE001 - undecodable parts are skipped
            continue
        if not isinstance(content, str):
            continue
        (html if part.get_content_type() == "text/html" else plain).append(content)
    html_text = "\n".join(html)
    body = "\n".join(plain) or _TAG.sub(" ", html_text)
    return body.strip(), _HREF.findall(html_text)


async def check_email(raw: str) -> Verdict:
    msg = Parser(policy=policy.default).parsestr(raw.strip())
    body, links = extract_body(msg)
    text = body or raw
    signals = [header_signal(msg), ml_signal(text), rules_signal(text)]
    urls = list(dict.fromkeys(links + extract_urls(text)))[:3]
    if urls:
        verdicts = await asyncio.gather(*(check_url(u) for u in urls))
        signals += [verdict_as_signal(v, f"Link: {host_of(v.subject)}") for v in verdicts]
    return combine("email", str(msg.get("Subject") or "Pasted email"), signals)
