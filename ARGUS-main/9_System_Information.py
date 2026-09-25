import streamlit as st

from utils.theme import inject_css
from utils.state import init_state, require_login
from utils.components import page_sidebar

st.set_page_config(page_title="ARGUS — System Information", page_icon="ℹ️", layout="wide")
init_state()
inject_css()
require_login()
page_sidebar()

st.markdown("# ℹ️ System Information")
st.markdown(
    '<div class="argus-banner-info">This is a testing/demo prototype for validating UX and interaction design. '
    "It does not intercept real calls, SMS, or emails, and does not use a production auth backend.</div>",
    unsafe_allow_html=True,
)
st.write("")

st.markdown("## Architecture (this demo)")
st.markdown(
    """
    <div class="argus-card">
    <b>Unified Risk Engine</b><br>
    <span class="argus-muted">
    TF-IDF + Logistic Regression classifier (trained locally on a small Safe / Spam / Phishing / Fraud /
    Social-Engineering dataset) combined with a severity-weighted rule-based keyword indicator system
    (strong / medium / weak) and a local threat-intelligence CSV lookup (known bad domains, phone numbers,
    emails). The three signals are blended into a single 0–100 score mapped to four bands:
    0–29 SAFE, 30–59 LOW/MODERATE, 60–79 SUSPICIOUS, 80–100 HIGH RISK.
    </span>
    </div>
    """,
    unsafe_allow_html=True,
)

st.markdown("## What's real vs. what's mocked in this demo")

col1, col2 = st.columns(2)
with col1:
    st.markdown("### ✅ Real, working logic")
    st.markdown(
        """
        <div class="argus-card">
        <ul>
        <li>TF-IDF + Logistic Regression classifier, trained locally on startup</li>
        <li>Severity-weighted keyword indicator rules</li>
        <li>Local threat-intelligence CSV lookup</li>
        <li>Blended 0–100 risk scoring and band thresholds</li>
        <li>Plotly analytics on real session event data</li>
        <li>Optional live LLM call (Anthropic/OpenAI) if an API key is set</li>
        </ul>
        </div>
        """,
        unsafe_allow_html=True,
    )
with col2:
    st.markdown("### 🧪 Mocked for UX testing only")
    st.markdown(
        """
        <div class="argus-card">
        <ul>
        <li>Call/SMS/email interception — nothing is actually intercepted</li>
        <li>The AI Call Assistant "call" — a chat simulator, no real telephony</li>
        <li>Trusted contact notifications — no real email/SMS is sent</li>
        <li>Login — name/email only, no password check, no real backend</li>
        <li>Scan history — stored in-memory per browser session only</li>
        </ul>
        </div>
        """,
        unsafe_allow_html=True,
    )

st.write("")
st.markdown("## Production architecture (not built here)")
st.markdown(
    """
    <div class="argus-card">
    <span class="argus-muted">
    The long-term production vision is a web app, mobile app, and browser extension backed by one API,
    using <b>FastAPI + PostgreSQL</b>, managed authentication, and <b>Twilio</b> (or similar) for real call/SMS
    interception — plus an AI voice assistant (LLM + speech pipeline) that screens unknown calls live using
    this same risk engine. That architecture is documented separately; this Streamlit app exists purely to
    test the interaction design cheaply before building it.
    </span>
    </div>
    """,
    unsafe_allow_html=True,
)
