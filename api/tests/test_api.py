from fastapi.testclient import TestClient

from argus_api import main
from argus_api.checkers.file import eicar_bytes
from argus_api.main import app
from argus_api.risk_engine import get_engine

client = TestClient(app)


def test_health_reports_unconfigured_sources():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["sources"]["VirusTotal"] is False


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


def test_scan_text():
    r = client.post("/scan", json={"input": "Hey are we still on for lunch tomorrow at noon?"})
    assert r.status_code == 200
    assert r.json()["kind"] == "text"
