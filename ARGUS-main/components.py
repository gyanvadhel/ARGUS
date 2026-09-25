"""Reusable result-card component, shared by every security module page."""

import streamlit as st
from utils.theme import COLORS, level_badge_html
from utils import sample_data


def page_sidebar():
    """Standard sidebar block reused on every page: identity + Simple Mode toggle."""
    with st.sidebar:
        st.markdown("## 🛡️ ARGUS")
        st.caption("Unified Cybersecurity Platform — Testing Demo")
        st.divider()
        st.markdown(f"**{st.session_state.get('user_name', 'Guest')}**")
        if st.session_state.get("user_email"):
            st.caption(st.session_state.user_email)
        st.session_state.simple_mode = st.toggle(
            "Simple Mode (for family members)",
            value=st.session_state.get("simple_mode", False),
            help="Shows plain-language verdicts first, with technical details tucked behind an expander.",
        )
        st.divider()
        st.markdown("**DEMO DATA**")
        d1, d2 = st.columns(2)
        with d1:
            if st.button("Load Demo", width='stretch', key="sidebar_load_demo", help="Populate the dashboard and Threat Monitor with realistic sample scan history."):
                sample_data.load_demo_data()
                st.rerun()
        with d2:
            if st.button("Reset Demo", width='stretch', key="sidebar_reset_demo", help="Clear all scan history for this user."):
                sample_data.reset_demo()
                st.rerun()
        st.divider()

PLAIN_VERDICT = {
    "SAFE": ("✅", "This looks safe.", COLORS["green"]),
    "LOW/MODERATE": ("🟡", "This looks mostly okay, but stay a little careful.", COLORS["amber"]),
    "SUSPICIOUS": ("⚠️", "This looks like it could be a scam — be careful.", COLORS["amber"]),
    "HIGH RISK": ("🚫", "This looks like a scam — don't click or share anything.", COLORS["red"]),
}

PLAIN_ACTION = {
    "SAFE": "You don't need to do anything.",
    "LOW/MODERATE": "It's probably fine, but don't share passwords or codes just to be safe.",
    "SUSPICIOUS": "Don't click any links or give out information. Ask a trusted person if unsure.",
    "HIGH RISK": "Don't reply, click, or share anything. Delete it or hang up, and tell a trusted contact.",
}


def render_result_card(result, simple_mode: bool = False, source_preview: str = ""):
    """Render a risk_engine.AnalysisResult as either a Simple Mode plain-language
    card or the full technical card, depending on the toggle."""

    if simple_mode:
        icon, verdict, color = PLAIN_VERDICT.get(result.level, PLAIN_VERDICT["SAFE"])
        action = PLAIN_ACTION.get(result.level, "")
        st.markdown(
            f"""
            <div class="argus-card" style="text-align:center; border-color:{color};">
                <div style="font-size:3.5rem;">{icon}</div>
                <div style="font-size:1.6rem; font-weight:800; color:{color}; margin:0.3rem 0;">{verdict}</div>
                <div class="argus-muted" style="font-size:1.05rem; color:{COLORS['text']};">{action}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        with st.expander("Show technical details"):
            _render_technical_body(result)
    else:
        st.markdown('<div class="argus-card">', unsafe_allow_html=True)
        _render_technical_body(result, big=True)
        st.markdown("</div>", unsafe_allow_html=True)


def _render_technical_body(result, big: bool = False):
    score_size = "3rem" if big else "2rem"
    st.markdown(
        f"""
        <div style="display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">
            <div class="argus-score" style="font-size:{score_size}; color:{result.color};">{result.score}<span style="font-size:1.1rem; color:{COLORS['muted']};">/100</span></div>
            {level_badge_html(result.level, result.color)}
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.write("")
    c1, c2, c3 = st.columns(3)
    c1.markdown(f"**Threat type**<br><span class='argus-muted'>{result.threat_type}</span>", unsafe_allow_html=True)
    c2.markdown(f"**Confidence**<br><span class='argus-muted'>{int(result.confidence * 100)}%</span>", unsafe_allow_html=True)
    c3.markdown(
        f"**Signal mix**<br><span class='argus-muted'>ML {result.ml_score:.0f} · Rules {result.rule_score:.0f} · Intel {result.intel_score:.0f}</span>",
        unsafe_allow_html=True,
    )
    st.write("")
    st.markdown("**Indicators**")
    for ind in result.indicators:
        st.markdown(f'<div class="argus-pill">{ind}</div>', unsafe_allow_html=True)
    st.write("")
    st.markdown(f"**Recommendation:** {result.recommendation}")


def risk_meter_html(score: int, color: str) -> str:
    """Small horizontal meter used in the Call Assistant sidebar."""
    pct = max(0, min(100, score))
    return f"""
    <div style="background-color:#1E1E22; border:1px solid {COLORS['border']}; border-radius:999px; height:14px; width:100%; overflow:hidden;">
        <div style="background-color:{color}; height:100%; width:{pct}%; transition: width 0.3s;"></div>
    </div>
    """
