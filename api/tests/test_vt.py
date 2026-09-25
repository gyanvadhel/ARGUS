from argus_api.checkers.vt import vt_stats_signal


def test_a_single_engine_is_only_a_weak_hint():
    s = vt_stats_signal("VirusTotal", {"malicious": 1, "harmless": 60, "undetected": 35}, "link")
    assert s.status == "suspicious" and s.score <= 25


def test_three_engines_are_a_verdict():
    s = vt_stats_signal("VirusTotal", {"malicious": 3, "harmless": 60, "undetected": 30}, "link")
    assert s.status == "malicious" and s.authoritative
