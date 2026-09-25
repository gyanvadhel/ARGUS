"""Shared dark cybersecurity theme + small UI helpers used across all pages."""

import streamlit as st

COLORS = {
    "bg": "#0B0B0D",
    "card": "#17171A",
    "border": "#26262A",
    "text": "#F5F5F5",
    "muted": "#A3A3A3",
    "teal": "#12B886",
    "red": "#FF5C4D",
    "amber": "#E0A934",
    "green": "#3DDC7A",
}

LEVEL_COLOR = {
    "SAFE": COLORS["green"],
    "LOW/MODERATE": COLORS["amber"],
    "SUSPICIOUS": COLORS["amber"],
    "HIGH RISK": COLORS["red"],
}


def inject_css():
    st.markdown(
        f"""
        <style>
        #MainMenu {{visibility: hidden;}}
        footer {{visibility: hidden;}}
        header {{visibility: hidden;}}

        .stApp {{
            background-color: {COLORS['bg']};
            color: {COLORS['text']};
        }}

        section[data-testid="stSidebar"] {{
            background-color: #0F0F11;
            border-right: 1px solid {COLORS['border']};
        }}

        h1, h2, h3, h4, h5, p, span, label, div {{
            color: {COLORS['text']};
        }}

        .argus-card {{
            background-color: {COLORS['card']};
            border: 1px solid {COLORS['border']};
            border-radius: 14px;
            padding: 1.25rem 1.5rem;
            margin-bottom: 1rem;
        }}

        .argus-muted {{
            color: {COLORS['muted']};
            font-size: 0.9rem;
        }}

        .argus-badge {{
            display: inline-block;
            padding: 0.25rem 0.9rem;
            border-radius: 999px;
            font-weight: 700;
            font-size: 0.85rem;
            letter-spacing: 0.03em;
        }}

        .argus-score {{
            font-size: 3rem;
            font-weight: 800;
            line-height: 1;
        }}

        .argus-pill {{
            display: inline-block;
            background-color: #1E1E22;
            border: 1px solid {COLORS['border']};
            border-radius: 8px;
            padding: 0.4rem 0.75rem;
            margin: 0.15rem 0.3rem 0.15rem 0;
            font-size: 0.85rem;
            color: {COLORS['text']};
        }}

        .argus-banner-safe {{
            background-color: rgba(61, 220, 122, 0.12);
            border: 1px solid {COLORS['green']};
            border-radius: 10px;
            padding: 0.9rem 1.1rem;
            color: {COLORS['green']};
            font-weight: 600;
        }}

        .argus-banner-danger {{
            background-color: rgba(255, 92, 77, 0.12);
            border: 1px solid {COLORS['red']};
            border-radius: 10px;
            padding: 0.9rem 1.1rem;
            color: {COLORS['red']};
            font-weight: 600;
        }}

        .argus-banner-info {{
            background-color: rgba(18, 184, 134, 0.12);
            border: 1px solid {COLORS['teal']};
            border-radius: 10px;
            padding: 0.9rem 1.1rem;
            color: {COLORS['teal']};
            font-weight: 600;
        }}

        .stButton > button {{
            background-color: {COLORS['teal']};
            color: #06110D;
            border: none;
            border-radius: 8px;
            font-weight: 700;
            padding: 0.5rem 1.25rem;
        }}
        .stButton > button:hover {{
            background-color: #0EA372;
            color: #06110D;
        }}

        .argus-sim-label {{
            display: inline-block;
            background-color: rgba(224, 169, 52, 0.15);
            border: 1px solid {COLORS['amber']};
            color: {COLORS['amber']};
            border-radius: 8px;
            padding: 0.3rem 0.8rem;
            font-size: 0.8rem;
            font-weight: 700;
            letter-spacing: 0.04em;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def level_badge_html(level: str, color: str) -> str:
    return f'<span class="argus-badge" style="background-color:{color}22;color:{color};border:1px solid {color};">{level}</span>'


def simulation_banner(text: str = "SIMULATION — no real calls, messages, or emails are sent or intercepted"):
    st.markdown(f'<span class="argus-sim-label">🧪 {text}</span>', unsafe_allow_html=True)
    st.write("")
