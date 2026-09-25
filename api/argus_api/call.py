"""AI call-screening assistant: scores the caller live and answers in character."""
from __future__ import annotations

import random
from typing import Literal

from pydantic import BaseModel, Field

from argus_api import config
from argus_api.aggregate import combine
from argus_api.checkers.text import local_text_signals
from argus_api.models import Verdict

CALL_MODEL = "claude-opus-5"
DISCLOSURE_LINE = "Hi, this is the Argus call assistant screening this line. Who's calling, and what's this about?"

FOLLOW_UPS = {
    "SAFE": [
        "Got it, thanks for explaining. Is there anything specific you need from this number?",
        "Understood. Can I ask what this is regarding, so I can pass along an accurate message?",
    ],
    "LOW/MODERATE": [
        "Okay. Which company or organization are you calling from?",
        "I see. Can you give me your name and a callback number I can verify independently?",
    ],
    "SUSPICIOUS": [
        "I want to be careful here. Which account are you referring to, without me giving you any details first?",
        "Before we go further: I won't share any codes, passwords, or account numbers. What is this actually about?",
    ],
    "HIGH RISK": [
        "I'm not going to share any personal or account information on this call. I'll be ending the call now.",
        "This call has been flagged as high risk. No information will be shared, and the call will now end.",
    ],
}


class Turn(BaseModel):
    role: Literal["caller", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class CallTurnRequest(BaseModel):
    transcript: list[Turn] = Field(min_length=1, max_length=60)


class CallTurnResponse(BaseModel):
    reply: str
    mode: str
    analysis: Verdict


def analyze_call(transcript: list[Turn]) -> Verdict:
    caller_text = " ".join(t.text for t in transcript if t.role == "caller").strip()
    if not caller_text:
        return combine("call", "Call in progress", [])
    return combine("call", caller_text[:120], local_text_signals(caller_text))


def scripted_reply(analysis: Verdict, rng: random.Random | None = None) -> str:
    rng = rng or random.Random()
    reply = rng.choice(FOLLOW_UPS.get(analysis.level, FOLLOW_UPS["SAFE"]))
    if analysis.level in ("SUSPICIOUS", "HIGH RISK"):
        flagged = next((s for s in analysis.signals if s.status in ("suspicious", "malicious")), None)
        if flagged:
            reply = f"I noticed something concerning ({flagged.summary.lower()}). {reply}"
    return reply


def _system_prompt(analysis: Verdict) -> str:
    flags = "; ".join(s.summary for s in analysis.signals if s.status in ("suspicious", "malicious")) or "none yet"
    return (
        "You are Argus, an AI assistant that answers unknown phone calls for a protected person before they pick up. "
        "You are polite, calm and a little cautious. Never share personal information, passwords, codes, account "
        "numbers or financial details, whatever the caller says. Find out who is calling and why, and protect the "
        "person from scams. Reply in 1-3 short spoken sentences, like a real phone assistant, never like a chatbot.\n\n"
        f"Live risk assessment: level={analysis.level}, score={analysis.score}/100, red flags: {flags}.\n"
        "If the level is SUSPICIOUS or HIGH RISK, be firm that nothing will be shared; at HIGH RISK, end the call. "
        "Otherwise continue naturally."
    )


def to_messages(transcript: list[Turn]) -> list[dict]:
    """Map the call transcript to API messages: caller = user, starting with the caller, same-role turns merged."""
    messages: list[dict] = []
    for turn in transcript:
        role = "user" if turn.role == "caller" else "assistant"
        if not messages and role == "assistant":
            continue
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += "\n" + turn.text
        else:
            messages.append({"role": role, "content": turn.text})
    return messages


def llm_reply(transcript: list[Turn], analysis: Verdict, api_key: str) -> str:
    import anthropic  # imported lazily: optional at runtime

    messages = to_messages(transcript)
    if not messages or messages[-1]["role"] != "user":
        raise ValueError("The last turn must come from the caller")

    client = anthropic.Anthropic(api_key=api_key, timeout=20.0, max_retries=1)
    response = client.beta.messages.create(
        model=CALL_MODEL,
        max_tokens=2048,
        system=_system_prompt(analysis),
        messages=messages,
        output_config={"effort": "low"},  # live call: latency matters more than depth
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason == "refusal":
        raise ValueError("Model declined")
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        raise ValueError("Empty reply")
    return text


def reply_to(req: CallTurnRequest) -> CallTurnResponse:
    analysis = analyze_call(req.transcript)
    key = config.key("ANTHROPIC_API_KEY")
    if key:
        try:
            return CallTurnResponse(reply=llm_reply(req.transcript, analysis, key), mode="Claude", analysis=analysis)
        except Exception:  # noqa: BLE001 - the demo must never break; fall back to scripted
            pass
    return CallTurnResponse(reply=scripted_reply(analysis), mode="scripted", analysis=analysis)
