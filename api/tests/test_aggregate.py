from argus_api.aggregate import band_for, combine, verdict_as_signal
from argus_api.models import Signal


def sig(status, score, weight=1.0, authoritative=False, trust=0.0, **evidence):
    return Signal(source="test", status=status, score=score, weight=weight,
                  summary="s", authoritative=authoritative, trust=trust, evidence=evidence)


def test_bands():
    assert band_for(0) == "SAFE"
    assert band_for(29) == "SAFE"
    assert band_for(30) == "LOW/MODERATE"
    assert band_for(59) == "LOW/MODERATE"
    assert band_for(60) == "SUSPICIOUS"
    assert band_for(79) == "SUSPICIOUS"
    assert band_for(80) == "HIGH RISK"
    assert band_for(100) == "HIGH RISK"


def test_independent_red_flags_add_up():
    v = combine("url", "x", [sig("suspicious", 50), sig("suspicious", 50)])
    assert v.score == 75  # 1 - (0.5 * 0.5)


def test_finding_nothing_does_not_water_down_a_red_flag():
    v = combine("url", "x", [sig("suspicious", 60), sig("clean", 0), sig("clean", 0), sig("clean", 0)])
    assert v.score == 60


def test_weight_scales_a_flag():
    assert combine("url", "x", [sig("suspicious", 80, weight=0.5)]).score == 40


def test_trust_evidence_lowers_risk():
    v = combine("url", "x", [sig("suspicious", 50), sig("clean", 0, trust=1.0)])
    assert v.score == 15  # 50 * (1 - 0.7)


def test_threat_feeds_beat_popularity():
    v = combine("url", "x", [sig("malicious", 95, weight=1.5, authoritative=True), sig("clean", 0, trust=1.0)])
    assert v.score == 85 and v.level == "HIGH RISK"


def test_no_usable_signal_is_unverified():
    v = combine("url", "x", [sig("unavailable", 0, weight=0), sig("error", 0, weight=0), sig("unknown", 0, weight=0)])
    assert (v.score, v.level, v.verified) == (0, "UNVERIFIED", False)
    assert "couldn't verify" in v.recommendation


def test_safe_needs_positive_evidence():
    plain = combine("phone", "x", [sig("clean", 0), sig("clean", 0)])
    trusted = combine("url", "x", [sig("clean", 0, trust=0.9)])
    assert (plain.level, plain.verified) == ("SAFE", False)
    assert "No red flags" in plain.recommendation
    assert (trusted.level, trusted.verified) == ("SAFE", True)


def test_threat_type_comes_from_strongest_signal():
    v = combine("text", "x", [sig("suspicious", 40, threat_type="Phishing"), sig("suspicious", 20, threat_type="Spam")])
    assert v.threat_type == "Phishing"


def test_verdict_as_signal_carries_authority():
    v = combine("url", "http://x", [sig("malicious", 95, authoritative=True)])
    s = verdict_as_signal(v, "Link: x")
    assert (s.status, s.score, s.authoritative, s.source) == ("malicious", 95, True, "Link: x")
