"""Phone number analysis (Caller ID): validation, callback traps, the ARGUS blocklist, community reports and sightings."""
from __future__ import annotations

import os

import phonenumbers
from phonenumbers import PhoneNumber, PhoneNumberFormat, PhoneNumberType, carrier, geocoder
from pydantic import BaseModel, Field

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

# Country codes behind most "one-ring" (wangiri) scams: a missed call that bills you if you ring back.
ONE_RING_COUNTRIES = {
    216: "Tunisia", 222: "Mauritania", 224: "Guinea", 225: "Côte d'Ivoire", 231: "Liberia", 232: "Sierra Leone",
    243: "the DR Congo", 252: "Somalia", 261: "Madagascar", 269: "Comoros", 375: "Belarus",
    870: "a satellite network", 881: "a satellite network", 882: "an international network", 883: "an international network",
}
# +1 area codes that look domestic in North America but are billed as international calls.
NANP_ABROAD = {
    "268": "Antigua and Barbuda", "284": "the British Virgin Islands", "441": "Bermuda", "473": "Grenada",
    "649": "the Turks and Caicos Islands", "664": "Montserrat", "758": "St Lucia", "767": "Dominica",
    "809": "the Dominican Republic", "829": "the Dominican Republic", "849": "the Dominican Republic", "876": "Jamaica",
}
DANGER_CATEGORIES = {"Scam", "Fraud"}


class Community(BaseModel):
    """What ARGUS users collectively know about a number (aggregated by the web app from Supabase)."""
    reports: int = Field(default=0, ge=0)
    categories: dict[str, int] = Field(default_factory=dict)
    name: str | None = Field(default=None, max_length=60)
    name_votes: int = Field(default=0, ge=0)
    last_report_days: float | None = Field(default=None, ge=0)
    sightings: int = Field(default=0, ge=0)


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
    if number_type == PhoneNumberType.TOLL_FREE:
        region = "Toll-free"  # toll-free numbers have no fixed location
    else:
        region = (geocoder.description_for_number(parsed, "en") or geocoder.country_name_for_number(parsed, "en")
                  or "Unknown location")
    evidence = {
        "e164": phonenumbers.format_number(parsed, PhoneNumberFormat.E164),
        "international": phonenumbers.format_number(parsed, PhoneNumberFormat.INTERNATIONAL),
        "country": phonenumbers.region_code_for_number(parsed),
        "region": region,
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
    place = "" if region in ("Toll-free", "Unknown location") else f" from {region}"
    return Signal(source=source, status="clean", score=0, weight=1.0,
                  summary=f"Valid {line} number{place}", evidence=evidence)


def callback_risk_signal(parsed: PhoneNumber | None) -> Signal:
    source = "Callback trap check"
    if parsed is None:
        return Signal(source=source, status="unknown", score=0, weight=0, summary="Can't check a number that isn't dialable")
    if parsed.country_code == 1:
        area = str(parsed.national_number)[:3]
        if area in NANP_ABROAD:
            return Signal(source=source, status="suspicious", score=50, weight=1.0,
                          summary=f"Area code {area} looks local but belongs to {NANP_ABROAD[area]}: calling back "
                                  "can be billed as an expensive international call",
                          evidence={"area_code": area, "threat_type": "One-ring callback scam"})
    elif parsed.country_code in ONE_RING_COUNTRIES:
        cc = parsed.country_code
        return Signal(source=source, status="suspicious", score=50, weight=1.0,
                      summary=f"+{cc} ({ONE_RING_COUNTRIES[cc]}) is a known source of one-ring scams: "
                              "don't call back a missed call from it",
                      evidence={"country_code": cc, "threat_type": "One-ring callback scam"})
    return Signal(source=source, status="clean", score=0, weight=0.5, summary="No one-ring callback trap")


def blocklist_signal(e164: str | None) -> Signal:
    entry = get_engine().lookup_phone(e164) if e164 else None
    if entry:
        return Signal(source="ARGUS blocklist", status="malicious", score=95, weight=1.5, authoritative=True,
                      summary=entry["notes"], evidence={"category": entry["category"], "threat_type": entry["category"]})
    return Signal(source="ARGUS blocklist", status="clean", score=0, weight=0.5, summary="Not on the ARGUS blocklist")


def community_signal(c: Community) -> Signal:
    source = "Community reports"
    evidence = {"reports": c.reports, "categories": c.categories, "name": c.name, "name_votes": c.name_votes,
                "last_report_days": c.last_report_days}
    if c.reports <= 0:
        return Signal(source=source, status="clean", score=0, weight=0.5, summary="No reports from Argus users",
                      evidence=evidence)

    counted = sum(c.categories.values())
    danger = sum(v for k, v in c.categories.items() if k in DANGER_CATEGORIES)
    share = danger / counted if counted else 1.0  # reports saved before categories existed were scam reports
    users = f"{c.reports} Argus user{'s' if c.reports != 1 else ''}"
    summary = f"Reported by {users}"
    if c.categories:
        top = max(c.categories, key=lambda k: c.categories[k])
        summary += f" {'as' if len(c.categories) == 1 else 'mostly as'} {top}"
    if c.last_report_days is not None:
        days = round(c.last_report_days)
        summary += ", most recently today" if days < 1 else f", most recently {days} day{'s' if days != 1 else ''} ago"

    if c.reports >= 5 and share >= 0.5:
        return Signal(source=source, status="malicious", score=92, weight=1.5, authoritative=True, summary=summary,
                      evidence={**evidence, "threat_type": "Reported scam number"})
    if c.reports >= 3 and share >= 0.5:
        return Signal(source=source, status="malicious", score=85, weight=1.2, summary=summary,
                      evidence={**evidence, "threat_type": "Reported scam number"})
    if c.reports >= 3:
        return Signal(source=source, status="suspicious", score=60, weight=1.2, summary=summary,
                      evidence={**evidence, "threat_type": "Reported spam caller"})
    return Signal(source=source, status="suspicious", score=45, weight=1.0, summary=summary,
                  evidence={**evidence, "threat_type": "Reported by the community"})


def sightings_signal(c: Community) -> Signal:
    source = "Seen in scam messages"
    if c.sightings <= 0:
        return Signal(source=source, status="clean", score=0, weight=0.5,
                      summary="Not seen in any scam texts or emails scanned by Argus users")
    summary = f"Seen in {c.sightings} scam message{'s' if c.sightings != 1 else ''} scanned by Argus users"
    evidence = {"sightings": c.sightings, "threat_type": "Used in scam messages"}
    if c.sightings >= 3:
        return Signal(source=source, status="malicious", score=80, weight=1.2, summary=summary, evidence=evidence)
    return Signal(source=source, status="suspicious", score=55, weight=1.0, summary=summary, evidence=evidence)


def check_phone(raw: str, community: Community | None = None, community_reports: int = 0) -> Verdict:
    c = community or Community(reports=community_reports)
    parsed = _parse(raw)
    e164 = normalize(raw)
    signals = [
        validity_signal(parsed),
        callback_risk_signal(parsed),
        blocklist_signal(e164),
        community_signal(c),
        sightings_signal(c),
    ]
    return combine("phone", e164 or raw.strip(), signals)
