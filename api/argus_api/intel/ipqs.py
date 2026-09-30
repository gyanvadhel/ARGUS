"""IPQualityScore phone reputation: whether a number has been reported for spam calls or tied to recent fraud.

Optional (IPQS_API_KEY, from a free account). It covers numbers worldwide, including Indian ones, which no free
public complaint list does (the FCC's covers only +1). Answers are cached for a day, since free lookups are limited.
Like complaints, a report isn't proof: caller IDs get faked, so a spam report outweighs a bare risk score.
"""
from __future__ import annotations

import time

from phonenumbers import PhoneNumber, PhoneNumberFormat, format_number

from argus_api import config
from argus_api.http import make_client, unavailable
from argus_api.intel import netcheck
from argus_api.models import Signal

IPQS_BASE = "https://www.ipqualityscore.com/api/json/phone/"
KEY_NAME = "IPQS_API_KEY"
SOURCE = "Phone reputation (IPQS)"
CACHE_SECONDS = 24 * 3600
_cache: dict[str, tuple[float, Signal]] = {}


def clear_cache() -> None:
    _cache.clear()


def summarize(data: dict) -> Signal:
    """IPQS's answer as one signal: spam reports and recent fraud weigh most, a bare risk score least."""
    if not data.get("success", False):
        reason = str(data.get("message") or "no reason given")[:120]
        return Signal(source=SOURCE, status="unavailable", score=0, weight=0, summary=f"IPQS couldn't answer: {reason}")
    score = int(data.get("fraud_score") or 0)
    spam, fraud = bool(data.get("spammer")), bool(data.get("recent_abuse"))
    evidence = {"fraud_score": score, "spammer": spam, "recent_abuse": fraud, "risky": bool(data.get("risky")),
                "line_type": data.get("line_type")}
    if spam and fraud:
        return Signal(source=SOURCE, status="malicious", score=88, weight=1.3,
                      summary=f"Reported for spam calls and tied to recent fraud (IPQS risk score {score}/100)",
                      evidence={**evidence, "threat_type": "Reported scam number"})
    if fraud:
        return Signal(source=SOURCE, status="malicious", score=82, weight=1.2,
                      summary=f"Tied to recent fraud (IPQS risk score {score}/100)",
                      evidence={**evidence, "threat_type": "Reported scam number"})
    if spam:
        return Signal(source=SOURCE, status="suspicious", score=70, weight=1.0,
                      summary=f"Recently reported for spam or harassing calls (IPQS risk score {score}/100)",
                      evidence={**evidence, "threat_type": "Reported spam caller"})
    if score >= 75 or data.get("risky"):
        return Signal(source=SOURCE, status="suspicious", score=55 if score >= 85 else 40, weight=1.0,
                      summary=f"IPQS rates it risky ({score}/100), though nobody has reported it for spam",
                      evidence={**evidence, "threat_type": "Risky number"})
    return Signal(source=SOURCE, status="clean", score=0, weight=0.5,
                  summary=f"No spam or fraud reports at IPQS (risk score {score}/100)", evidence=evidence)


async def ipqs_signal(parsed: PhoneNumber | None) -> Signal:
    if parsed is None:
        return Signal(source=SOURCE, status="unknown", score=0, weight=0, summary="Can't look up a number that isn't dialable")
    key = config.key(KEY_NAME)
    if not key:
        return unavailable(SOURCE, KEY_NAME)
    if netcheck.offline():
        return Signal(source=SOURCE, status="unknown", score=0, weight=0, summary="IPQS lookups are off in offline mode")
    digits = format_number(parsed, PhoneNumberFormat.E164).lstrip("+")
    cached = _cache.get(digits)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]
    try:
        async with make_client() as client:
            r = await client.get(f"{IPQS_BASE}{key}/{digits}", timeout=8)
            r.raise_for_status()
            data = r.json()
    except Exception as exc:  # noqa: BLE001 - only the error's type, never its text: the URL carries the key
        return Signal(source=SOURCE, status="error", score=0, weight=0, summary=f"IPQS couldn't be reached ({type(exc).__name__})")
    signal = summarize(data if isinstance(data, dict) else {})
    if signal.status != "unavailable":
        _cache[digits] = (time.time(), signal)
    return signal
