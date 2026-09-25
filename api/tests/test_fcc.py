from datetime import datetime, timedelta, timezone

import pytest
import respx

from argus_api.checkers.phone import _parse, scan_phone
from argus_api.checkers.text import check_text
from argus_api.intel import fcc


def rows(n, days_ago=1, kind="Prerecorded Voice", subject="Google Listings Services"):
    ts = (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    return [{"ticket_created": ts, "type_of_call_or_messge": kind, "type_of_property_goods_or_services": subject}
            for _ in range(n)]


@pytest.fixture
def online(monkeypatch):
    monkeypatch.delenv("ARGUS_OFFLINE", raising=False)
    fcc.clear_cache()


async def test_many_recent_robocall_complaints_are_high_risk(online):
    with respx.mock:
        route = respx.get(url__startswith=fcc.FCC_URL).respond(json=rows(25))
        s = await fcc.fcc_signal(_parse("+1 877-556-9255"))
    assert (s.status, s.authoritative) == ("malicious", True)
    assert "25 complaints" in s.summary and "robocalls" in s.summary and "Google Listings" in s.summary
    assert "877-556-9255" in str(route.calls[0].request.url)


async def test_a_single_complaint_is_a_warning_not_a_verdict(online):
    with respx.mock:
        respx.get(url__startswith=fcc.FCC_URL).respond(json=rows(1, kind="Live Voice", subject=""))
        s = await fcc.fcc_signal(_parse("+1 406-987-3277"))
    assert s.status == "suspicious" and s.score < 60
    assert s.summary.startswith("1 complaint to the FCC")


async def test_old_complaints_fade(online):
    with respx.mock:
        respx.get(url__startswith=fcc.FCC_URL).respond(json=rows(4, days_ago=500))
        s = await fcc.fcc_signal(_parse("+1 406-987-3277"))
    assert s.status == "suspicious" and s.score <= 30
    assert "none in the past year" in s.summary and "changed hands" not in s.summary


async def test_no_complaints_is_clean(online):
    with respx.mock:
        respx.get(url__startswith=fcc.FCC_URL).respond(json=[])
        s = await fcc.fcc_signal(_parse("+1 650-253-0000"))
    assert s.status == "clean" and "No complaints" in s.summary


async def test_only_us_and_canadian_numbers_are_covered(online):
    with respx.mock:  # any request would fail: there must be none
        s = await fcc.fcc_signal(_parse("+91 98765 43210"))
    assert s.status == "unknown" and "US and Canadian" in s.summary


async def test_lookups_are_cached(online):
    with respx.mock:
        route = respx.get(url__startswith=fcc.FCC_URL).respond(json=rows(2))
        await fcc.fcc_signal(_parse("+1 877-556-9255"))
        await fcc.fcc_signal(_parse("+1 877-556-9255"))
    assert route.call_count == 1


async def test_an_fcc_outage_is_reported_not_hidden(online):
    with respx.mock:
        respx.get(url__startswith=fcc.FCC_URL).respond(500)
        s = await fcc.fcc_signal(_parse("+1 877-556-9255"))
    assert s.status == "error"


async def test_offline_mode_skips_the_lookup():
    with respx.mock:
        s = await fcc.fcc_signal(_parse("+1 877-556-9255"))
    assert s.status == "unknown"


async def test_caller_id_scan_includes_fcc_complaints(online):
    with respx.mock:
        respx.get(url__startswith=fcc.FCC_URL).respond(json=rows(12))
        v = await scan_phone("+1 877-556-9255")
    assert v.level == "HIGH RISK"
    assert any(s.source == "FCC complaints (US)" and s.status == "malicious" for s in v.signals)


async def test_numbers_inside_a_text_are_checked_against_fcc(online):
    with respx.mock:
        respx.get(url__startswith=fcc.FCC_URL).respond(json=rows(8))
        v = await check_text("Your Google listing will be removed today. Call 1-877-556-9255 now.")
    assert any(s.source == "Phone: +18775569255 (FCC)" and s.status == "malicious" for s in v.signals)
