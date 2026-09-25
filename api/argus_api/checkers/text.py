"""Message analysis: ARGUS ML + scam-phrase rules + local threat intel."""
from __future__ import annotations

import asyncio
import re

from argus_api.aggregate import combine, verdict_as_signal
from argus_api.checkers.phone import blocklist_signal, normalize
from argus_api.checkers.url import check_url, host_of
from argus_api.models import Signal, Verdict
from argus_api.risk_engine import THREAT_TYPE_BY_LABEL, get_engine

_URL_IN_TEXT = re.compile(r"(?:https?://|www\.)[^\s<>\"')]+", re.I)
_BARE_DOMAIN = re.compile(
    r"(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:com|net|org|info|io|co|in|us|biz|xyz|top|link|click|app|ly|me|site|online)"
    r"(?:/[^\s<>\"')]*)?",
    re.I,
)


_PHONE_IN_TEXT = re.compile(r"(?<![\w.])\+?\d[\d\s\-()]{6,18}\d(?![\w.])")


def extract_phones(text: str, limit: int = 2) -> list[str]:
    """E.164 numbers found in free text (10-15 digits, so dates and short codes are skipped)."""
    found: list[str] = []
    for match in _PHONE_IN_TEXT.findall(text):
        if not 10 <= sum(ch.isdigit() for ch in match) <= 15:
            continue
        e164 = normalize(match)
        if e164 and e164 not in found:
            found.append(e164)
    return found[:limit]


def phone_signals(text: str) -> list[Signal]:
    return [blocklist_signal(n).model_copy(update={"source": f"Phone: {n}"}) for n in extract_phones(text)]


def unique_hosts(urls: list[str]) -> list[str]:
    """Keep the first URL per host so one site never produces two identical evidence cards."""
    seen: set[str] = set()
    kept = []
    for url in urls:
        host = host_of(url)
        if host not in seen:
            seen.add(host)
            kept.append(url)
    return kept


def extract_urls(text: str, limit: int = 3) -> list[str]:
    found: list[str] = []
    for match in _URL_IN_TEXT.findall(text) + _BARE_DOMAIN.findall(text):
        candidate = match.rstrip(".,;:!?")
        if not any(candidate in f or f in candidate for f in found):
            found.append(candidate)
    return found[:limit]


def ml_signal(text: str) -> Signal:
    engine = get_engine()
    proba = dict(zip(engine.classes_, engine.classifier.predict_proba(engine.vectorizer.transform([text]))[0]))
    label = max(proba, key=proba.get)
    confidence = float(proba[label])
    # With 5 classes and a small training set, probability mass spreads evenly over the
    # four threat classes, so "1 - P(Safe)" overstates risk. Compare the strongest threat
    # class head-to-head with Safe instead.
    top_threat = max(p for c, p in proba.items() if c != "Safe")
    safe = proba.get("Safe", 0.0)
    score = 100.0 * top_threat / (top_threat + safe) if (top_threat + safe) else 0.0
    return Signal(
        source="ARGUS ML model",
        status="suspicious" if score >= 50 else "clean",
        score=round(score),
        weight=1.0,
        summary=f"Classified as {label} ({confidence:.0%} confidence)",
        evidence={"label": label, "confidence": round(confidence, 2),
                  "threat_type": THREAT_TYPE_BY_LABEL.get(label, "Unknown")},
    )


def rules_signal(text: str) -> Signal:
    score, hits = get_engine()._rule_signal(text)
    count = len(hits)
    return Signal(
        source="Scam phrase rules",
        status="suspicious" if score >= 30 else "clean",
        score=round(score),
        weight=1.0,
        summary=f"{count} scam pattern{'s' if count != 1 else ''} matched" if hits else "No known scam phrases",
        evidence={
            "matches": [{"phrase": h["phrase"], "why": h["description"], "severity": h["severity"]} for h in hits],
            "threat_type": "Social engineering",
        },
    )


def intel_signal(text: str) -> Signal:
    score, hits = get_engine()._intel_signal(text)
    if not hits:
        return Signal(source="ARGUS threat intel", status="clean", score=0, weight=0.5,
                      summary="No known-bad domains, numbers or addresses")
    return Signal(
        source="ARGUS threat intel",
        status="malicious",
        score=max(round(score), 70),
        weight=1.0,
        summary=f"Matched {len(hits)} known-bad indicator{'s' if len(hits) != 1 else ''}",
        evidence={
            "matches": [{"indicator": h["indicator"], "type": h["type"], "category": h["category"],
                         "notes": h["notes"]} for h in hits],
            "threat_type": hits[0]["category"],
        },
    )


def local_text_signals(text: str) -> list[Signal]:
    return [ml_signal(text), rules_signal(text), intel_signal(text)]


async def check_text(text: str) -> Verdict:
    signals = local_text_signals(text) + phone_signals(text)
    urls = unique_hosts(extract_urls(text))
    if urls:
        verdicts = await asyncio.gather(*(check_url(u) for u in urls))
        signals += [verdict_as_signal(v, f"Link: {host_of(v.subject)}") for v in verdicts]
    return combine("text", text[:120], signals)
