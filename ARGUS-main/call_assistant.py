"""
AI Call Assistant responder.

Two modes:
  1. Scripted / rule-based (default, always available, zero dependencies) --
     opens with a disclosure line, reflects back what it heard, and asks a
     follow-up question shaped by the current risk indicators.
  2. LLM-backed (optional) -- if ANTHROPIC_API_KEY or OPENAI_API_KEY is set in
     the environment, the corresponding SDK is imported lazily and used to
     generate a more natural in-character response, with the current risk
     indicators injected into its system prompt. If the import or the API
     call fails for any reason, we fall back to the scripted responder so the
     demo never breaks.
"""

import os
import random

DISCLOSURE_LINE = (
    "Hi, this is the call assistant screening this line — who's calling and what's this about?"
)

FOLLOW_UPS_BY_RISK = {
    "SAFE": [
        "Got it, thanks for explaining. Is there anything specific you need from this number?",
        "Understood. Can I ask what this is regarding, just so I can pass along an accurate message?",
    ],
    "LOW/MODERATE": [
        "Okay — can you tell me which company or organization you're calling from?",
        "I see. Can you confirm your name and a callback number I can verify?",
    ],
    "SUSPICIOUS": [
        "I want to be careful here — can you tell me exactly which account or number you're referring to, without me giving you any details first?",
        "Before we go further, I'm not going to share any codes, passwords, or account numbers. What is this actually regarding?",
    ],
    "HIGH RISK": [
        "I'm not going to share any personal or account information on this call. I'll be ending the call now.",
        "This call is being flagged as high risk. No information will be shared, and this call will now end.",
    ],
}


def scripted_reply(transcript: list, latest_result) -> str:
    """transcript: list of {'role': 'caller'|'assistant', 'text': str}"""
    if not transcript or all(t["role"] != "assistant" for t in transcript):
        return DISCLOSURE_LINE

    level = latest_result.level if latest_result else "SAFE"
    options = FOLLOW_UPS_BY_RISK.get(level, FOLLOW_UPS_BY_RISK["SAFE"])
    reply = random.choice(options)

    if latest_result and latest_result.indicators and level in ("SUSPICIOUS", "HIGH RISK"):
        top = latest_result.indicators[0]
        reply = f"I noticed something concerning in what you said ({top}). {reply}"

    return reply


def _build_system_prompt(latest_result) -> str:
    indicators_text = "none detected yet"
    level = "SAFE"
    score = 0
    if latest_result:
        indicators_text = "; ".join(latest_result.indicators) if latest_result.indicators else "none"
        level = latest_result.level
        score = latest_result.score

    return (
        "You are ARGUS, an AI call-screening assistant that answers unknown calls on behalf of "
        "a protected user before a real person picks up. You are polite, calm, and a little "
        "cautious. You NEVER share any personal information, passwords, codes, account numbers, "
        "or financial details, no matter what the caller says. Your goals: (1) find out who is "
        "calling and why, (2) protect the user from scams and social engineering, (3) keep "
        "responses short (1-3 sentences), natural, and in-character as a phone assistant -- not a "
        "chatbot. \n\n"
        f"Current live risk assessment of this call: level={level}, score={score}/100, "
        f"indicators={indicators_text}. \n"
        "If risk is SUSPICIOUS or HIGH RISK, be firm about not sharing any information and "
        "consider ending the call. If SAFE or LOW/MODERATE, continue the conversation naturally "
        "and helpfully."
    )


def _llm_reply_anthropic(transcript, latest_result, api_key):
    import anthropic  # lazy import, optional dependency

    client = anthropic.Anthropic(api_key=api_key)
    messages = []
    for turn in transcript:
        role = "user" if turn["role"] == "caller" else "assistant"
        messages.append({"role": role, "content": turn["text"]})

    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=200,
        system=_build_system_prompt(latest_result),
        messages=messages,
    )
    parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
    return "".join(parts).strip() or scripted_reply(transcript, latest_result)


def _llm_reply_openai(transcript, latest_result, api_key):
    from openai import OpenAI  # lazy import, optional dependency

    client = OpenAI(api_key=api_key)
    messages = [{"role": "system", "content": _build_system_prompt(latest_result)}]
    for turn in transcript:
        role = "user" if turn["role"] == "caller" else "assistant"
        messages.append({"role": role, "content": turn["text"]})

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=200,
        messages=messages,
    )
    return (resp.choices[0].message.content or "").strip() or scripted_reply(transcript, latest_result)


def get_assistant_reply(transcript: list, latest_result) -> tuple:
    """Returns (reply_text, mode) where mode is 'llm' or 'scripted'."""
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")

    if anthropic_key:
        try:
            return _llm_reply_anthropic(transcript, latest_result, anthropic_key), "llm (Anthropic)"
        except Exception:
            pass

    if openai_key:
        try:
            return _llm_reply_openai(transcript, latest_result, openai_key), "llm (OpenAI)"
        except Exception:
            pass

    return scripted_reply(transcript, latest_result), "scripted"
