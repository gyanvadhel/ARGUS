import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from utils.theme import inject_css, COLORS
from utils.state import init_state, require_login, current_history
from utils.components import page_sidebar

st.set_page_config(page_title="ARGUS — Threat Monitor", page_icon="📊", layout="wide")
init_state()
inject_css()
require_login()
page_sidebar()

st.markdown("# 📊 Threat Monitor")
st.markdown('<span class="argus-muted">Live event log and analytics across every ARGUS module for this session.</span>', unsafe_allow_html=True)
st.write("")

history = current_history()

if not history:
    st.info("No events logged yet for this user. Run a scan in any Security module to populate the Threat Monitor.")
else:
    df = pd.DataFrame(history)

    def band(score):
        if score >= 80:
            return "HIGH RISK"
        if score >= 60:
            return "SUSPICIOUS"
        if score >= 30:
            return "LOW/MODERATE"
        return "SAFE"

    df["band"] = df["score"].apply(band)

    band_colors = {
        "SAFE": COLORS["green"],
        "LOW/MODERATE": COLORS["amber"],
        "SUSPICIOUS": COLORS["amber"],
        "HIGH RISK": COLORS["red"],
    }

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("### Threat Distribution")
        threat_counts = df[df["threat_type"] != "None"]["threat_type"].value_counts()
        if threat_counts.empty:
            st.caption("No threats detected yet — nothing to chart.")
        else:
            fig_donut = px.pie(
                names=threat_counts.index,
                values=threat_counts.values,
                hole=0.55,
            )
            fig_donut.update_traces(textinfo="percent+label")
            fig_donut.update_layout(
                paper_bgcolor="rgba(0,0,0,0)",
                plot_bgcolor="rgba(0,0,0,0)",
                font_color=COLORS["text"],
                showlegend=True,
                margin=dict(t=10, b=10, l=10, r=10),
            )
            st.plotly_chart(fig_donut, width='stretch')

    with col2:
        st.markdown("### Risk Distribution")
        band_counts = df["band"].value_counts().reindex(
            ["SAFE", "LOW/MODERATE", "SUSPICIOUS", "HIGH RISK"], fill_value=0
        )
        fig_bar = go.Figure(
            data=[
                go.Bar(
                    x=band_counts.index,
                    y=band_counts.values,
                    marker_color=[band_colors[b] for b in band_counts.index],
                )
            ]
        )
        fig_bar.update_layout(
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            font_color=COLORS["text"],
            margin=dict(t=10, b=10, l=10, r=10),
            yaxis=dict(gridcolor=COLORS["border"]),
        )
        st.plotly_chart(fig_bar, width='stretch')

    st.markdown("### Activity Over Time")
    df["timestamp_dt"] = pd.to_datetime(df["timestamp"])
    df_sorted = df.sort_values("timestamp_dt")
    df_sorted["event_number"] = range(1, len(df_sorted) + 1)
    fig_line = px.line(df_sorted, x="event_number", y="score", markers=True)
    fig_line.update_traces(line_color=COLORS["teal"], marker_color=COLORS["teal"])
    fig_line.add_hrect(y0=80, y1=100, fillcolor=COLORS["red"], opacity=0.08, line_width=0)
    fig_line.add_hrect(y0=60, y1=80, fillcolor=COLORS["amber"], opacity=0.08, line_width=0)
    fig_line.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font_color=COLORS["text"],
        margin=dict(t=10, b=10, l=10, r=10),
        xaxis=dict(title="Scan #", gridcolor=COLORS["border"]),
        yaxis=dict(title="Risk score", range=[0, 100], gridcolor=COLORS["border"]),
    )
    st.plotly_chart(fig_line, width='stretch')

    st.markdown("### Event Log")
    display_df = df[["timestamp", "module", "score", "level", "threat_type", "preview"]].sort_values(
        "timestamp", ascending=False
    )
    st.dataframe(display_df, width='stretch', hide_index=True)
