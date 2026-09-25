"""The scam-text model: trained on thousands of real SMS messages, judged on messages it never saw."""
from argus_api.checkers.text import ml_signal
from argus_api.ml import scam_text

PRIZE_SCAM = "WINNER!! You have been selected to receive a £900 prize reward. Call 09061701461 to claim now"


def test_learns_from_thousands_of_real_messages():
    texts, labels = scam_text.load_examples()
    assert len(texts) >= 5_500
    assert 750 <= sum(labels) <= 900  # the collection's 747 spam messages plus the prototype's scam examples


def test_is_accurate_on_messages_it_never_saw():
    report = scam_text.evaluate()
    assert report["held_out"] >= 1_000
    assert report["precision"] >= 0.95  # when it says scam, it's right
    assert report["recall"] >= 0.85  # and it catches most of them


def test_scam_messages_read_as_scams():
    for text in (
        PRIZE_SCAM,
        "URGENT: your bank account has been suspended. Verify your identity within 24 hours or it will be closed",
        "Congratulations! You've won a free iPhone. Text CLAIM to 80082 now, only today",
    ):
        assert scam_text.scam_probability(text) >= scam_text.THRESHOLD, text


def test_everyday_messages_read_as_ordinary():
    for text in (
        "Hey are we still on for lunch tomorrow at noon?",
        "See you at noon, the place is on https://www.google.com/",
        "Running 10 mins late, order me a coffee pls",
        "Rs.500.00 debited from A/c XX1234 on 25-09-26 via UPI. Not you? Call your bank.",
        "123456 is your OTP to log in. Do not share it with anyone.",
        "Your Amazon order has shipped and will arrive on Friday.",
    ):
        assert scam_text.scam_probability(text) < scam_text.THRESHOLD, text


NEWSLETTER = ("This week in tech: five stories you missed, plus our guide to the best phones under 20,000. "
              "Read more on our website. Unsubscribe any time.")
PHISHING_EMAIL = ("Your Netflix membership is on hold. We were unable to process your payment. Update your payment "
                  "details within 24 hours to avoid suspension: http://netflix-billing-update.com")


def test_emails_need_more_certainty_than_texts():
    # Trained on text messages, the model is less sure about longer, formal writing like emails.
    assert scam_text.LONG_TEXT_THRESHOLD > scam_text.THRESHOLD
    assert ml_signal(NEWSLETTER, threshold=scam_text.LONG_TEXT_THRESHOLD).status == "clean"
    assert ml_signal(PHISHING_EMAIL, threshold=scam_text.LONG_TEXT_THRESHOLD).status == "suspicious"


async def test_email_bodies_use_the_stricter_bar():
    from argus_api.checkers.email import check_email

    raw = f"From: Tech Weekly <news@techweekly.example>\nTo: you@example.com\nSubject: This week\n\n{NEWSLETTER}"
    v = await check_email(raw)
    ml = next(s for s in v.signals if s.source == "ARGUS ML model")
    assert ml.status == "clean"


def test_signal_says_how_scam_like_a_message_reads():
    scam = ml_signal(PRIZE_SCAM)
    assert (scam.source, scam.status) == ("ARGUS ML model", "suspicious")
    assert scam.score >= 60 and "%" in scam.summary
    calm = ml_signal("Hey are we still on for lunch tomorrow at noon?")
    assert calm.status == "clean" and "%" in calm.summary
