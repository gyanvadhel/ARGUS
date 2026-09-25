"""The phishing-link model: trained on real phishing and legitimate domains, flags only confident matches."""
from argus_api.checkers.url import LINK_MODEL, link_model_signal, quick_check_url
from argus_api.ml import phish_link


def test_card_records_real_training_and_honest_scores():
    card = phish_link.card()
    assert card["phishing_domains"] >= 100_000 and card["legitimate_domains"] >= 100_000
    held_out = card["held_out"]
    assert held_out["auc"] >= 0.8
    at_threshold = held_out["by_threshold"][str(phish_link.THRESHOLD)]
    assert at_threshold["false_alarm_rate"] <= 0.005  # at most 1 in 200 real sites, on sites it never saw


def test_phishing_style_names_score_high():
    for domain in ("paypal-secure-login-verify.xyz", "amazon-account-alert.top", "appleid-unlock-support.info"):
        assert phish_link.phishing_probability(domain) >= phish_link.THRESHOLD, domain


def test_everyday_names_are_not_flagged():
    for domain in ("sharmasweets.in", "mycollegefest2026.in", "zerodha.com", "rkpuramdentalclinic.com"):
        assert phish_link.phishing_probability(domain) < phish_link.THRESHOLD, domain


def test_signal_flags_only_confident_matches_and_stays_a_second_opinion():
    flagged = link_model_signal("paypal-secure-login-verify.xyz")
    assert (flagged.source, flagged.status) == (LINK_MODEL, "suspicious")
    assert flagged.score * flagged.weight < 60  # on its own it can't make a link more than low risk
    assert link_model_signal("sharmasweets.in").status == "clean"


def test_shared_platforms_and_official_sites_are_not_judged_by_name():
    assert link_model_signal("argus-watcher.vercel.app") is None  # the platform's name says nothing about the page
    assert link_model_signal("www.paypal.com") is None
    assert link_model_signal("192.168.1.10") is None


def test_quick_check_includes_the_model():
    v = quick_check_url("http://paypal-secure-login-verify.xyz/")
    assert any(s.source == LINK_MODEL and s.status == "suspicious" for s in v.signals)
