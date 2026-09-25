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


from argus_api.checkers.phone import Community, _parse, callback_risk_signal, community_signal, sightings_signal


def test_one_ring_country_is_a_callback_trap():
    s = callback_risk_signal(_parse("+232 76 123456"))
    assert s.status == "suspicious" and "Sierra Leone" in s.summary


def test_lookalike_area_code_is_a_callback_trap():
    s = callback_risk_signal(_parse("+1 (876) 203 4567"))
    assert s.status == "suspicious" and "876" in s.summary and "Jamaica" in s.summary


def test_ordinary_number_has_no_callback_trap():
    assert callback_risk_signal(_parse("+1 650-253-0000")).status == "clean"


def test_scam_reports_become_authoritative_at_five():
    s = community_signal(Community(reports=5, categories={"Scam": 4, "Fraud": 1}, last_report_days=2))
    assert (s.status, s.authoritative) == ("malicious", True)
    assert "mostly as Scam" in s.summary and "2 days ago" in s.summary


def test_spam_reports_are_suspicious_not_scam():
    s = community_signal(Community(reports=4, categories={"Spam": 3, "Robocall": 1}))
    assert s.status == "suspicious"
    assert "mostly as Spam" in s.summary


def test_single_report_reads_naturally():
    s = community_signal(Community(reports=1, categories={"Robocall": 1}, last_report_days=0.2))
    assert s.summary == "Reported by 1 Argus user as Robocall, most recently today"


def test_sightings_in_scam_messages_raise_risk():
    s = sightings_signal(Community(sightings=2))
    assert s.status == "suspicious" and "2 scam messages" in s.summary


def test_community_name_travels_with_the_verdict():
    v = check_phone("+1 650-253-0000", Community(reports=2, categories={"Scam": 2}, name="Fake SBI agent", name_votes=2))
    community = next(s for s in v.signals if s.source == "Community reports")
    assert community.evidence["name"] == "Fake SBI agent"


def test_toll_free_numbers_say_so_instead_of_a_location():
    s = next(s for s in check_phone("1-800-555-0142").signals if s.source == "Number validation")
    assert s.evidence["region"] == "Toll-free"
