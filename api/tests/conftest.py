import pytest

from argus_api import config


@pytest.fixture(autouse=True)
def no_real_keys(monkeypatch):
    """Tests never use real API keys or the network unless a test opts in."""
    for env in config.KEY_NAMES.values():
        monkeypatch.delenv(env, raising=False)
    monkeypatch.setenv("ARGUS_DEFAULT_REGION", "US")
    monkeypatch.setenv("ARGUS_OFFLINE", "1")  # no DNS, TLS or page fetches unless a test opts in
    monkeypatch.delenv("ARGUS_API_TOKEN", raising=False)  # the engine is open unless a test sets a token
