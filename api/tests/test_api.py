from fastapi.testclient import TestClient

from argus_api import main
from argus_api.checkers.file import eicar_bytes
from argus_api.intel import feeds
from argus_api.main import app
from argus_api.risk_engine import get_engine

client = TestClient(app)


def test_health_reports_unconfigured_sources():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["sources"]["VirusTotal"] is False


def test_health_reports_threat_feeds():
    status = client.get("/health").json()["feeds"]
    assert set(status) == {"urlhaus", "openphish", "phishing_db", "tranco"}
    assert {"label", "count", "fetched_at", "error"} <= set(status["openphish"])


class _FeedRecorder:
    def __init__(self):
        self.calls = []

    def start(self):
        self.calls.append("start")

    def load_from_cache(self):
        self.calls.append("cache")

    def status(self):
        return {}


def test_startup_keeps_threat_feeds_fresh(monkeypatch):
    recorder = _FeedRecorder()
    monkeypatch.setattr(feeds, "store", recorder)
    monkeypatch.delenv("ARGUS_OFFLINE")
    with TestClient(app):
        pass
    assert recorder.calls == ["start"]


def test_offline_startup_only_uses_cached_feeds(monkeypatch):
    recorder = _FeedRecorder()
    monkeypatch.setattr(feeds, "store", recorder)
    with TestClient(app):
        pass
    assert recorder.calls == ["cache"]


def test_quick_check_answers_from_feeds_and_rules_without_visiting_the_site():
    r = client.post("/scan/quick", json={"input": "http://paypal-security-alert.net/verify"})
    body = r.json()
    assert r.status_code == 200 and body["kind"] == "url" and body["score"] >= 60
    sources = {s["source"] for s in body["signals"]}
    assert not sources & {"Domain check (DNS)", "Page content", "Domain age (RDAP)", "VirusTotal"}


def test_quick_check_is_only_for_links():
    assert client.post("/scan/quick", json={"input": "are we still on for lunch?"}).status_code == 422


def test_engine_trains_from_bundled_data():
    assert "Safe" in get_engine().classes_


def test_scan_rejects_blank_input():
    assert client.post("/scan", json={"input": "   "}).status_code == 422


def test_scan_file_endpoint():
    r = client.post("/scan/file", files={"file": ("sample.txt", eicar_bytes(), "text/plain")})
    assert r.status_code == 200
    assert r.json()["level"] == "HIGH RISK"


def test_scan_file_too_large(monkeypatch):
    monkeypatch.setattr(main, "MAX_FILE_BYTES", 10)
    r = client.post("/scan/file", files={"file": ("big.bin", b"x" * 20, "application/octet-stream")})
    assert r.status_code == 413


def test_scan_file_empty():
    r = client.post("/scan/file", files={"file": ("empty.txt", b"", "text/plain")})
    assert r.status_code == 422


def test_scan_routes_raw_email():
    raw = "From: Alice <alice@example.com>\nTo: you@example.com\nSubject: hi\n\nSee you at noon."
    assert client.post("/scan", json={"input": raw}).json()["kind"] == "email"


def test_phone_normalize_endpoint():
    assert client.get("/phone/normalize", params={"number": "(800) 555-0142"}).json() == {"e164": "+18005550142"}


def test_scan_phone_with_community_reports():
    r = client.post("/scan", json={"input": "+1 650-253-0000", "community_reports": 5}).json()
    assert r["kind"] == "phone" and r["score"] >= 60


def test_scan_phone_with_rich_community_data():
    body = {"input": "+1 650-253-0000", "community": {"reports": 6, "categories": {"Scam": 5, "Spam": 1}, "name": "Fake bank", "name_votes": 3, "sightings": 1}}
    r = client.post("/scan", json=body).json()
    community = next(s for s in r["signals"] if s["source"] == "Community reports")
    assert r["level"] == "HIGH RISK"
    assert "mostly as Scam" in community["summary"]
    assert community["evidence"]["name"] == "Fake bank"


def test_call_turn_endpoint_is_gone():
    assert client.post("/call/turn", json={"transcript": []}).status_code == 404


def test_scan_text():
    r = client.post("/scan", json={"input": "Hey are we still on for lunch tomorrow at noon?"})
    assert r.status_code == 200
    assert r.json()["kind"] == "text"


def test_scan_accepts_which_mailbox_an_email_came_from():
    raw = "From: a@b.example\nTo: c@d.example\nSubject: hi\n\nhello"
    assert client.post("/scan", json={"input": raw, "kind": "email", "mailbox": "spam"}).status_code == 200
    assert client.post("/scan", json={"input": raw, "kind": "email", "mailbox": "junk"}).status_code == 422


def test_a_deployed_engine_only_answers_the_website(monkeypatch):
    monkeypatch.setenv("ARGUS_API_TOKEN", "s3cret-token")
    body = {"input": "are we still on for lunch?"}
    assert client.post("/scan", json=body).status_code == 401
    assert client.post("/scan", json=body, headers={"authorization": "Bearer wrong"}).status_code == 401
    assert client.post("/scan", json=body, headers={"authorization": "Bearer s3cret-token"}).status_code == 200
    assert client.get("/health").status_code == 200  # hosting health checks stay open


def test_without_a_token_the_local_engine_stays_open():
    assert client.post("/scan", json={"input": "are we still on for lunch?"}).status_code == 200
