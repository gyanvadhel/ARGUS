import pytest

from argus_api.detect import detect_kind


@pytest.mark.parametrize("raw", [
    "https://example.com/login",
    "paypal-security-alert.net/verify",
    "www.google.com",
    "http://192.168.1.10:8080/admin",
    "http://paypal.com@evil.example/x",
    "   https://x.com   ",
    "185.220.101.45",
    "192.168.1.10",
])
def test_urls(raw):
    assert detect_kind(raw) == "url"


@pytest.mark.parametrize("raw", ["+1 (800) 555-0142", "1-800-555-0142", "9876543210", "+44 20 7946 0958"])
def test_phones(raw):
    assert detect_kind(raw) == "phone"


def test_raw_email_with_headers():
    raw = "From: a@b.com\nTo: c@d.com\nSubject: hi\n\nbody text"
    assert detect_kind(raw) == "email"


@pytest.mark.parametrize("raw", ["bob@gmail.com", "Your account is suspended, click here", "12345", "2024"])
def test_everything_else_is_text(raw):
    assert detect_kind(raw) == "text"
