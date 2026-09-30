import httpx
import pytest
import respx

from argus_api.checkers.phone import _parse, scan_phone
from argus_api.intel import fcc, ipqs

NUMBER = "+91 99093 30939"


def answer(**fields):
    base = {"success": True, "valid": True, "fraud_score": 0, "spammer": False, "recent_abuse": False, "risky": False,
            "line_type": "Wireless", "country": "IN", "message": "Phone is valid."}
    return {**base, **fields}


@pytest.fixture
def keyed(monkeypatch):
    monkeypatch.delenv("ARGUS_OFFLINE", raising=False)
    monkeypatch.setenv(ipqs.KEY_NAME, "test-key")
    ipqs.clear_cache()


async def test_not_set_up_without_a_key():
    s = await ipqs.ipqs_signal(_parse(NUMBER))
    assert s.status == "unavailable" and ipqs.KEY_NAME in s.summary


async def test_spam_reports_and_recent_fraud_are_high_risk(keyed):
    with respx.mock:
        route = respx.get(url__startswith=ipqs.IPQS_BASE).respond(json=answer(fraud_score=97, spammer=True, recent_abuse=True))
        s = await ipqs.ipqs_signal(_parse(NUMBER))
    assert s.status == "malicious" and s.score >= 85
    assert "spam" in s.summary and "fraud" in s.summary
    assert str(route.calls[0].request.url).endswith("/test-key/919909330939")  # key and number in the path, digits only


async def test_spam_reports_alone_are_a_warning(keyed):
    with respx.mock:
        respx.get(url__startswith=ipqs.IPQS_BASE).respond(json=answer(fraud_score=70, spammer=True))
        s = await ipqs.ipqs_signal(_parse(NUMBER))
    assert (s.status, s.score) == ("suspicious", 70)
    assert s.evidence["threat_type"] == "Reported spam caller"


async def test_a_high_risk_score_without_reports_is_a_milder_warning(keyed):
    with respx.mock:
        respx.get(url__startswith=ipqs.IPQS_BASE).respond(json=answer(fraud_score=88, risky=True))
        s = await ipqs.ipqs_signal(_parse(NUMBER))
    assert s.status == "suspicious" and 40 <= s.score < 70
    assert "88/100" in s.summary


async def test_a_clean_number_says_so_with_its_score(keyed):
    with respx.mock:
        respx.get(url__startswith=ipqs.IPQS_BASE).respond(json=answer(fraud_score=12))
        s = await ipqs.ipqs_signal(_parse(NUMBER))
    assert s.status == "clean" and "No spam or fraud reports" in s.summary and "12/100" in s.summary


async def test_a_refusal_is_shown_and_not_cached(keyed):
    with respx.mock:
        route = respx.get(url__startswith=ipqs.IPQS_BASE).respond(json={"success": False, "message": "You have exceeded your request quota."})
        first = await ipqs.ipqs_signal(_parse(NUMBER))
        await ipqs.ipqs_signal(_parse(NUMBER))
    assert first.status == "unavailable" and "quota" in first.summary
    assert route.call_count == 2


async def test_answers_are_cached_to_save_free_lookups(keyed):
    with respx.mock:
        route = respx.get(url__startswith=ipqs.IPQS_BASE).respond(json=answer(fraud_score=5))
        await ipqs.ipqs_signal(_parse(NUMBER))
        await ipqs.ipqs_signal(_parse(NUMBER))
    assert route.call_count == 1


async def test_an_outage_is_an_error_that_never_leaks_the_key(keyed):
    with respx.mock:
        respx.get(url__startswith=ipqs.IPQS_BASE).mock(side_effect=httpx.ConnectTimeout("timed out"))
        s = await ipqs.ipqs_signal(_parse(NUMBER))
    assert s.status == "error" and "test-key" not in s.summary


async def test_caller_id_includes_ipqs(keyed):
    fcc.clear_cache()
    with respx.mock:
        respx.get(url__startswith=ipqs.IPQS_BASE).respond(json=answer(fraud_score=97, spammer=True, recent_abuse=True))
        v = await scan_phone(NUMBER)
    assert any(s.source == ipqs.SOURCE and s.status == "malicious" for s in v.signals)
    assert v.score >= 80
