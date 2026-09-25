"""Combine per-source signals into one 0-100 verdict.

Red flags are treated as independent evidence and combined like probabilities (noisy-OR), so two
weak warnings add up and "found nothing" results never water a real warning down. Positive trust
evidence (e.g. one of the world's most visited sites) lowers risk, and an authoritative threat-feed
hit always wins.
"""
from __future__ import annotations

from datetime import datetime, timezone

from argus_api.models import Kind, Signal, Verdict

BANDS = [(0, 29, "SAFE"), (30, 59, "LOW/MODERATE"), (60, 79, "SUSPICIOUS"), (80, 100, "HIGH RISK")]
FLAGS = {"suspicious", "malicious"}
USABLE = {"clean", "suspicious", "malicious"}
AUTHORITATIVE_FLOOR = 85
TRUST_DAMPING = 0.7
VERIFIED_TRUST = 0.5

RECOMMENDATIONS = {
    "SAFE_VERIFIED": "Looks safe. Argus found positive evidence this is legitimate and no red flags.",
    "SAFE": "No red flags found. That isn't a guarantee: stay careful with anything that asks for money or codes.",
    "LOW/MODERATE": "Proceed with caution. Don't share sensitive information unless you can verify the source independently.",
    "SUSPICIOUS": "Treat this as suspicious. Don't click links, share codes, or send money. Verify through an official channel first.",
    "HIGH RISK": "High risk. Don't respond, click, open, or pay. Block the sender and report it.",
    "UNVERIFIED": "We couldn't verify this with any source. Treat it with caution until you can confirm it independently.",
}


def band_for(score: int) -> str:
    for low, high, name in BANDS:
        if low <= score <= high:
            return name
    return "HIGH RISK" if score > 100 else "SAFE"


def combine(kind: Kind, subject: str, signals: list[Signal], threat_type: str | None = None) -> Verdict:
    usable = [s for s in signals if s.status in USABLE and s.weight > 0]
    flags = [s for s in usable if s.status in FLAGS]
    trust = max((s.trust for s in usable if s.status == "clean"), default=0.0)

    if not usable:
        score, level, verified = 0, "UNVERIFIED", False
    else:
        safe_odds = 1.0
        for s in flags:
            safe_odds *= 1.0 - min(0.97, (s.score / 100.0) * min(1.0, s.weight))
        risk = (1.0 - safe_odds) * (1.0 - TRUST_DAMPING * trust)
        score = round(100 * risk)
        if any(s.authoritative and s.status == "malicious" for s in flags):
            score = max(score, AUTHORITATIVE_FLOOR)
        score = max(0, min(100, score))
        level = band_for(score)
        verified = level == "SAFE" and trust >= VERIFIED_TRUST

    if threat_type is None:
        threat_type = "None"
        if score >= 30 and flags:
            strongest = max(flags, key=lambda s: s.score * min(1.0, s.weight))
            threat_type = str(strongest.evidence.get("threat_type") or "Suspicious activity")

    advice = "SAFE_VERIFIED" if verified else level
    return Verdict(
        kind=kind,
        subject=subject[:300],
        score=score,
        level=level,
        threat_type=threat_type,
        signals=signals,
        recommendation=RECOMMENDATIONS[advice],
        scanned_at=datetime.now(timezone.utc).isoformat(),
        verified=verified,
    )


def verdict_as_signal(v: Verdict, source: str) -> Signal:
    """Fold a nested verdict (e.g. a link inside an email) into one signal."""
    if v.level == "UNVERIFIED":
        status = "unknown"
    elif v.score >= 80:
        status = "malicious"
    elif v.score >= 30:
        status = "suspicious"
    else:
        status = "clean"
    return Signal(
        source=source,
        status=status,
        score=v.score,
        weight=1.0,
        summary=f"{v.level.title()}: {v.threat_type}" if v.score >= 30 else "No red flags for this link",
        authoritative=any(s.authoritative and s.status == "malicious" for s in v.signals),
        evidence={"subject": v.subject, "threat_type": v.threat_type, "signals": [s.model_dump() for s in v.signals]},
    )
