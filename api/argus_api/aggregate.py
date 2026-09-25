"""Merge per-source signals into one 0-100 verdict."""
from __future__ import annotations

from datetime import datetime, timezone

from argus_api.models import Kind, Signal, Verdict

BANDS = [(0, 29, "SAFE"), (30, 59, "LOW/MODERATE"), (60, 79, "SUSPICIOUS"), (80, 100, "HIGH RISK")]
COUNTED = {"clean", "suspicious", "malicious"}
AUTHORITATIVE_FLOOR = 85

RECOMMENDATIONS = {
    "SAFE": "No action needed. Nothing we checked shows meaningful risk.",
    "LOW/MODERATE": "Proceed with normal caution. Don't share sensitive information unless you can verify the source independently.",
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
    counted = [s for s in signals if s.status in COUNTED and s.weight > 0]
    if not counted:
        score, level = 0, "UNVERIFIED"
    else:
        total_weight = sum(s.weight for s in counted)
        average = sum(s.score * s.weight for s in counted) / total_weight
        peak = max(s.score for s in counted)
        score = round((average + peak) / 2)
        if any(s.authoritative and s.status == "malicious" for s in counted):
            score = max(score, AUTHORITATIVE_FLOOR)
        score = max(0, min(100, score))
        level = band_for(score)

    if threat_type is None:
        threat_type = "None"
        if score >= 30:
            strongest = max(counted, key=lambda s: s.score)
            threat_type = str(strongest.evidence.get("threat_type") or "Suspicious activity")

    return Verdict(
        kind=kind,
        subject=subject[:300],
        score=score,
        level=level,
        threat_type=threat_type,
        signals=signals,
        recommendation=RECOMMENDATIONS[level],
        scanned_at=datetime.now(timezone.utc).isoformat(),
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
        summary=f"{v.level.title()}: {v.threat_type}" if v.score >= 30 else "No threats found for this link",
        authoritative=any(s.authoritative and s.status == "malicious" for s in v.signals),
        evidence={"subject": v.subject, "threat_type": v.threat_type, "signals": [s.model_dump() for s in v.signals]},
    )
