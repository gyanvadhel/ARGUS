import streamlit as st

from utils.theme import inject_css, COLORS, simulation_banner
from utils.state import init_state, require_login, log_event
from utils.risk_engine import get_engine, AnalysisResult
from utils.components import page_sidebar, risk_meter_html
from utils.call_assistant import get_assistant_reply, DISCLOSURE_LINE
from utils.examples import CALLER_EXAMPLES

st.set_page_config(page_title="ARGUS — Call Assistant Demo", page_icon="🤖", layout="wide")
init_state()
inject_css()
require_login()

engine = get_engine()

# --- Sidebar: identity + running risk meter for this simulated call ---
with st.sidebar:
    st.markdown("## 🛡️ ARGUS")
    st.caption("Unified Cybersecurity Platform — Testing Demo")
    st.divider()
    st.markdown(f"**{st.session_state.get('user_name', 'Guest')}**")
    st.session_state.simple_mode = st.toggle(
        "Simple Mode (for family members)", value=st.session_state.get("simple_mode", False)
    )
    st.divider()
    st.markdown("### 📟 Live Call Risk")
    score = st.session_state.get("call_assistant_score", 0)
    color = COLORS["green"] if score < 30 else COLORS["amber"] if score < 80 else COLORS["red"]
    st.markdown(risk_meter_html(score, color), unsafe_allow_html=True)
    st.markdown(f"<div style='margin-top:0.4rem; font-weight:700; color:{color};'>{score}/100</div>", unsafe_allow_html=True)
    st.caption("Updates turn-by-turn as the simulated call progresses.")

st.markdown("# 🤖 Call Assistant Demo")
simulation_banner()
st.markdown(
    '<span class="argus-muted">Type messages as if you were an unknown caller reaching the AI-screened '
    "protected number. The assistant screens the call live, the same way it would in the production vision.</span>",
    unsafe_allow_html=True,
)
st.write("")

# --- Incoming caller ID check: auto-decline known scam numbers before the call "rings" ---
st.markdown('<div class="argus-card" style="padding:0.9rem 1.2rem;">', unsafe_allow_html=True)
st.markdown("**📞 Start a new simulated call**")
st.markdown(
    '<span class="argus-muted">Enter a caller ID before starting. If it matches a known scam number in the local '
    'threat-intel list, ARGUS auto-declines the call before it ever reaches the chat — just like it would with a '
    'real blocklist in production. Try <code>1-800-555-0142</code> or <code>1-800-555-0199</code>, or leave it blank '
    'for an unknown/unlisted caller.</span>',
    unsafe_allow_html=True,
)
call_col1, call_col2 = st.columns([3, 1])
with call_col1:
    caller_id_input = st.text_input(
        "Caller ID / phone number (optional)",
        placeholder="e.g. 1-800-555-0142",
        key="call_assistant_caller_id",
        label_visibility="collapsed",
    )
with call_col2:
    start_call_clicked = st.button("📞 Start call", key="call_assistant_start_call", width="stretch")
st.markdown("</div>", unsafe_allow_html=True)
st.write("")

if start_call_clicked:
    blocked_entry = engine.lookup_phone(caller_id_input) if caller_id_input.strip() else None
    st.session_state.call_assistant_transcript = []
    st.session_state.call_assistant_score = 0
    st.session_state.call_assistant_outcome = None
    st.session_state.pop("call_assistant_mode", None)
    if blocked_entry:
        st.session_state.call_assistant_blocked = True
        st.session_state.call_assistant_blocked_entry = blocked_entry
        st.session_state.call_assistant_blocked_number = caller_id_input.strip()
        blocked_result = AnalysisResult(
            score=95,
            level="HIGH RISK",
            color=COLORS["red"],
            threat_type=blocked_entry["category"],
            confidence=1.0,
            indicators=[f"[THREAT INTEL] Caller ID matched known {blocked_entry['category']} number: {blocked_entry['indicator']}"],
            recommendation="Call automatically declined — this number is on the local threat-intelligence blocklist.",
        )
        log_event("Call Assistant Demo", blocked_result, source_preview=f"Blocked incoming call from {caller_id_input.strip()}")
    else:
        st.session_state.call_assistant_blocked = False
        st.session_state.call_assistant_blocked_entry = None
        st.session_state.call_assistant_blocked_number = None
    st.rerun()

if st.session_state.get("call_assistant_blocked"):
    entry = st.session_state.get("call_assistant_blocked_entry") or {}
    number = st.session_state.get("call_assistant_blocked_number", "")
    st.markdown(
        f"""
        <div class="argus-banner-danger">
        📵 Call not answered — <b>{number}</b> is a known {entry.get('category', 'threat')} number and was
        automatically blocked before it could ring through. No conversation took place.
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.markdown(
        f"""
        <div class="argus-card">
            <b>Blocklist match details</b><br>
            <span class="argus-muted">
            Number: {number}<br>
            Category: {entry.get('category', '—')}<br>
            Note: {entry.get('notes', '—')}
            </span>
        </div>
        """,
        unsafe_allow_html=True,
    )
    if st.session_state.get("trusted_contact_name") and st.session_state.get("notify_on_high_risk"):
        st.markdown(
            f'<div class="argus-banner-info">🔔 Alert sent to <b>{st.session_state.trusted_contact_name}</b> — '
            f'a call from a known scam number ({number}) was automatically blocked.</div>',
            unsafe_allow_html=True,
        )
    st.write("")
    if st.button("🔄 Start a different call", key="call_assistant_unblock", width="stretch"):
        st.session_state.call_assistant_blocked = False
        st.session_state.call_assistant_blocked_entry = None
        st.session_state.call_assistant_blocked_number = None
        st.rerun()
    st.stop()

transcript = st.session_state.call_assistant_transcript

# Seed the transcript with the disclosure line if empty
if not transcript:
    transcript.append({"role": "assistant", "text": DISCLOSURE_LINE})


def submit_caller_message(text: str):
    transcript.append({"role": "caller", "text": text})

    # Score the full caller-side conversation so far for a stable running signal
    caller_text = " ".join(t["text"] for t in transcript if t["role"] == "caller")
    result = engine.analyze_text(caller_text, channel="call_assistant")
    st.session_state.call_assistant_score = result.score
    log_event("Call Assistant Demo", result, source_preview=text)

    reply_text, mode = get_assistant_reply(transcript, result)
    transcript.append({"role": "assistant", "text": reply_text})
    st.session_state["call_assistant_mode"] = mode
    st.rerun()


# --- Example loader: send a pre-written caller message in one click ---
st.markdown('<div class="argus-card" style="padding:0.9rem 1.2rem;">', unsafe_allow_html=True)
st.markdown("**📋 Load example caller message** — send a pre-written line instead of typing your own.")
ex_col1, ex_col2 = st.columns([3, 1])
with ex_col1:
    example_label = st.selectbox(
        "Example caller message",
        options=[e["label"] for e in CALLER_EXAMPLES],
        key="call_assistant_example_select",
        label_visibility="collapsed",
    )
with ex_col2:
    load_example_clicked = st.button("Send as caller", key="call_assistant_load_example", width='stretch')
st.markdown("</div>", unsafe_allow_html=True)
st.write("")

if load_example_clicked:
    chosen = next(e for e in CALLER_EXAMPLES if e["label"] == example_label)
    submit_caller_message(chosen["text"])

# --- Render transcript as a chat thread ---
for turn in transcript:
    role = "user" if turn["role"] == "caller" else "assistant"
    avatar = "📞" if role == "user" else "🤖"
    with st.chat_message(role, avatar=avatar):
        st.write(turn["text"])

caller_input = st.chat_input("Type the unknown caller's next message…")

if caller_input:
    submit_caller_message(caller_input)

if st.session_state.get("call_assistant_mode"):
    st.caption(f"Assistant response mode: {st.session_state['call_assistant_mode']}")

st.write("")
st.markdown("### Manual Outcome (demo controls)")
st.caption("These buttons simulate what the branching UX would show — normally this would trigger automatically based on the risk score.")

col1, col2, col3 = st.columns([1, 1, 2])
with col1:
    if st.button("✅ Looks safe → connect call", width='stretch'):
        st.session_state.call_assistant_outcome = "safe"
with col2:
    if st.button("🚫 High risk → end call & alert", width='stretch'):
        st.session_state.call_assistant_outcome = "high_risk"
with col3:
    if st.button("🔄 Reset simulated call", width='stretch'):
        st.session_state.call_assistant_transcript = []
        st.session_state.call_assistant_score = 0
        st.session_state.call_assistant_outcome = None
        st.session_state.call_assistant_blocked = False
        st.session_state.call_assistant_blocked_entry = None
        st.session_state.call_assistant_blocked_number = None
        st.session_state.pop("call_assistant_mode", None)
        st.rerun()

outcome = st.session_state.get("call_assistant_outcome")
if outcome == "safe":
    st.markdown(
        '<div class="argus-banner-safe">✅ Call connected — no significant risk detected. Passing the caller through.</div>',
        unsafe_allow_html=True,
    )
elif outcome == "high_risk":
    contact = st.session_state.get("trusted_contact_name") or "your trusted contact"
    caller_summary_score = st.session_state.get("call_assistant_score", 0)
    st.markdown(
        '<div class="argus-banner-danger">🚫 Call ended — high risk detected. No information was shared.</div>',
        unsafe_allow_html=True,
    )
    st.markdown(
        f"""
        <div class="argus-card">
            <b>🔔 Trusted contact notified (simulated)</b><br>
            <span class="argus-muted">Alert sent to <b>{contact}</b>: "Someone called claiming to need account or personal
            information, scored {caller_summary_score}/100 risk. No information was shared, and the call was ended
            automatically."</span>
        </div>
        """,
        unsafe_allow_html=True,
    )
