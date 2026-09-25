from fastapi.testclient import TestClient

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
