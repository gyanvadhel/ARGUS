"""FCC consumer complaints: the complaints Americans file about unwanted calls and texts, with the caller's number.

Free and keyless (the FCC's open data portal), updated daily. Only North American (+1) numbers are covered.
A complaint is evidence, not proof: scammers fake caller IDs, so an innocent person's number can be reported.
That's why how many complaints there are, and how recent, decides how much weight they carry.
"""
from __future__ import annotations

import time
from collections import Counter
from datetime import datetime, timezone

from phonenumbers import PhoneNumber

from argus_api.http import make_client
from argus_api.intel import netcheck
from argus_api.models import Signal

FCC_URL = "https://opendata.fcc.gov/resource/3xyp-aqkj.json"
SOURCE = "FCC complaints (US)"
CACHE_SECONDS = 6 * 3600
MAX_ROWS = 200
CALL_TYPES = {"Prerecorded Voice": "robocalls", "Live Voice": "live calls", "Text Message": "texts"}
ONE_OF = {"robocalls": "a robocall", "live calls": "a live call", "texts": "a text", "calls": "a call"}
THREAT_TYPES = {"robocalls": "Reported robocaller", "texts": "Reported spam texts"}
_cache: dict[str, tuple[float, Signal]] = {}


def clear_cache() -> None:
    _cache.clear()


def _formats(national: str) -> list[str]:
    """The ways people type the same number into the complaint form."""
    a, b, c = national[:3], national[3:6], national[6:]
    return [f"{a}-{b}-{c}", national, f"1-{a}-{b}-{c}", f"({a}) {b}-{c}", f"+1{national}", f"1{national}"]


def _when(days: int) -> str:
    return "today" if days < 1 else "yesterday" if days < 2 else f"{days} days ago"


def _subject(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text or text.startswith("Other"):
        return None
    return text.replace("Irs ", "IRS ")


def _parse_time(raw: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")) if raw else None
    except ValueError:
        return None


def summarize(rows: list[dict], now: datetime | None = None) -> Signal:
    """Turn complaint records into one signal: more, and more recent, complaints weigh more."""
    now = now or datetime.now(timezone.utc)
    total = len(rows)
    if total == 0:
        return Signal(source=SOURCE, status="clean", score=0, weight=0.5,
                      summary="No complaints to the FCC about this number")

    # Calendar days in UTC, so a complaint filed last night reads "yesterday", not "today".
    ages = [(now.date() - t.date()).days for t in (_parse_time(r.get("ticket_created")) for r in rows) if t]
    last_days = max(0, min(ages)) if ages else None
    this_year = sum(1 for a in ages if a <= 365)
    kinds = Counter(CALL_TYPES.get(r.get("type_of_call_or_messge") or "", "calls") for r in rows)
    kind, kind_n = kinds.most_common(1)[0]
    subjects = Counter(s for s in (_subject(r.get("type_of_property_goods_or_services")) for r in rows) if s)

    count = f"{total}+" if total >= MAX_ROWS else str(total)
    what = ONE_OF[kind] if total == 1 else kind if kind_n == total else f"mostly {kind}"
    summary = f"{count} complaint{'s' if total != 1 else ''} to the FCC ({what})"
    if subjects:
        summary += " about " + " and ".join(s for s, _ in subjects.most_common(2))
    evidence = {"complaints": total, "this_year": this_year, "last_days": last_days, "kinds": dict(kinds),
                "subjects": [s for s, _ in subjects.most_common(5)], "threat_type": THREAT_TYPES.get(kind, "Reported unwanted calls")}

    if ages and this_year == 0:
        return Signal(source=SOURCE, status="suspicious", score=25, weight=1.0,
                      summary=f"{summary}, but none in the past year", evidence=evidence)
    if last_days is not None:
        summary += f", most recently {_when(last_days)}"
    if total >= 10:
        return Signal(source=SOURCE, status="malicious", score=90, weight=1.5, authoritative=True, summary=summary, evidence=evidence)
    if total >= 5:
        return Signal(source=SOURCE, status="malicious", score=80, weight=1.2, summary=summary, evidence=evidence)
    return Signal(source=SOURCE, status="suspicious", score=60 if total >= 2 else 40, weight=1.0, summary=summary, evidence=evidence)


async def fcc_signal(parsed: PhoneNumber | None) -> Signal:
    if parsed is None:
        return Signal(source=SOURCE, status="unknown", score=0, weight=0, summary="Can't look up a number that isn't dialable")
    national = str(parsed.national_number)
    if parsed.country_code != 1 or len(national) != 10:
        return Signal(source=SOURCE, status="unknown", score=0, weight=0,
                      summary="The FCC's complaint records only cover US and Canadian numbers")
    if netcheck.offline():
        return Signal(source=SOURCE, status="unknown", score=0, weight=0, summary="FCC lookups are off in offline mode")
    cached = _cache.get(national)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]
    numbers = ",".join(f"'{n}'" for n in _formats(national))
    params = {
        "$select": "ticket_created,type_of_call_or_messge,type_of_property_goods_or_services",
        "$where": f"issue='Unwanted Calls' AND caller_id_number in ({numbers})",
        "$order": "ticket_created DESC",
        "$limit": str(MAX_ROWS),
    }
    try:
        async with make_client() as client:
            r = await client.get(FCC_URL, params=params, timeout=8)
            r.raise_for_status()
            rows = r.json()
    except Exception as exc:  # noqa: BLE001 - an outage becomes a visible "error", never a silent clean
        return Signal(source=SOURCE, status="error", score=0, weight=0,
                      summary=f"The FCC's complaint records couldn't be reached ({type(exc).__name__})")
    signal = summarize(rows if isinstance(rows, list) else [])
    _cache[national] = (time.time(), signal)
    return signal
