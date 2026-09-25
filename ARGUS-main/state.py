"""
Session-state helpers.

Everything here is intentionally mocked / in-memory only:
- "auth" is a fake name+email gate, no password checking, no real backend
- "scan history" and "stats" live in st.session_state, keyed by the mock user's name
- "trusted contact" is stored in session state only, nothing is actually sent

None of this persists between browser sessions or app restarts. It exists purely
to let the demo test the *shape* of these production features.
"""

import datetime as _dt
import streamlit as st


def init_state():
    defaults = {
        "logged_in": False,
        "user_name": "",
        "user_email": "",
        "simple_mode": False,
        "trusted_contact_name": "",
        "trusted_contact_info": "",
        "notify_on_high_risk": True,
        "users_history": {},  # {user_name: [event, ...]}
        "call_assistant_transcript": [],
        "call_assistant_score": 0,
        "call_assistant_outcome": None,
        "call_assistant_blocked": False,
        "call_assistant_blocked_entry": None,
        "call_assistant_blocked_number": None,
        "last_alert_banner": None,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


def current_history():
    user = st.session_state.get("user_name") or "guest"
    st.session_state.users_history.setdefault(user, [])
    return st.session_state.users_history[user]


def log_event(module: str, result, source_preview: str = ""):
    """Append a scan event to the current mock user's history and fire the
    mocked trusted-contact alert if the score crosses the High Risk threshold."""
    history = current_history()
    event = {
        "timestamp": _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "module": module,
        "score": result.score,
        "level": result.level,
        "threat_type": result.threat_type,
        "preview": (source_preview[:80] + "…") if len(source_preview) > 80 else source_preview,
    }
    history.append(event)

    if result.score >= 80 and st.session_state.get("notify_on_high_risk"):
        contact = st.session_state.get("trusted_contact_name")
        if contact:
            st.session_state.last_alert_banner = (
                f"🔔 Alert sent to **{contact}** — a High Risk event was detected in "
                f"{module} (score {result.score}/100, {result.threat_type})."
            )

    return event


def require_login():
    """Call at the top of every page. Blocks the page content with a friendly
    message if the mock login hasn't been completed on the main app.py screen."""
    if not st.session_state.get("logged_in"):
        st.warning("Please sign in from the main **ARGUS** page first (see the app navigation).")
        st.stop()


def stats_for_current_user():
    history = current_history()
    total = len(history)
    threats = len([h for h in history if h["score"] >= 60])
    safe = len([h for h in history if h["score"] < 30])
    high_risk = len([h for h in history if h["score"] >= 80])
    return {
        "total": total,
        "threats": threats,
        "safe": safe,
        "high_risk": high_risk,
    }
