"""Phone number analysis: validation + ARGUS blocklist + community reports."""
from __future__ import annotations

import os

import phonenumbers
from phonenumbers import PhoneNumber, PhoneNumberFormat, PhoneNumberType, carrier, geocoder

from argus_api.aggregate import combine
from argus_api.models import Signal, Verdict
from argus_api.risk_engine import get_engine

LINE_TYPES = {
    PhoneNumberType.MOBILE: "mobile",
    PhoneNumberType.FIXED_LINE: "landline",
    PhoneNumberType.FIXED_LINE_OR_MOBILE: "landline or mobile",
    PhoneNumberType.TOLL_FREE: "toll-free",
    PhoneNumberType.PREMIUM_RATE: "premium-rate",
    PhoneNumberType.VOIP: "VoIP",
    PhoneNumberType.SHARED_COST: "shared-cost",
    PhoneNumberType.PERSONAL_NUMBER: "personal",
    PhoneNumberType.UAN: "business",
}


def _region() -> str:
    return os.environ.get("ARGUS_DEFAULT_REGION", "US").upper()


def _parse(raw: str) -> PhoneNumber | None:
    try:
        parsed = phonenumbers.parse(raw.strip(), _region())
    except phonenumbers.NumberParseException:
        return None
    return parsed if phonenumbers.is_possible_number(parsed) else None


def normalize(raw: str) -> str | None:
    parsed = _parse(raw)
    return phonenumbers.format_number(parsed, PhoneNumberFormat.E164) if parsed else None


def validity_signal(parsed: PhoneNumber | None) -> Signal:
    source = "Number validation"
    if parsed is None:
        return Signal(source=source, status="suspicious", score=40, weight=1.0,
                      summary="Not a real, dialable phone number, a common sign of spoofing",
                      evidence={"threat_type": "Spoofed caller ID"})
    number_type = phonenumbers.number_type(parsed)
    line = LINE_TYPES.get(number_type, "unknown")
    region = geocoder.description_for_number(parsed, "en") or phonenumbers.region_code_for_number(parsed) or "an unknown region"
    evidence = {
        "e164": phonenumbers.format_number(parsed, PhoneNumberFormat.E164),
        "country": phonenumbers.region_code_for_number(parsed),
        "carrier": carrier.name_for_number(parsed, "en") or None,
        "line_type": line,
    }
    if not phonenumbers.is_valid_number(parsed):
        return Signal(source=source, status="suspicious", score=40, weight=1.0,
                      summary="This number isn't assigned to anyone, often a sign of a spoofed caller ID",
                      evidence={**evidence, "threat_type": "Spoofed caller ID"})
    if number_type == PhoneNumberType.VOIP:
        return Signal(source=source, status="suspicious", score=35, weight=1.0,
                      summary=f"Internet (VoIP) number from {region}; scam call centers often use these",
                      evidence={**evidence, "threat_type": "Possible scam call"})
    if number_type == PhoneNumberType.PREMIUM_RATE:
        return Signal(source=source, status="suspicious", score=45, weight=1.0,
                      summary="Premium-rate number: calling back can cost you money",
                      evidence={**evidence, "threat_type": "Premium-rate fraud"})
    return Signal(source=source, status="clean", score=0, weight=1.0,
                  summary=f"Valid {line} number from {region}", evidence=evidence)


def blocklist_signal(e164: str | None) -> Signal:
    entry = get_engine().lookup_phone(e164) if e164 else None
    if entry:
        return Signal(source="ARGUS blocklist", status="malicious", score=95, weight=1.5, authoritative=True,
                      summary=entry["notes"], evidence={"category": entry["category"], "threat_type": entry["category"]})
    return Signal(source="ARGUS blocklist", status="clean", score=0, weight=0.5, summary="Not on the ARGUS blocklist")


def community_signal(count: int) -> Signal:
    source = "Community reports"
    if count <= 0:
        return Signal(source=source, status="clean", score=0, weight=0.5, summary="No reports from Argus users")
    if count < 3:
        return Signal(source=source, status="suspicious", score=45, weight=1.0,
                      summary=f"Reported by {count} Argus user{'s' if count != 1 else ''}",
                      evidence={"reports": count, "threat_type": "Reported by the community"})
    return Signal(source=source, status="malicious", score=85, weight=1.2,
                  summary=f"Reported by {count} Argus users",
                  evidence={"reports": count, "threat_type": "Reported scam number"})


def check_phone(raw: str, community_reports: int = 0) -> Verdict:
    parsed = _parse(raw)
    e164 = normalize(raw)
    signals = [validity_signal(parsed), blocklist_signal(e164), community_signal(community_reports)]
    return combine("phone", e164 or raw.strip(), signals)
