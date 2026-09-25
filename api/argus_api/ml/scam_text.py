"""How scam-like a message reads, learned from thousands of real text messages.

Training data (all in argus_api/data, sources and licences in DATA_SOURCES.md):
- The SMS Spam Collection: 5,574 real text messages, 747 of them spam (Almeida & Gómez Hidalgo, 2011).
- The 65 hand-written examples from the original prototype: phishing, fraud and social-engineering
  wording the collection lacks.
- Hand-written Indian messages: everyday bank alerts, OTPs and deliveries, and common Indian scams
  (KYC, power cut-off, fake jobs, parcels). The collection comes from the UK and Singapore, so
  without these it mistook ordinary Indian bank alerts for spam.

Word and character patterns feed a logistic regression. Digits are all read as 0, so the model
learns the wording around amounts and codes rather than the numbers themselves. It trains in a
few seconds, so it's built on first use instead of shipping a pickled model.
"""
from __future__ import annotations

import csv
import re
from functools import lru_cache
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline, make_pipeline, make_union

DATA = Path(__file__).resolve().parent.parent / "data"
SMS_COLLECTION = DATA / "sms_spam_collection.tsv"
PROTOTYPE_EXAMPLES = DATA / "training_data.csv"
INDIAN_EXAMPLES = DATA / "indian_sms_examples.csv"

# Chosen on held-out messages: at 0.6 it's right about 98% of the time it says "scam", and it
# stopped flagging ordinary Indian bank alerts and OTPs that 0.5 still caught.
THRESHOLD = 0.6
# Emails and documents are longer and more formal than the texts it learned from, so it's less sure
# about them: genuine newsletters and bank emails scored up to 0.61, scam emails 0.89 and above.
LONG_TEXT_THRESHOLD = 0.8

_DIGIT = re.compile(r"\d")


def _prepare(text: str) -> str:
    return _DIGIT.sub("0", text.lower())


def load_examples() -> tuple[list[str], list[int]]:
    """Every training message, labelled 1 for scam or spam and 0 for an ordinary message."""
    texts: list[str] = []
    labels: list[int] = []
    with SMS_COLLECTION.open(encoding="utf-8") as f:
        for line in f:
            label, _, text = line.rstrip("\n").partition("\t")
            if text:
                texts.append(text)
                labels.append(int(label == "spam"))
    for path, scam in ((PROTOTYPE_EXAMPLES, lambda label: label != "Safe"), (INDIAN_EXAMPLES, lambda label: label == "scam")):
        with path.open(newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                texts.append(row["text"])
                labels.append(int(scam(row["label"])))
    return texts, labels


def build() -> Pipeline:
    return make_pipeline(
        make_union(
            TfidfVectorizer(preprocessor=_prepare, ngram_range=(1, 2), min_df=2, sublinear_tf=True),
            TfidfVectorizer(preprocessor=_prepare, analyzer="char_wb", ngram_range=(2, 5), min_df=2, sublinear_tf=True),
        ),
        LogisticRegression(max_iter=3000, C=10),
    )


@lru_cache(maxsize=1)
def model() -> Pipeline:
    texts, labels = load_examples()
    return build().fit(texts, labels)


def scam_probability(text: str) -> float:
    return float(model().predict_proba([text])[0][1])


def evaluate(seed: int = 0) -> dict:
    """Train on 80% of the messages and judge the 20% the model never saw."""
    texts, labels = load_examples()
    train_x, test_x, train_y, test_y = train_test_split(texts, labels, test_size=0.2, stratify=labels, random_state=seed)
    predicted = [int(p >= THRESHOLD) for p in build().fit(train_x, train_y).predict_proba(test_x)[:, 1]]
    return {
        "messages": len(texts),
        "held_out": len(test_x),
        "precision": round(float(precision_score(test_y, predicted)), 3),
        "recall": round(float(recall_score(test_y, predicted)), 3),
        "accuracy": round(float(accuracy_score(test_y, predicted)), 3),
    }
