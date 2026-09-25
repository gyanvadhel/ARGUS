import streamlit as st

from utils.theme import inject_css, simulation_banner
from utils.state import init_state, require_login
from utils.components import page_sidebar

st.set_page_config(page_title="ARGUS — Family & Trusted Contacts", page_icon="👪", layout="wide")
init_state()
inject_css()
require_login()
page_sidebar()

st.markdown("# 👪 Family & Trusted Contacts")
simulation_banner("SIMULATION — no real emails, texts, or notifications are sent")
st.markdown(
    '<span class="argus-muted">Add a mock trusted contact to test the "safety net" UX: when a High Risk event '
    "is detected anywhere in ARGUS, that contact gets a plain-language alert.</span>",
    unsafe_allow_html=True,
)
st.write("")

st.markdown('<div class="argus-card">', unsafe_allow_html=True)
st.markdown("### Add a Trusted Contact")
with st.form("trusted_contact_form"):
    name = st.text_input("Contact name", value=st.session_state.get("trusted_contact_name", ""), placeholder="e.g. Alex (daughter)")
    info = st.text_input(
        "Contact email or phone",
        value=st.session_state.get("trusted_contact_info", ""),
        placeholder="e.g. alex@example.com or +1 555 123 4567",
    )
    submitted = st.form_submit_button("Save Trusted Contact")
    if submitted:
        st.session_state.trusted_contact_name = name.strip()
        st.session_state.trusted_contact_info = info.strip()
        st.success("Trusted contact saved (session only — nothing was actually sent anywhere).")
st.markdown("</div>", unsafe_allow_html=True)

st.write("")
st.markdown('<div class="argus-card">', unsafe_allow_html=True)
st.markdown("### Notification Settings")
st.session_state.notify_on_high_risk = st.toggle(
    "Notify trusted contact on High Risk events",
    value=st.session_state.get("notify_on_high_risk", True),
)
st.caption(
    "In production, this uses a real notification service (email/SMS via a provider like Twilio or SendGrid). "
    "This demo just simulates the alert banner so we can test the UX."
)
st.markdown("</div>", unsafe_allow_html=True)

if st.session_state.get("trusted_contact_name"):
    st.write("")
    st.markdown(
        f"""
        <div class="argus-banner-info">
        Currently configured: <b>{st.session_state.trusted_contact_name}</b>
        ({st.session_state.get('trusted_contact_info') or 'no contact info entered'}) —
        notifications are {'ON' if st.session_state.notify_on_high_risk else 'OFF'}.
        </div>
        """,
        unsafe_allow_html=True,
    )
else:
    st.info("No trusted contact configured yet. Add one above, then trigger a High Risk scan in any module to see the mocked alert.")
