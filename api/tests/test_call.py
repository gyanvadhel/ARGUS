import random

from argus_api import call
from argus_api.call import CallTurnRequest, Turn, analyze_call, reply_to, scripted_reply

SCAM = ("This is your bank's fraud department calling from 1-800-555-0142, we noticed suspicious activity, "
        "please confirm your pin and card number immediately, do not tell your family, keep this confidential.")


def req(*caller_lines):
    turns = [Turn(role="assistant", text=call.DISCLOSURE_LINE)]
    turns += [Turn(role="caller", text=t) for t in caller_lines]
    return CallTurnRequest(transcript=turns)


def test_scam_call_scores_high():
    assert analyze_call(req(SCAM).transcript).score >= 60


def test_scripted_high_risk_reply_ends_call():
    reply = scripted_reply(analyze_call(req(SCAM).transcript), rng=random.Random(0))
    assert "end" in reply.lower()


def test_without_key_uses_scripted():
    assert reply_to(req("Hi, wrong number, sorry")).mode == "scripted"


def test_llm_failure_falls_back(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.setattr(call, "llm_reply", lambda *a: (_ for _ in ()).throw(RuntimeError("down")))
    assert reply_to(req("hello")).mode == "scripted"


def test_llm_used_when_available(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.setattr(call, "llm_reply", lambda *a: "Who is calling, please?")
    r = reply_to(req("hello"))
    assert (r.mode, r.reply) == ("Claude", "Who is calling, please?")


def test_messages_start_with_the_caller_and_merge_turns():
    turns = req("hello", "it's about your account").transcript
    assert call.to_messages(turns) == [{"role": "user", "content": "hello\nit's about your account"}]
