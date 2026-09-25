"""Read a fetched page the way a phishing analyst would: fake logins, card/code fields, and hidden code."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit

from argus_api.intel.brands import BRAND_PATTERNS, brand_name, is_official

_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_STRIP = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.I | re.S)
_TAG = re.compile(r"<[^>]+>")
_PASSWORD = re.compile(r"<input[^>]+type\s*=\s*[\"']?password", re.I)
_INPUT = re.compile(r"<input[^>]*>", re.I)
_HIDDEN = re.compile(r"type\s*=\s*[\"']?hidden", re.I)
_SENSITIVE_FIELD = re.compile(
    r"(card.?num|cc.?num|credit.?card|cvv|cvc|security.?code|expir|ssn|social.?security|aadhaar|pan.?card|"
    r"one.?time|otp|verification.?code|atm.?pin|\bpin\b|routing|account.?number)",
    re.I,
)
_FORM = re.compile(r"<form\b([^>]*)>(.*?)(?:</form>|$)", re.I | re.S)
_ACTION = re.compile(r"action\s*=\s*[\"']([^\"']+)[\"']", re.I)
_META_REFRESH = re.compile(r"<meta[^>]+http-equiv\s*=\s*[\"']?refresh[^>]+url\s*=\s*([^\"'>\s]+)", re.I)
_OBFUSCATION = re.compile(
    r"(eval\s*\(\s*(atob|unescape|decodeURIComponent)\s*\(|eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k|"
    r"document\.write\s*\(\s*unescape\s*\(|String\.fromCharCode\s*\((\s*\d+\s*,){25,}|atob\s*\(\s*[\"'][A-Za-z0-9+/=]{300,})",
    re.I,
)


@dataclass
class PageReport:
    score: int
    reasons: list[str] = field(default_factory=list)
    title: str = ""
    text: str = ""
    brand: str | None = None


def _host(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


def visible_text(html: str, limit: int = 6000) -> str:
    return re.sub(r"\s+", " ", _TAG.sub(" ", _STRIP.sub(" ", html))).strip()[:limit]


def _asks_for_secrets(fragment: str) -> tuple[bool, bool]:
    """(has a password box, has card/code/ID fields) within a piece of HTML."""
    visible = [tag for tag in _INPUT.findall(fragment) if not _HIDDEN.search(tag)]
    return bool(_PASSWORD.search(fragment)), any(_SENSITIVE_FIELD.search(tag) for tag in visible)


def analyze_page(html: str, page_url: str, popular: bool = False) -> PageReport:
    host = _host(page_url)
    title_match = _TITLE.search(html)
    title = re.sub(r"\s+", " ", title_match.group(1)).strip()[:200] if title_match else ""
    text = visible_text(html)

    has_password, sensitive = _asks_for_secrets(html)
    # Naming a brand is only impersonation when the page takes its name, or asks for secrets under it:
    # a news story that mentions Microsoft isn't pretending to be Microsoft.
    brand_zone = f"{title} {text[:3000]}" if has_password or sensitive else title
    impersonated = next((b for b, pattern in BRAND_PATTERNS.items() if pattern.search(brand_zone) and not is_official(host, b)), None)
    # Only forms that collect secrets matter when they post elsewhere (a search box sending to Algolia is fine).
    external_actions = sorted({
        target
        for attrs, body in _FORM.findall(html)
        if any(_asks_for_secrets(body)) and (action := _ACTION.search(attrs))
        and (target := _host(urljoin(page_url, action.group(1)))) and target != host
    })
    refresh = _META_REFRESH.search(html)
    refresh_host = _host(urljoin(page_url, refresh.group(1))) if refresh else ""

    points = 0
    reasons: list[str] = []

    def flag(n: int, why: str) -> None:
        nonlocal points
        points += n
        reasons.append(why)

    if impersonated and has_password:
        flag(60, f"Login form pretending to be {brand_name(impersonated)} on a site that isn't theirs")
    elif impersonated and sensitive:
        flag(60, f"Asks for card or code details while pretending to be {brand_name(impersonated)}")
    elif has_password and not popular:
        flag(20, "Asks for a password on a little-known site")
    if sensitive and not popular:
        flag(35, "Asks for card numbers, one-time codes, PINs or ID numbers")
    if external_actions:
        flag(25, f"Sends what you type to a different site ({external_actions[0]})")
    if _OBFUSCATION.search(html):
        flag(25, "Hides its code with obfuscated scripts")
    if refresh_host and refresh_host != host:
        flag(15, f"Instantly forwards you to {refresh_host}")

    return PageReport(score=min(points, 100), reasons=reasons, title=title, text=text, brand=impersonated)
