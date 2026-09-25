"""Rebuild Argus's phishing-link model from the threat feeds the engine has already downloaded.

Run from api/ once the engine has fetched its feeds (api/.cache/feeds):
    .venv/Scripts/python scripts/train_link_model.py
Writes argus_api/data/link_model.npz (the weights) and link_model.json (what it learned from, how it scored).
"""
from __future__ import annotations

import hashlib
import json
import random
import sys
import time
from datetime import date
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from argus_api.checkers.url import platform_of, registrable_domain  # noqa: E402
from argus_api.intel import feeds  # noqa: E402
from argus_api.ml import phish_link  # noqa: E402

PHISHING_SAMPLE = 200_000
# Legitimate examples come from the whole Tranco top million, not just the 200,000 the engine keeps: with only
# famous, short brand names as "legitimate", long everyday names like rkpuramdentalclinic.com looked like phishing.
LEGIT_SAMPLE = 450_000
TRANCO_SITES = 1_000_000
SEED = 0
THRESHOLDS = (0.5, 0.7, 0.8, 0.9, 0.95, 0.98)


def load_hosts() -> tuple[list[str], list[str], dict[str, int]]:
    """Registered domains (the part someone buys), one example each.

    Pages on publish-anything platforms (vercel.app, github.io, ...) are left out: the legitimate list only has
    the platforms' bare names, so keeping them taught the model that every site on a platform is phishing.
    One example per domain also stops a single phishing kit with thousands of subdomains from dominating."""
    cache = feeds.CACHE_DIR
    hosts = feeds.parse_domain_list((cache / "phishing-db.txt").read_text(encoding="utf-8"))
    hosts |= feeds.parse_url_list((cache / "openphish.txt").read_text(encoding="utf-8"))[1]
    phishing = {registrable_domain(h) for h in hosts if h and not h.replace(".", "").isdigit() and not platform_of(h)}
    ranks = feeds.parse_tranco_zip((cache / "tranco.zip").read_bytes(), limit=TRANCO_SITES)
    legit = {registrable_domain(d) for d in ranks if not platform_of(d)}
    # Famous domains that also host phishing pages are on both lists: too ambiguous to learn from.
    both = phishing & legit
    return sorted(phishing - both), sorted(legit - both), ranks


def held_out(domain: str) -> bool:
    """One domain in five is kept for testing and never trained on."""
    return int(hashlib.md5(domain.encode()).hexdigest(), 16) % 5 == 0


def features(hosts: list[str]):
    return phish_link.vectorizer().transform([phish_link.prepare(h) for h in hosts])


def fit(hosts: list[str], labels: list[int]) -> LogisticRegression:
    # Balanced weights: the model judges phishing and legitimate domains as equally likely before it reads a name.
    return LogisticRegression(C=4.0, solver="liblinear", max_iter=300, class_weight="balanced").fit(features(hosts), labels)


def main() -> None:
    started = time.time()
    phishing, legit, ranks = load_hosts()
    rng = random.Random(SEED)
    phishing = rng.sample(phishing, min(PHISHING_SAMPLE, len(phishing)))
    legit = rng.sample(legit, min(LEGIT_SAMPLE, len(legit)))
    hosts = phishing + legit
    labels = [1] * len(phishing) + [0] * len(legit)
    print(f"{len(phishing):,} phishing domains, {len(legit):,} legitimate domains")

    test = [i for i, h in enumerate(hosts) if held_out(h)]
    train = [i for i, h in enumerate(hosts) if not held_out(h)]
    model = fit([hosts[i] for i in train], [labels[i] for i in train])
    scores = model.predict_proba(features([hosts[i] for i in test]))[:, 1]
    truth = np.array([labels[i] for i in test])
    # False alarms matter most on small sites, so they're also reported for the less-visited part of the list.
    obscure = np.array([labels[i] == 0 and ranks.get(hosts[i], 0) > 500_000 for i in test])
    auc = roc_auc_score(truth, scores)
    print(f"held out: {int(truth.sum()):,} phishing, {int((truth == 0).sum()):,} legitimate; AUC {auc:.4f}")
    table = {}
    for t in THRESHOLDS:
        flagged = scores >= t
        tp = int((flagged & (truth == 1)).sum())
        row = {
            "precision_on_balanced_test": round(tp / max(1, int(flagged.sum())), 4),
            "recall": round(tp / max(1, int(truth.sum())), 4),
            "false_alarm_rate": round(int((flagged & (truth == 0)).sum()) / max(1, int((truth == 0).sum())), 4),
            "false_alarm_rate_ranks_500k_1m": round(int((flagged & obscure).sum()) / max(1, int(obscure.sum())), 4),
        }
        table[str(t)] = row
        print(f"  at {t:.2f}: precision {row['precision_on_balanced_test']:.3f}, catches {row['recall']:.1%} of phishing, "
              f"false alarms {row['false_alarm_rate']:.2%} (sites ranked 500k-1M: {row['false_alarm_rate_ranks_500k_1m']:.2%})")

    final = fit(hosts, labels)
    np.savez_compressed(phish_link.WEIGHTS, coef=final.coef_[0].astype(np.float32), intercept=np.float32(final.intercept_[0]))
    phish_link.CARD.write_text(json.dumps({
        "trained_on": str(date.today()),
        "phishing_domains": len(phishing),
        "legitimate_domains": len(legit),
        "sources": {
            "phishing": "Phishing.Database active domains + OpenPhish live feed, one per registered domain (sampled)",
            "legitimate": "Tranco list of the 1,000,000 most visited sites (sampled across all ranks)",
            "left_out": "pages on publish-anything platforms, and domains on both lists",
        },
        "reads": "the registered domain only, as 3-5 letter pieces hashed into 2^20 features; logistic regression",
        "held_out": {"phishing": int(truth.sum()), "legitimate": int((truth == 0).sum()), "auc": round(float(auc), 4),
                     "by_threshold": table},
    }, indent=2) + "\n", encoding="utf-8")
    print(f"saved {phish_link.WEIGHTS.name} and {phish_link.CARD.name} in {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
