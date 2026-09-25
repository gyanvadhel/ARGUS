import streamlit as st

from utils.theme import inject_css, COLORS
from utils.state import init_state, stats_for_current_user, current_history
from utils.risk_engine import get_engine
from utils import sample_data

st.set_page_config(
    page_title="ARGUS — Unified Cybersecurity Platform",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded",
)

init_state()
inject_css()

# Load/train the risk engine once per server process
get_engine()


def render_login():
    st.markdown(
        f"""
        <div style="max-width: 480px; margin: 4rem auto 0 auto;" class="argus-card">
            <div style="text-align:center;">
                <div style="font-size:2.5rem;">🛡️</div>
                <h2 style="margin-top:0.25rem;">ARGUS</h2>
                <p class="argus-muted">Unified AI Cybersecurity Platform — Testing Demo</p>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    col_a, col_b, col_c = st.columns([1, 2, 1])
    with col_b:
        with st.form("mock_login_form"):
            st.markdown("**Sign in (demo)**")
            name = st.text_input("Name", placeholder="e.g. Priya Shah")
            email = st.text_input("Email (optional)", placeholder="you@example.com")
            st.caption(
                "This is a mocked login for testing the personalized-user concept. "
                "No password is checked and no account is actually created."
            )
            submitted = st.form_submit_button("Continue", width='stretch')
            if submitted:
                if not name.strip():
                    st.error("Please enter a name to continue.")
                else:
                    st.session_state.logged_in = True
                    st.session_state.user_name = name.strip()
                    st.session_state.user_email = email.strip()
                    st.rerun()


def render_dashboard():
    st.markdown(
        f"""
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <h1 style="margin-bottom:0;">🛡️ ARGUS Dashboard</h1>
                <p class="argus-muted">Signed in as <b>{st.session_state.user_name}</b> · Unified Risk Engine active</p>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if st.session_state.get("last_alert_banner"):
        st.markdown(
            f'<div class="argus-banner-danger">{st.session_state.last_alert_banner}</div>',
            unsafe_allow_html=True,
        )
        st.write("")

    stats = stats_for_current_user()
    c1, c2, c3, c4 = st.columns(4)
    _stat_card(c1, "Total Scans", stats["total"], COLORS["teal"])
    _stat_card(c2, "Threats Detected", stats["threats"], COLORS["amber"])
    _stat_card(c3, "Safe Interactions", stats["safe"], COLORS["green"])
    _stat_card(c4, "High-Risk Events", stats["high_risk"], COLORS["red"])

    st.write("")
    left, right = st.columns([2, 1])

    with left:
        st.markdown("### Module Overview")
        modules = [
            ("📞 Call Security", "Analyzes call transcripts/content for scam and social-engineering patterns.", "Call Security"),
            ("💬 SMS Security", "Scores text messages for phishing, spam, and fraud indicators.", "SMS Security"),
            ("✉️ Email Security", "Scans email content for phishing and business-email-compromise patterns.", "Email Security"),
            ("🌐 Web Security", "Checks URLs/page content against rules and local threat intel.", "Web Security"),
            ("📁 File Security", "Flags risky filenames/content signals for uploaded files.", "File Security"),
        ]
        mod_stats = sample_data.module_stats_for_current_user()
        for name, desc, module_key in modules:
            s = mod_stats.get(module_key, {"analyzed": 0, "suspicious": 0, "high_risk": 0})
            st.markdown(
                f"""
                <div class="argus-card" style="padding:0.9rem 1.2rem;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
                        <div>
                            <b>{name}</b><br><span class="argus-muted">{desc}</span>
                        </div>
                        <div style="text-align:right; white-space:nowrap;">
                            <span class="argus-muted" style="font-size:0.8rem;">Analyzed</span><br>
                            <b>{s['analyzed']}</b>
                            <span class="argus-muted" style="font-size:0.8rem; margin-left:0.6rem;">Suspicious/High Risk</span><br>
                            <b style="color:{COLORS['amber'] if s['suspicious'] or s['high_risk'] else COLORS['text']};">{s['suspicious']} / {s['high_risk']}</b>
                        </div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    with right:
        st.markdown("### System Status")
        st.markdown(
            f"""
            <div class="argus-card">
                <div>🟢 Risk Engine: <b style="color:{COLORS['green']};">Online</b></div>
                <div>🟢 ML Classifier: <b style="color:{COLORS['green']};">Trained &amp; Ready</b></div>
                <div>🟢 Threat Intel CSV: <b style="color:{COLORS['green']};">Loaded</b></div>
                <div>🟡 Telephony / Email / SMS interception: <b style="color:{COLORS['amber']};">Not connected (prototype)</b></div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown("### Quick Tips")
        st.markdown(
            """
            <div class="argus-card">
            <span class="argus-muted">
            Use the sidebar to try each security module, explore the new
            <b>Call Assistant Demo</b>, set up a <b>Trusted Contact</b>, or toggle
            <b>Simple Mode</b> to test the elderly-accessible UX.
            </span>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.write("")
    st.markdown("### Recent Activity")
    history = current_history()
    if not history:
        st.info("No scans yet. Try any Security module from the sidebar to generate activity.")
    else:
        st.dataframe(
            list(reversed(history[-10:])),
            width='stretch',
            hide_index=True,
        )


def _stat_card(col, label, value, color):
    with col:
        st.markdown(
            f"""
            <div class="argus-card" style="text-align:center;">
                <div style="font-size:2.2rem; font-weight:800; color:{color};">{value}</div>
                <div class="argus-muted">{label}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )


# --- Sidebar (shown always, even pre-login, minus the module links) ---
with st.sidebar:
    st.markdown("## 🛡️ ARGUS")
    st.caption("Unified Cybersecurity Platform — Testing Demo")
    st.divider()
    if st.session_state.logged_in:
        st.markdown(f"**{st.session_state.user_name}**")
        if st.session_state.user_email:
            st.caption(st.session_state.user_email)
        st.session_state.simple_mode = st.toggle(
            "Simple Mode (for family members)",
            value=st.session_state.simple_mode,
            help="Shows plain-language verdicts first, with technical details tucked behind an expander.",
        )
        st.divider()
        st.markdown("**DEMO DATA**")
        d1, d2 = st.columns(2)
        with d1:
            if st.button("Load Demo", width='stretch', key="dash_load_demo", help="Populate the dashboard and Threat Monitor with realistic sample scan history."):
                sample_data.load_demo_data()
                st.rerun()
        with d2:
            if st.button("Reset Demo", width='stretch', key="dash_reset_demo", help="Clear all scan history for this user."):
                sample_data.reset_demo()
                st.rerun()
        st.divider()
        if st.button("Log out", width='stretch', key="dash_logout"):
            st.session_state.logged_in = False
            st.session_state.user_name = ""
            st.session_state.user_email = ""
            st.rerun()
    else:
        st.caption("Sign in to begin.")

# --- Main content ---
if not st.session_state.logged_in:
    render_login()
else:
    render_dashboard()
