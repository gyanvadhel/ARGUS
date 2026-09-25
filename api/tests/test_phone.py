from argus_api.checkers.phone import check_phone, normalize


def test_normalize():
    assert normalize("(800) 555-0142") == "+18005550142"
    assert normalize("+44 20 7946 0958") == "+442079460958"
    assert normalize("12") is None


def test_blocklisted_number_is_high_risk():
    v = check_phone("1-800-555-0142")
    assert v.level == "HIGH RISK"
    assert any(s.source == "ARGUS blocklist" and s.status == "malicious" for s in v.signals)


def test_real_number_is_safe():
    v = check_phone("+1 650-253-0000")
    assert v.level == "SAFE"
    assert v.subject == "+16502530000"


def test_community_reports_raise_risk():
    assert check_phone("+1 650-253-0000", community_reports=5).score >= 60


def test_unassigned_number_is_suspicious():
    s = next(s for s in check_phone("+1 555 000 0000").signals if s.source == "Number validation")
    assert s.status == "suspicious"
