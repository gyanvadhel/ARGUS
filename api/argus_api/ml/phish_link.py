"""How much a domain name looks like a phishing site's, learned from Argus's live threat lists.

scripts/train_link_model.py rebuilds it from the feeds the engine has already downloaded:
- phishing: domains on Phishing.Database's active list and OpenPhish's live feed, one per registered domain
- legitimate: domains sampled across the Tranco list of the million most visited sites
Pages on publish-anything platforms (vercel.app, github.io, ...) are left out of both, and never judged.

It reads only the registered domain (the part someone buys, like paypal-security-alert.net), as
overlapping 3-to-5 letter pieces hashed into a fixed-size table, and a logistic regression weighs the
pieces. Hashing keeps no vocabulary, so the learned weights are all that ships (data/link_model.npz);
data/link_model.json records what it learned from and how it scored on domains it never saw.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer

DATA = Path(__file__).resolve().parent.parent / "data"
WEIGHTS = DATA / "link_model.npz"
CARD = DATA / "link_model.json"
FEATURES = 2 ** 20
# A name alone is thin evidence, so it only speaks up when very sure. On domains it never saw, 0.95 wrongly
# flagged about 1 real site in 750 while still catching about a quarter of phishing domains by name alone.
THRESHOLD = 0.95


def vectorizer() -> HashingVectorizer:
    return HashingVectorizer(analyzer="char", ngram_range=(3, 5), n_features=FEATURES, alternate_sign=False,
                             norm="l2", lowercase=True)


def prepare(host: str) -> str:
    """The site name the model reads, with its edges marked so endings like .xyz> count."""
    host = host.lower().rstrip(".")
    return f"<{host[4:] if host.startswith('www.') else host}>"


@lru_cache(maxsize=1)
def _weights() -> tuple[np.ndarray, float] | None:
    if not WEIGHTS.exists():
        return None
    saved = np.load(WEIGHTS)
    return saved["coef"].astype(np.float64), float(saved["intercept"])


@lru_cache(maxsize=1)
def card() -> dict:
    return json.loads(CARD.read_text(encoding="utf-8")) if CARD.exists() else {}


def phishing_probability(host: str) -> float | None:
    """0 to 1, or None when the model hasn't been trained yet."""
    weights = _weights()
    if weights is None:
        return None
    coef, intercept = weights
    z = float((vectorizer().transform([prepare(host)]) @ coef)[0]) + intercept
    return 1.0 / (1.0 + math.exp(-z))
