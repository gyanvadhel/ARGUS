"""Shared renderer for the five carried-over security module pages
(Call, SMS, Email, Web, File). Each page file just calls run_module_page()
with module-specific copy."""

import streamlit as st

from utils.theme import inject_css
from utils.state import init_state, require_login, log_event
from utils.risk_engine import get_engine
from utils.components import page_sidebar, render_result_card
from utils.examples import EXAMPLES


def run_module_page(
    title: str,
    icon: str,
    module_name: str,
    description: str,
    input_label: str,
    placeholder: str,
    allow_file_upload: bool = False,
    file_types=None,
):
    st.set_page_config(page_title=f"ARGUS — {title}", page_icon=icon, layout="wide")
    init_state()
    inject_css()
    require_login()
    page_sidebar()
    get_engine()

    st.markdown(f"# {icon} {title}")
    st.markdown(f'<span class="argus-muted">{description}</span>', unsafe_allow_html=True)
    st.write("")

    text_key = f"{module_name}_text"

    examples = EXAMPLES.get(module_name, [])
    if examples:
        st.markdown('<div class="argus-card" style="padding:0.9rem 1.2rem;">', unsafe_allow_html=True)
        st.markdown("**📋 Load example data** — try a pre-written sample instead of typing your own.")
        ex_col1, ex_col2 = st.columns([3, 1])
        with ex_col1:
            example_label = st.selectbox(
                "Example",
                options=[e["label"] for e in examples],
                key=f"{module_name}_example_select",
                label_visibility="collapsed",
            )
        with ex_col2:
            if st.button("Load example", key=f"{module_name}_load_example", width='stretch'):
                chosen = next(e for e in examples if e["label"] == example_label)
                st.session_state[text_key] = chosen["text"]
                st.session_state.pop(f"{module_name}_last_result", None)
                st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)
        st.write("")

    content = ""
    if allow_file_upload:
        tab1, tab2 = st.tabs(["Paste content", "Upload file"])
        with tab1:
            content = st.text_area(input_label, placeholder=placeholder, height=160, key=f"{module_name}_text")
        with tab2:
            uploaded = st.file_uploader(
                "Upload a file to analyze (content is read as text where possible)",
                type=file_types,
                key=f"{module_name}_upload",
            )
            if uploaded is not None:
                try:
                    raw = uploaded.read()
                    content = raw.decode("utf-8", errors="ignore")
                    st.caption(f"Loaded `{uploaded.name}` ({len(raw)} bytes) as text for analysis.")
                except Exception:
                    content = uploaded.name
                    st.caption(f"Could not decode `{uploaded.name}` as text — analyzing filename only.")
    else:
        content = st.text_area(input_label, placeholder=placeholder, height=160, key=f"{module_name}_text")

    analyze_clicked = st.button("🔍 ANALYZE", type="primary", key=f"{module_name}_btn")

    st.write("")

    if analyze_clicked:
        if not content or not content.strip():
            st.error("Please paste content or upload a file before analyzing.")
        else:
            engine = get_engine()
            with st.spinner("Running Unified Risk Engine…"):
                result = engine.analyze_text(content, channel=module_name)
            log_event(title, result, source_preview=content)
            st.session_state[f"{module_name}_last_result"] = result

    result = st.session_state.get(f"{module_name}_last_result")
    if result is not None:
        render_result_card(result, simple_mode=st.session_state.get("simple_mode", False))

        if result.score >= 80 and st.session_state.get("notify_on_high_risk") and st.session_state.get("trusted_contact_name"):
            st.markdown(
                f'<div class="argus-banner-danger">🔔 Alert sent to <b>{st.session_state.trusted_contact_name}</b> — '
                f'this {title} scan was flagged High Risk.</div>',
                unsafe_allow_html=True,
            )
