from argus_api.aggregate import band_for, combine, verdict_as_signal
from argus_api.models import Signal


def sig(status, score, weight=1.0, authoritative=False, **evidence):
    return Signal(source="test", status=status, score=score, weight=weight,
                  summary="s", authoritative=authoritative, evidence=evidence)


def test_bands():
    assert band_for(0) == "SAFE"
    assert band_for(29) == "SAFE"
    assert band_for(30) == "LOW/MODERATE"
    assert band_for(59) == "LOW/MODERATE"
    assert band_for(60) == "SUSPICIOUS"
    assert band_for(79) == "SUSPICIOUS"
    assert band_for(80) == "HIGH RISK"
    assert band_for(100) == "HIGH RISK"


def test_blends_weighted_average_with_peak():
    v = combine("text", "x", [sig("suspicious", 90), sig("suspicious", 70)])
    assert v.score == 85  # avg 80, peak 90
    assert v.level == "HIGH RISK"


def test_all_clean_is_safe_with_no_threat():
    v = combine("url", "x", [sig("clean", 0), sig("clean", 0)])
    assert (v.score, v.level, v.threat_type) == (0, "SAFE", "None")


def test_unavailable_and_error_signals_are_ignored():
    v = combine("url", "x", [sig("suspicious", 60), sig("unavailable", 0, weight=0), sig("error", 0, weight=0)])
    assert v.score == 60


def test_no_usable_signal_is_unverified():
    v = combine("url", "x", [sig("unavailable", 0, weight=0), sig("unknown", 0, weight=0)])
    assert (v.score, v.level) == (0, "UNVERIFIED")
    assert "couldn't verify" in v.recommendation


def test_authoritative_malicious_floors_score_at_85():
    v = combine("url", "x", [sig("malicious", 95, authoritative=True), sig("clean", 0), sig("clean", 0), sig("clean", 0)])
    assert v.score == 85
    assert v.level == "HIGH RISK"


def test_threat_type_comes_from_strongest_signal():
    v = combine("text", "x", [sig("suspicious", 70, threat_type="Phishing"), sig("clean", 0)])
    assert v.level == "LOW/MODERATE"
    assert v.threat_type == "Phishing"


def test_verdict_as_signal_carries_authority():
    v = combine("url", "http://x", [sig("malicious", 95, authoritative=True)])
    s = verdict_as_signal(v, "Link: x")
    assert (s.status, s.score, s.authoritative, s.source) == ("malicious", 95, True, "Link: x")
