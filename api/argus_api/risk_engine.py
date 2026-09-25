"""
ARGUS Risk Engine
------------------
This is the ONE piece of this demo that is real, working logic (not mocked):
  1. A TF-IDF + Logistic Regression classifier trained on a small local dataset
     (data/training_data.csv) with labels Safe / Spam / Phishing / Fraud / Social-Engineering
  2. A severity-weighted rule-based keyword indicator system (strong/medium/weak)
  3. A local threat-intelligence CSV lookup (data/threat_intel.csv) for known-bad
     domains, phone numbers, and email addresses

The three signals are combined into a single 0-100 risk score, mapped to four bands:
  0-29   SAFE
  30-59  LOW/MODERATE
  60-79  SUSPICIOUS
  80-100 HIGH RISK

Everything in this file is deterministic and runs fully offline/locally -- no paid
APIs are used or required.
"""

from __future__ import annotations

import os
import re
import csv
from dataclasses import dataclass, field

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
TRAINING_CSV = os.path.join(DATA_DIR, "training_data.csv")
THREAT_INTEL_CSV = os.path.join(DATA_DIR, "threat_intel.csv")

# ---------------------------------------------------------------------------
# Score band configuration (kept here so it's easy to tune in one place)
# ---------------------------------------------------------------------------
BANDS = [
    (0, 29, "SAFE", "#3DDC7A"),
    (30, 59, "LOW/MODERATE", "#E0A934"),
    (60, 79, "SUSPICIOUS", "#E0A934"),
    (80, 100, "HIGH RISK", "#FF5C4D"),
]

# Signal weights for the final blended score
WEIGHT_ML = 0.35
WEIGHT_RULES = 0.50
WEIGHT_INTEL = 0.15

# ---------------------------------------------------------------------------
# Rule-based keyword indicators, grouped by severity
# ---------------------------------------------------------------------------
STRONG_INDICATORS = {
    "verify your password": "Requests password verification",
    "one-time passcode": "Requests OTP / verification code",
    "one time passcode": "Requests OTP / verification code",
    "otp code": "Requests OTP / verification code",
    "enter your otp": "Requests OTP / verification code",
    "social security number": "Requests Social Security Number",
    "wire the funds": "Requests wire transfer",
    "wire transfer": "Requests wire transfer",
    "gift cards": "Requests payment via gift cards (classic scam pattern)",
    "send bail money": "Fake emergency / bail money request",
    "your account has been suspended": "Fake account suspension urgency",
    "confirm your card number": "Requests card number",
    "confirm your pin": "Requests PIN",
    "give us remote access": "Requests remote computer access",
    "remote access to your computer": "Requests remote computer access",
    "don't tell your family": "Isolation tactic (asks victim to stay silent)",
    "do not tell anyone": "Isolation tactic (asks victim to stay silent)",
    "keep this confidential": "Isolation tactic (asks victim to stay silent)",
    "arrest warrant": "Threat of arrest / legal action",
    "you will be arrested": "Threat of arrest / legal action",
    "full social security": "Requests full SSN",
}

MEDIUM_INDICATORS = {
    "act now": "Artificial urgency language",
    "immediately": "Artificial urgency language",
    "urgent": "Artificial urgency language",
    "within 24 hours": "Artificial urgency / deadline pressure",
    "click here": "Suspicious call-to-action link language",
    "click the link": "Suspicious call-to-action link language",
    "verify your identity": "Requests identity verification",
    "verify your account": "Requests account verification",
    "unusual activity": "Fake security-alert framing",
    "unusual sign-in": "Fake security-alert framing",
    "update your billing": "Requests billing/payment update",
    "update your payment": "Requests billing/payment update",
    "suspicious activity": "Fake security-alert framing",
    "stay on the line": "Pressure / control tactic",
    "confidential": "Secrecy / isolation framing",
    "date of birth": "Requests personal identifying information",
    "bank account": "References sensitive financial account",
    "tax refund": "Common fraud lure (tax refund)",
    "irs": "Impersonation of government agency",
    "final notice": "Urgency / threat framing",
}

WEAK_INDICATORS = {
    "free": "Promotional/lure language",
    "winner": "Promotional/lure language",
    "claim your prize": "Promotional/lure language",
    "limited time": "Promotional/lure language",
    "discount": "Promotional/lure language",
    "congratulations": "Promotional/lure language",
    "guaranteed": "Unrealistic guarantee language",
    "no experience needed": "Get-rich-quick lure language",
    "prepaid card": "Unusual payment method mention",
}

SEVERITY_POINTS = {"strong": 32, "medium": 15, "weak": 6}

THREAT_TYPE_BY_LABEL = {
    "Safe": "None",
    "Spam": "Spam / Unwanted Promotion",
    "Phishing": "Phishing",
    "Fraud": "Fraud / Scam",
    "Social-Engineering": "Social Engineering",
}


def band_for_score(score: int):
    """Public helper: map a 0-100 score to (level_name, color). Used by the
    engine itself and by sample_data.py so demo/seed data stays consistent
    with real scoring bands."""
    for low, high, name, color in BANDS:
        if low <= score <= high:
            return name, color
    return "SAFE", "#3DDC7A"


@dataclass
class AnalysisResult:
    score: int
    level: str
    color: str
    threat_type: str
    confidence: float
    indicators: list = field(default_factory=list)
    recommendation: str = ""
    ml_label: str = ""
    ml_score: float = 0.0
    rule_score: float = 0.0
    intel_score: float = 0.0
    intel_hits: list = field(default_factory=list)


def _load_training_rows():
    rows = []
    with open(TRAINING_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append((row["text"], row["label"]))
    return rows


def _load_threat_intel():
    entries = []
    with open(THREAT_INTEL_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            entries.append(row)
    return entries


class RiskEngine:
    """Loads/trains the classifier once and exposes analyze_text()."""

    def __init__(self):
        rows = _load_training_rows()
        texts = [r[0] for r in rows]
        labels = [r[1] for r in rows]

        self.vectorizer = TfidfVectorizer(
            lowercase=True, ngram_range=(1, 2), min_df=1, stop_words="english"
        )
        X = self.vectorizer.fit_transform(texts)
        self.classifier = LogisticRegression(max_iter=1000)
        self.classifier.fit(X, labels)
        self.classes_ = list(self.classifier.classes_)

        self.threat_intel = _load_threat_intel()

    # -- individual signal computations -----------------------------------

    def _ml_signal(self, text: str):
        X = self.vectorizer.transform([text])
        proba = self.classifier.predict_proba(X)[0]
        idx_by_class = {c: i for i, c in enumerate(self.classes_)}
        safe_idx = idx_by_class.get("Safe")
        unsafe_prob = 1.0 - (proba[safe_idx] if safe_idx is not None else 0.0)
        pred_label = self.classes_[proba.argmax()]
        confidence = float(proba.max())
        return unsafe_prob * 100.0, pred_label, confidence

    def _rule_signal(self, text: str):
        lowered = text.lower()
        hits = []
        points = 0
        for table, severity in (
            (STRONG_INDICATORS, "strong"),
            (MEDIUM_INDICATORS, "medium"),
            (WEAK_INDICATORS, "weak"),
        ):
            for phrase, description in table.items():
                if phrase in lowered:
                    points += SEVERITY_POINTS[severity]
                    hits.append(
                        {"phrase": phrase, "description": description, "severity": severity}
                    )
        capped = min(points, 100)
        return float(capped), hits

    def _intel_signal(self, text: str):
        lowered = text.lower()
        hits = []
        points = 0
        for entry in self.threat_intel:
            indicator = entry["indicator"].lower()
            if indicator in lowered:
                sev = entry["severity"]
                points += SEVERITY_POINTS.get(sev, 9)
                hits.append(entry)
        capped = min(points, 100)
        return float(capped), hits

    @staticmethod
    def _normalize_phone(number: str) -> str:
        return "".join(ch for ch in (number or "") if ch.isdigit())

    def lookup_phone(self, number: str):
        """Check a phone number against the local threat-intel list. Returns
        the matching threat-intel entry dict if the number is a known bad
        number, otherwise None. Used to auto-decline calls before the AI
        assistant would even pick up."""
        target = self._normalize_phone(number)
        if not target:
            return None
        for entry in self.threat_intel:
            if entry["type"] != "phone":
                continue
            if self._normalize_phone(entry["indicator"]) == target:
                return entry
        return None

    # -- public API ----------------------------------------------------------

    def analyze_text(self, text: str, channel: str = "generic") -> AnalysisResult:
        text = (text or "").strip()
        if not text:
            return AnalysisResult(
                score=0,
                level="SAFE",
                color="#3DDC7A",
                threat_type="None",
                confidence=1.0,
                indicators=[],
                recommendation="No content provided to analyze.",
            )

        ml_score, ml_label, ml_conf = self._ml_signal(text)
        rule_score, rule_hits = self._rule_signal(text)
        intel_score, intel_hits = self._intel_signal(text)

        blended = (
            WEIGHT_ML * ml_score + WEIGHT_RULES * rule_score + WEIGHT_INTEL * intel_score
        )
        final_score = int(round(min(max(blended, 0), 100)))

        level, color = self._band_for(final_score)

        threat_type = THREAT_TYPE_BY_LABEL.get(ml_label, "Unknown")
        if intel_hits:
            intel_categories = {h["category"] for h in intel_hits}
            threat_type = ", ".join(sorted(intel_categories)) if final_score >= 30 else threat_type
        if final_score < 30:
            threat_type = "None"

        indicators = []
        for h in rule_hits:
            indicators.append(f"[{h['severity'].upper()}] {h['description']} (\"{h['phrase']}\")")
        for h in intel_hits:
            indicators.append(
                f"[THREAT INTEL] Matched known {h['category']} {h['type']}: {h['indicator']}"
            )
        if not indicators:
            indicators.append("No specific rule-based or threat-intel indicators triggered.")

        recommendation = self._recommendation_for(level, threat_type)

        return AnalysisResult(
            score=final_score,
            level=level,
            color=color,
            threat_type=threat_type,
            confidence=round(ml_conf, 2),
            indicators=indicators,
            recommendation=recommendation,
            ml_label=ml_label,
            ml_score=round(ml_score, 1),
            rule_score=round(rule_score, 1),
            intel_score=round(intel_score, 1),
            intel_hits=intel_hits,
        )

    @staticmethod
    def _band_for(score: int):
        return band_for_score(score)

    @staticmethod
    def _recommendation_for(level: str, threat_type: str) -> str:
        if level == "SAFE":
            return "No action needed. This content shows no significant risk indicators."
        if level == "LOW/MODERATE":
            return "Proceed with normal caution. Avoid sharing sensitive information unless you can verify the source independently."
        if level == "SUSPICIOUS":
            return (
                f"Treat this as suspicious ({threat_type}). Do not click links, share codes, "
                "or provide personal/financial information. Verify through an official channel first."
            )
        return (
            f"High risk ({threat_type}). Do not respond, click, share any information, or send money. "
            "Block the sender/number and consider reporting it."
        )


_engine_singleton = None


def get_engine() -> RiskEngine:
    global _engine_singleton
    if _engine_singleton is None:
        _engine_singleton = RiskEngine()
    return _engine_singleton
