"""Message analysis: ARGUS ML + scam-phrase rules + local threat intel."""
from __future__ import annotations

import re

from argus_api.aggregate import combine
from argus_api.models import Signal, Verdict
from argus_api.risk_engine import THREAT_TYPE_BY_LABEL, get_engine

_URL_IN_TEXT = re.compile(r"(?:https?://|www\.)[^\s<>\"')]+", re.I)
_BARE_DOMAIN = re.compile(
    r"(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:com|net|org|info|io|co|in|us|biz|xyz|top|link|click|app|ly|me|site|online)"
    r"(?:/[^\s<>\"')]*)?",
    re.I,
)


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
    return combine("text", text[:120], local_text_signals(text))
