"""
Sample/demo data for the "Load Demo Data" sidebar button.

Every score below was calibrated by hand against real output from the actual
Risk Engine (utils/risk_engine.py) on representative phishing/scam/safe text,
then mapped through the real band_for_score() thresholds — so the levels and
bands you see on the Dashboard / Threat Monitor after loading demo data match
what the engine would actually produce for that kind of content. The preview
text is a short human-readable summary of the scenario, not the literal
analyzed string.

"Load Demo Data" instantly populates the current mock user's scan history so
the Dashboard stat cards, per-module counts, and Threat Monitor charts have
something to show without manually running 15 scans first. "Reset Demo" clears
it back to empty.
"""

import datetime as _dt

import streamlit as st

from utils.risk_engine import band_for_score

# (module title, minutes ago, preview text, score, threat_type)
# Scores are hand-calibrated to match real Risk Engine output bands for this
# kind of content (see utils/risk_engine.py's band thresholds).
DEMO_EVENTS = [
    ("Call Security", 210, "Friend calling to confirm weekend plans", 9, "None"),
    ("SMS Security", 195, "Delivery notification from courier", 11, "None"),
    ("Email Security", 180, "Newsletter subscription confirmation", 14, "None"),
    ("Web Security", 165, "Company blog article on productivity tips", 12, "None"),
    ("File Security", 150, "Shared meeting notes text file", 10, "None"),
    ("SMS Security", 132, "Promotional discount text with a shortened link", 38, "Spam / Unwanted Promotion"),
    ("File Security", 118, "Macro-enabled invoice attachment prompting urgency", 45, "Spam / Unwanted Promotion"),
    ("Call Security", 101, "Robocall about an extended car warranty", 41, "Spam / Unwanted Promotion"),
    ("Web Security", 87, "Shortened link shared in a group chat with urgent framing", 52, "Phishing"),
    ("Call Security", 74, "Caller posing as tech support requesting screen access", 76, "Fraud / Scam"),
    ("Email Security", 63, "Billing update request with account-suspension urgency", 79, "Phishing"),
    ("Web Security", 49, "Visited a known phishing domain requesting OTP", 82, "Phishing"),
    ("Call Security", 35, "Caller impersonating a bank fraud department, requested PIN", 83, "Fraud / Scam"),
    ("Email Security", 21, "Email impersonating PayPal support requesting password", 83, "Phishing"),
    ("SMS Security", 6, "Text impersonating a bank requesting OTP verification code", 82, "Phishing"),
]


def _build_event(module: str, minutes_ago: int, preview: str, score: int, threat_type: str, now: _dt.datetime) -> dict:
    ts = now - _dt.timedelta(minutes=minutes_ago)
    level, _color = band_for_score(score)
    if score < 30:
        threat_type = "None"
    return {
        "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
        "module": module,
        "score": score,
        "level": level,
        "threat_type": threat_type,
        "preview": preview,
    }


def load_demo_data():
    """Populate the current mock user's scan history with realistic demo events."""
    from utils.state import current_history

    history = current_history()
    history.clear()
    now = _dt.datetime.now()
    for module, minutes_ago, preview, score, threat_type in DEMO_EVENTS:
        history.append(_build_event(module, minutes_ago, preview, score, threat_type, now))

    # Also seed a mock trusted contact so the High Risk alert banner has
    # something to point to, unless the user already configured their own.
    if not st.session_state.get("trusted_contact_name"):
        st.session_state.trusted_contact_name = "Alex (demo contact)"
        st.session_state.trusted_contact_info = "alex@example.com"
    st.session_state.notify_on_high_risk = True

    high_risk_events = [e for e in history if e["score"] >= 80]
    if high_risk_events:
        latest = high_risk_events[-1]
        st.session_state.last_alert_banner = (
            f"🔔 Alert sent to **{st.session_state.trusted_contact_name}** — a High Risk event was detected in "
            f"{latest['module']} (score {latest['score']}/100, {latest['threat_type']})."
        )


def reset_demo():
    """Clear the current mock user's scan history and any demo alert banner."""
    from utils.state import current_history

    current_history().clear()
    st.session_state.last_alert_banner = None


def module_stats_for_current_user():
    """Per-module Analyzed / Suspicious / High-Risk counts, used on the
    Dashboard's Module Overview cards."""
    from utils.state import current_history

    history = current_history()
    stats = {}
    for module_title in ["Call Security", "SMS Security", "Email Security", "Web Security", "File Security"]:
        events = [e for e in history if e["module"] == module_title]
        stats[module_title] = {
            "analyzed": len(events),
            "suspicious": len([e for e in events if 60 <= e["score"] < 80]),
            "high_risk": len([e for e in events if e["score"] >= 80]),
        }
    return stats
