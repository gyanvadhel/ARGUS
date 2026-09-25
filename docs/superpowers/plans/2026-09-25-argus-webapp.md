# ARGUS Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an elite-looking security web app (Next.js + FastAPI + Supabase) that scans links, files, emails, phone numbers and messages against real threat-intel sources and ARGUS's ML, with accounts, saved history and a live dashboard.

**Architecture:** `api/` is a stateless Python FastAPI scanner that reuses the prototype's `risk_engine.py` and queries VirusTotal, URLhaus, MalwareBazaar, Google Safe Browsing and RDAP concurrently, merging everything into one `Verdict`. `web/` is a Next.js App Router app; its server actions call the API and store verdicts in Supabase Postgres under row-level security. Supabase handles email/password auth.

**Tech Stack:** Python 3.13, FastAPI, httpx, scikit-learn, phonenumbers, anthropic, pytest + respx · Node 22, Next.js (latest), React 19, TypeScript, Tailwind v4, shadcn/ui, Motion, anime.js v4, Recharts, @supabase/ssr, vitest · Supabase (Auth + Postgres).

**Spec:** `docs/superpowers/specs/2026-09-25-argus-webapp-design.md`

## Global Constraints

- Score bands: SAFE 0–29, LOW/MODERATE 30–59, SUSPICIOUS 60–79, HIGH RISK 80–100; plus `UNVERIFIED` when no source returned a usable result.
- An authoritative `malicious` signal (VirusTotal ≥3 engines, URLhaus hit, Safe Browsing hit, MalwareBazaar hit, EICAR, ARGUS blocklist) floors the score at 85.
- Every external call: 6s httpx timeout, 8s hard cap, run concurrently; missing key → `unavailable`; failure → `error`; a verdict is always returned.
- The API stores no user data; only `web/` talks to Supabase, always with the signed-in user's session (RLS `user_id = auth.uid()`).
- The EICAR test string must never appear contiguously in any source file, compiled `.pyc`, or JS bundle (Windows Defender quarantines it). Store it reversed and rebuild at runtime with a non-foldable call.
- Web file uploads capped at 8 MB (Next proxy body limit); API caps files at 32 MB.
- Visual rules: navy-ink background, glass panels, aurora indigo → violet → coral; Instrument Serif headlines, Geist Sans UI, Geist Mono data; **no green "hacker" styling**; risk colors only on verdict elements.
- Unbuilt features are labeled "Coming soon"; never fake a working feature. Simulated behavior (family alerts) is labeled "simulated".
- Secrets live only in `api/.env` (or root `.env`) and `web/.env.local`, all git-ignored.
- Claude model id for the Call Assistant: `claude-sonnet-5`.
- Commit after every task; do not push (remote `origin` exists; push only when the user asks).

## Review Focus

1. **A source is down, slow, or has no key** → the scan still returns in ≤ ~9s, showing "Not configured" / "Unreachable" cards and a verdict from the rest. Pinned in Task 3 (`test_check_url_survives_failures`) and Task 4 (no-key file scan).
2. **The API isn't running during the demo** → web shows "The ARGUS scanning engine is offline. Start it with dev.ps1." as a toast and the dashboard shows an offline badge, never a crash page. Pinned in Task 9 (`api.ts` offline error, manual check step) and Task 10 (health `.catch`).
3. **Messy "Scan anything" input** (surrounding whitespace, URL without scheme, phone with spaces/dashes/brackets, raw email with headers, a bare email address, `http://brand.com@evil.com`) → correct kind detection. Pinned in Task 2 `test_detect.py`.
4. **Binary, empty, or oversized files** → binary files skip text ML without crashing; empty → 422; > 32 MB → 413; web rejects > 8 MB before upload. Pinned in Task 4 tests and Task 9 client check.
5. **EICAR in source/bytecode** → Defender would delete files mid-demo. Pinned in Task 4 (`test_eicar_constant_is_correct`, `test_eicar_not_stored_contiguously`) and Task 9 (`eicar.ts` reversed build + `lib/eicar.test.ts`).

---

## File Structure

```
.env.example                      root example for api keys
dev.ps1                           starts api + web in two windows
README.md                         how to run + demo script
api/
  requirements.txt  pytest.ini  .env.example
  argus_api/
    __init__.py
    main.py            FastAPI routes: /health /scan /scan/file /phone/normalize /call/turn
    config.py          env loading, key lookup, source status
    models.py          Signal, Verdict, Kind, Status (pydantic)
    aggregate.py       combine(), band_for(), verdict_as_signal()
    detect.py          detect_kind()
    http.py            make_client(), guarded(), unavailable()
    risk_engine.py     copied from prototype, data path fixed
    call.py            Call Assistant logic
    data/training_data.csv  data/threat_intel.csv
    checkers/
      __init__.py
      vt.py            VT_BASE, vt_stats_signal()
      text.py          ml/rules/intel signals, extract_urls(), check_text()
      url.py           heuristics, local intel, URLhaus, Safe Browsing, VT, RDAP, check_url()
      file.py          EICAR, local inspection, VT, MalwareBazaar, check_file()
      email.py         header auth, body extraction, check_email()
      phone.py         normalize(), validity/blocklist/community, check_phone()
  tests/ conftest.py test_aggregate.py test_detect.py test_text.py test_url.py test_file.py test_email.py test_phone.py test_call.py test_api.py
web/
  next.config.ts  .env.example  vitest.config.ts
  src/proxy.ts                         session refresh + route guard
  src/app/layout.tsx  globals.css  page.tsx (landing)
  src/app/(auth)/layout.tsx  actions.ts  login/page.tsx  signup/page.tsx
  src/app/(app)/layout.tsx
  src/app/(app)/dashboard/page.tsx
  src/app/(app)/scan/page.tsx  actions.ts  [id]/page.tsx
  src/app/(app)/history/page.tsx
  src/app/(app)/call-assistant/page.tsx  actions.ts
  src/app/(app)/family/page.tsx  actions.ts
  src/lib/types.ts format.ts stats.ts stats.test.ts api.ts eicar.ts eicar.test.ts supabase/server.ts
  src/components/brand/logo.tsx
  src/components/iris/iris.tsx
  src/components/landing/{hero,channels,sources,how-it-works,roadmap,cta,footer,nav,reveal}.tsx
  src/components/auth/auth-form.tsx
  src/components/app/{sidebar,page-header,level-pill,stat-card,threats-chart,kind-breakdown,recent-scans,protection-status,scan-console,verdict-view,score-dial,signal-card,report-number,call-console,contacts-manager}.tsx
supabase migration applied via MCP: init_argus_schema
```

---

## Part A — Scanning API

### Task 1: API scaffold, verdict model, aggregator, health endpoint

**Files:**
- Create: `api/requirements.txt`, `api/pytest.ini`, `api/.env.example`, `.env.example`
- Create: `api/argus_api/__init__.py`, `api/argus_api/models.py`, `api/argus_api/aggregate.py`, `api/argus_api/config.py`, `api/argus_api/http.py`, `api/argus_api/main.py`, `api/argus_api/checkers/__init__.py`
- Create (copy): `api/argus_api/risk_engine.py`, `api/argus_api/data/training_data.csv`, `api/argus_api/data/threat_intel.csv`
- Test: `api/tests/conftest.py`, `api/tests/test_aggregate.py`, `api/tests/test_api.py`

**Interfaces:**
- Produces: `Signal`, `Verdict`, `Kind`, `Status` (models.py); `combine(kind, subject, signals, threat_type=None) -> Verdict`, `band_for(score) -> str`, `verdict_as_signal(v, source) -> Signal` (aggregate.py); `config.key(name) -> str | None`, `config.KEY_NAMES`, `config.source_status() -> dict[str,bool]`; `make_client() -> httpx.AsyncClient`, `async guarded(source, awaitable, timeout=8.0) -> Signal`, `unavailable(source, key_name) -> Signal` (http.py); FastAPI `app` with `GET /health`.

- [ ] **Step 1: Create files and venv**

`api/requirements.txt`:
```
fastapi>=0.115
uvicorn[standard]>=0.32
httpx>=0.27
pydantic>=2.9
python-dotenv>=1.0
python-multipart>=0.0.12
scikit-learn>=1.5
phonenumbers>=8.13
anthropic>=0.40
pytest>=8.3
pytest-asyncio>=0.24
respx>=0.21
```

`api/pytest.ini`:
```ini
[pytest]
testpaths = tests
asyncio_mode = auto
pythonpath = .
```

`api/.env.example` and root `.env.example` (same content):
```
# Threat-intel sources (all free tiers). Missing keys just show "Not configured".
VIRUSTOTAL_API_KEY=
GOOGLE_SAFE_BROWSING_KEY=
ABUSECH_AUTH_KEY=
# Optional: makes the Call Assistant use Claude instead of scripted replies
ANTHROPIC_API_KEY=
# Region used to read phone numbers without a +country code (US, IN, GB, ...)
ARGUS_DEFAULT_REGION=US
```

`api/argus_api/__init__.py` and `api/argus_api/checkers/__init__.py`: empty files.

Copy the engine and data:
```powershell
New-Item -ItemType Directory -Force api/argus_api/data, api/argus_api/checkers, api/tests | Out-Null
Copy-Item ARGUS-main/risk_engine.py api/argus_api/risk_engine.py
Copy-Item ARGUS-main/training_data.csv, ARGUS-main/threat_intel.csv api/argus_api/data/
python -m venv api/.venv
api/.venv/Scripts/python -m pip install -q -r api/requirements.txt
```

In `api/argus_api/risk_engine.py` replace lines 31–32:
```python
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
```
with:
```python
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
```

- [ ] **Step 2: Write the failing tests**

`api/tests/conftest.py`:
```python
import pytest

from argus_api import config


@pytest.fixture(autouse=True)
def no_real_keys(monkeypatch):
    """Tests never use real API keys or the network unless a test opts in."""
    for env in config.KEY_NAMES.values():
        monkeypatch.delenv(env, raising=False)
    monkeypatch.setenv("ARGUS_DEFAULT_REGION", "US")
```

`api/tests/test_aggregate.py`:
```python
from argus_api.aggregate import band_for, combine, verdict_as_signal
from argus_api.models import Signal


def sig(status, score, weight=1.0, authoritative=False, **evidence):
    return Signal(source="test", status=status, score=score, weight=weight,
                  summary="s", authoritative=authoritative, evidence=evidence)


def test_bands():
    assert band_for(0) == "SAFE"
    assert band_for(29) == "SAFE"
    assert band_for(30) == "LOW/MODERATE"
    assert band_for(59) == "LOW/MODERATE"
    assert band_for(60) == "SUSPICIOUS"
    assert band_for(79) == "SUSPICIOUS"
    assert band_for(80) == "HIGH RISK"
    assert band_for(100) == "HIGH RISK"


def test_blends_weighted_average_with_peak():
    v = combine("text", "x", [sig("suspicious", 90), sig("suspicious", 70)])
    assert v.score == 85  # avg 80, peak 90
    assert v.level == "HIGH RISK"


def test_all_clean_is_safe_with_no_threat():
    v = combine("url", "x", [sig("clean", 0), sig("clean", 0)])
    assert (v.score, v.level, v.threat_type) == (0, "SAFE", "None")


def test_unavailable_and_error_signals_are_ignored():
    v = combine("url", "x", [sig("suspicious", 60), sig("unavailable", 0, weight=0), sig("error", 0, weight=0)])
    assert v.score == 60


def test_no_usable_signal_is_unverified():
    v = combine("url", "x", [sig("unavailable", 0, weight=0), sig("unknown", 0, weight=0)])
    assert (v.score, v.level) == (0, "UNVERIFIED")
    assert "couldn't verify" in v.recommendation


def test_authoritative_malicious_floors_score_at_85():
    v = combine("url", "x", [sig("malicious", 95, authoritative=True), sig("clean", 0), sig("clean", 0), sig("clean", 0)])
    assert v.score == 85
    assert v.level == "HIGH RISK"


def test_threat_type_comes_from_strongest_signal():
    v = combine("text", "x", [sig("suspicious", 70, threat_type="Phishing"), sig("clean", 0)])
    assert v.level == "LOW/MODERATE"
    assert v.threat_type == "Phishing"


def test_verdict_as_signal_carries_authority():
    v = combine("url", "http://x", [sig("malicious", 95, authoritative=True)])
    s = verdict_as_signal(v, "Link: x")
    assert (s.status, s.score, s.authoritative, s.source) == ("malicious", 95, True, "Link: x")
```

`api/tests/test_api.py`:
```python
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd api; .venv/Scripts/python -m pytest -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'argus_api.aggregate'` (and `config`, `main`).

- [ ] **Step 4: Implement**

`api/argus_api/models.py`:
```python
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Status = Literal["clean", "suspicious", "malicious", "unknown", "unavailable", "error"]
Kind = Literal["url", "file", "email", "phone", "text", "call"]


class Signal(BaseModel):
    """One source's opinion about the thing being scanned."""
    source: str
    status: Status
    score: int = Field(ge=0, le=100)
    weight: float = 1.0
    summary: str
    authoritative: bool = False
    evidence: dict[str, Any] = Field(default_factory=dict)


class Verdict(BaseModel):
    kind: Kind
    subject: str
    score: int
    level: str
    threat_type: str
    signals: list[Signal]
    recommendation: str
    scanned_at: str
```

`api/argus_api/aggregate.py`:
```python
"""Merge per-source signals into one 0-100 verdict."""
from __future__ import annotations

from datetime import datetime, timezone

from argus_api.models import Kind, Signal, Verdict

BANDS = [(0, 29, "SAFE"), (30, 59, "LOW/MODERATE"), (60, 79, "SUSPICIOUS"), (80, 100, "HIGH RISK")]
COUNTED = {"clean", "suspicious", "malicious"}
AUTHORITATIVE_FLOOR = 85

RECOMMENDATIONS = {
    "SAFE": "No action needed. Nothing we checked shows meaningful risk.",
    "LOW/MODERATE": "Proceed with normal caution. Don't share sensitive information unless you can verify the source independently.",
    "SUSPICIOUS": "Treat this as suspicious. Don't click links, share codes, or send money. Verify through an official channel first.",
    "HIGH RISK": "High risk. Don't respond, click, open, or pay. Block the sender and report it.",
    "UNVERIFIED": "We couldn't verify this with any source. Treat it with caution until you can confirm it independently.",
}


def band_for(score: int) -> str:
    for low, high, name in BANDS:
        if low <= score <= high:
            return name
    return "HIGH RISK" if score > 100 else "SAFE"


def combine(kind: Kind, subject: str, signals: list[Signal], threat_type: str | None = None) -> Verdict:
    counted = [s for s in signals if s.status in COUNTED and s.weight > 0]
    if not counted:
        score, level = 0, "UNVERIFIED"
    else:
        total_weight = sum(s.weight for s in counted)
        average = sum(s.score * s.weight for s in counted) / total_weight
        peak = max(s.score for s in counted)
        score = round((average + peak) / 2)
        if any(s.authoritative and s.status == "malicious" for s in counted):
            score = max(score, AUTHORITATIVE_FLOOR)
        score = max(0, min(100, score))
        level = band_for(score)

    if threat_type is None:
        threat_type = "None"
        if score >= 30:
            strongest = max(counted, key=lambda s: s.score)
            threat_type = str(strongest.evidence.get("threat_type") or "Suspicious activity")

    return Verdict(
        kind=kind,
        subject=subject[:300],
        score=score,
        level=level,
        threat_type=threat_type,
        signals=signals,
        recommendation=RECOMMENDATIONS[level],
        scanned_at=datetime.now(timezone.utc).isoformat(),
    )


def verdict_as_signal(v: Verdict, source: str) -> Signal:
    """Fold a nested verdict (e.g. a link inside an email) into one signal."""
    if v.level == "UNVERIFIED":
        status = "unknown"
    elif v.score >= 80:
        status = "malicious"
    elif v.score >= 30:
        status = "suspicious"
    else:
        status = "clean"
    return Signal(
        source=source,
        status=status,
        score=v.score,
        weight=1.0,
        summary=f"{v.level.title()}: {v.threat_type}" if v.score >= 30 else "No threats found for this link",
        authoritative=any(s.authoritative and s.status == "malicious" for s in v.signals),
        evidence={"subject": v.subject, "threat_type": v.threat_type, "signals": [s.model_dump() for s in v.signals]},
    )
```

`api/argus_api/config.py`:
```python
import os
from pathlib import Path

from dotenv import load_dotenv

_API_DIR = Path(__file__).resolve().parents[1]
load_dotenv(_API_DIR / ".env")
load_dotenv(_API_DIR.parent / ".env")

KEY_NAMES = {
    "VirusTotal": "VIRUSTOTAL_API_KEY",
    "Google Safe Browsing": "GOOGLE_SAFE_BROWSING_KEY",
    "abuse.ch (URLhaus + MalwareBazaar)": "ABUSECH_AUTH_KEY",
    "Claude (Call Assistant)": "ANTHROPIC_API_KEY",
}


def key(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


def source_status() -> dict[str, bool]:
    return {label: key(env) is not None for label, env in KEY_NAMES.items()}
```

`api/argus_api/http.py`:
```python
import asyncio
from typing import Awaitable

import httpx

from argus_api.models import Signal

TIMEOUT = httpx.Timeout(6.0)


def make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": "ARGUS-Scanner/1.0"})


async def guarded(source: str, pending: Awaitable[Signal], timeout: float = 8.0) -> Signal:
    """Never let one flaky source break a scan."""
    try:
        return await asyncio.wait_for(pending, timeout)
    except Exception as exc:  # noqa: BLE001 - any failure becomes an "error" signal
        return Signal(source=source, status="error", score=0, weight=0,
                      summary=f"{source} couldn't be reached ({type(exc).__name__})")


def unavailable(source: str, key_name: str) -> Signal:
    return Signal(source=source, status="unavailable", score=0, weight=0,
                  summary=f"{source} is not configured (set {key_name})")
```

`api/argus_api/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from argus_api import config

app = FastAPI(title="ARGUS API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "sources": config.source_status()}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd api; .venv/Scripts/python -m pytest -q`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add api .env.example
git commit -m "feat(api): scaffold scanner with verdict model, aggregator and health endpoint"
```

---

### Task 2: Kind detection, text checker, `/scan`

**Files:**
- Create: `api/argus_api/detect.py`, `api/argus_api/checkers/text.py`
- Modify: `api/argus_api/main.py`
- Test: `api/tests/test_detect.py`, `api/tests/test_text.py`, `api/tests/test_api.py`

**Interfaces:**
- Consumes: `combine`, `Signal`, `Verdict`, `get_engine()` (engine exposes `_ml_signal(text) -> (score0_100, label, confidence)`, `_rule_signal(text) -> (score, hits[{phrase,description,severity}])`, `_intel_signal(text) -> (score, hits[row dicts])`, `threat_intel`, `lookup_phone(number)`), `THREAT_TYPE_BY_LABEL`.
- Produces: `detect_kind(raw) -> Kind`; `ml_signal(text) -> Signal`, `rules_signal(text) -> Signal`, `intel_signal(text) -> Signal`, `local_text_signals(text) -> list[Signal]`, `extract_urls(text, limit=3) -> list[str]`, `async check_text(text) -> Verdict`; `POST /scan` body `{input: str, kind?: Kind, community_reports?: int}` → `Verdict`; `async dispatch(kind, text, community_reports) -> Verdict` in main.py.

- [ ] **Step 1: Write the failing tests**

`api/tests/test_detect.py`:
```python
import pytest

from argus_api.detect import detect_kind


@pytest.mark.parametrize("raw", [
    "https://example.com/login",
    "paypal-security-alert.net/verify",
    "www.google.com",
    "http://192.168.1.10:8080/admin",
    "http://paypal.com@evil.example/x",
    "   https://x.com   ",
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
```

`api/tests/test_text.py`:
```python
from argus_api.checkers.text import check_text, extract_urls, intel_signal


def test_extract_urls_finds_schemes_www_and_bare_domains():
    text = "Go to https://evil.example.com/login now, or www.test.com. Also paypal-security-alert.net/verify"
    assert extract_urls(text) == ["https://evil.example.com/login", "www.test.com", "paypal-security-alert.net/verify"]


def test_extract_urls_ignores_email_addresses():
    assert extract_urls("mail bob@gmail.com please") == []


async def test_scam_text_scores_high():
    v = await check_text("URGENT: your account has been suspended. Verify your password and send gift cards "
                         "immediately or you will be arrested.")
    assert v.kind == "text"
    assert v.score >= 60
    rules = next(s for s in v.signals if s.source == "Scam phrase rules")
    assert rules.status == "suspicious"


async def test_benign_text_is_safe():
    v = await check_text("Hey are we still on for lunch tomorrow at noon?")
    assert v.level == "SAFE"


def test_intel_hit_on_known_scam_number():
    s = intel_signal("please call 1-800-555-0142 right away")
    assert s.status == "malicious"
```

Append to `api/tests/test_api.py`:
```python
def test_scan_rejects_blank_input():
    assert client.post("/scan", json={"input": "   "}).status_code == 422


def test_scan_text():
    r = client.post("/scan", json={"input": "Hey are we still on for lunch tomorrow at noon?"})
    assert r.status_code == 200
    assert r.json()["kind"] == "text"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api; .venv/Scripts/python -m pytest -q`
Expected: FAIL — `No module named 'argus_api.detect'` / `'argus_api.checkers.text'`, `/scan` 404.

- [ ] **Step 3: Implement**

`api/argus_api/detect.py`:
```python
import re

from argus_api.models import Kind

_HEADER = re.compile(r"^(from|to|subject|received|return-path|message-id|date|reply-to|authentication-results):", re.I | re.M)
_URL = re.compile(r"^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(:\d{2,5})?([/?#]\S*)?$", re.I)
_IP_URL = re.compile(r"^(https?://)?\d{1,3}(\.\d{1,3}){3}(:\d{2,5})?([/?#]\S*)?$")
_SCHEME = re.compile(r"^https?://\S+$", re.I)
_PHONE = re.compile(r"^\+?[\d\s\-().]{7,20}$")


def detect_kind(raw: str) -> Kind:
    text = raw.strip()
    if len(_HEADER.findall(text)) >= 2:
        return "email"
    if _PHONE.match(text) and 7 <= sum(ch.isdigit() for ch in text) <= 15:
        return "phone"
    if _SCHEME.match(text) or _IP_URL.match(text) or _URL.match(text):
        return "url"
    return "text"
```

`api/argus_api/checkers/text.py`:
```python
"""Message analysis: ARGUS ML + scam-phrase rules + local threat intel."""
from __future__ import annotations

import re

from argus_api.aggregate import combine
from argus_api.models import Signal, Verdict
from argus_api.risk_engine import THREAT_TYPE_BY_LABEL, get_engine

_URL_IN_TEXT = re.compile(r"(?:https?://|www\.)[^\s<>\"')]+", re.I)
_BARE_DOMAIN = re.compile(
    r"(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:com|net|org|info|io|co|in|us|biz|xyz|top|link|click|app|ly|me|site|online)"
    r"(?:/[^\s<>\"')]*)?",
    re.I,
)


def extract_urls(text: str, limit: int = 3) -> list[str]:
    found: list[str] = []
    for match in _URL_IN_TEXT.findall(text) + _BARE_DOMAIN.findall(text):
        candidate = match.rstrip(".,;:!?")
        if not any(candidate in f or f in candidate for f in found):
            found.append(candidate)
    return found[:limit]


def ml_signal(text: str) -> Signal:
    score, label, confidence = get_engine()._ml_signal(text)
    return Signal(
        source="ARGUS ML model",
        status="suspicious" if score >= 50 else "clean",
        score=round(score),
        weight=1.0,
        summary=f"Classified as {label} ({confidence:.0%} confidence)",
        evidence={"label": label, "confidence": round(confidence, 2),
                  "threat_type": THREAT_TYPE_BY_LABEL.get(label, "Unknown")},
    )


def rules_signal(text: str) -> Signal:
    score, hits = get_engine()._rule_signal(text)
    count = len(hits)
    return Signal(
        source="Scam phrase rules",
        status="suspicious" if score >= 30 else "clean",
        score=round(score),
        weight=1.0,
        summary=f"{count} scam pattern{'s' if count != 1 else ''} matched" if hits else "No known scam phrases",
        evidence={
            "matches": [{"phrase": h["phrase"], "why": h["description"], "severity": h["severity"]} for h in hits],
            "threat_type": "Social engineering",
        },
    )


def intel_signal(text: str) -> Signal:
    score, hits = get_engine()._intel_signal(text)
    if not hits:
        return Signal(source="ARGUS threat intel", status="clean", score=0, weight=0.5,
                      summary="No known-bad domains, numbers or addresses")
    return Signal(
        source="ARGUS threat intel",
        status="malicious",
        score=max(round(score), 70),
        weight=1.0,
        summary=f"Matched {len(hits)} known-bad indicator{'s' if len(hits) != 1 else ''}",
        evidence={
            "matches": [{"indicator": h["indicator"], "type": h["type"], "category": h["category"],
                         "notes": h["notes"]} for h in hits],
            "threat_type": hits[0]["category"],
        },
    )


def local_text_signals(text: str) -> list[Signal]:
    return [ml_signal(text), rules_signal(text), intel_signal(text)]


async def check_text(text: str) -> Verdict:
    return combine("text", text[:120], local_text_signals(text))
```

Replace `api/argus_api/main.py` with:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from argus_api import config
from argus_api.checkers.text import check_text
from argus_api.detect import detect_kind
from argus_api.models import Kind, Verdict

app = FastAPI(title="ARGUS API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScanRequest(BaseModel):
    input: str = Field(max_length=100_000)
    kind: Kind | None = None
    community_reports: int = Field(default=0, ge=0, le=100_000)

    @field_validator("input")
    @classmethod
    def not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("input is empty")
        return value


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "sources": config.source_status()}


async def dispatch(kind: Kind, text: str, community_reports: int) -> Verdict:
    return await check_text(text)


@app.post("/scan", response_model=Verdict)
async def scan(req: ScanRequest) -> Verdict:
    kind = req.kind or detect_kind(req.input)
    return await dispatch(kind, req.input, req.community_reports)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api; .venv/Scripts/python -m pytest -q`
Expected: all PASS. If `test_benign_text_is_safe` fails, print `v.signals` — the sentence is verbatim in `training_data.csv` as Safe, so the ML score must be low; a failure means the data path is wrong.

- [ ] **Step 5: Commit**

```powershell
git add api
git commit -m "feat(api): detect input kind and analyze messages via /scan"
```

---

### Task 3: URL checker (URLhaus, Safe Browsing, VirusTotal, RDAP, heuristics)

**Files:**
- Create: `api/argus_api/checkers/vt.py`, `api/argus_api/checkers/url.py`
- Modify: `api/argus_api/checkers/text.py` (scan embedded links), `api/argus_api/main.py` (dispatch url)
- Test: `api/tests/test_url.py`, `api/tests/test_text.py`

**Interfaces:**
- Consumes: `guarded`, `make_client`, `unavailable`, `combine`, `verdict_as_signal`, `config.key`, `get_engine().threat_intel`.
- Produces: `VT_BASE`, `vt_stats_signal(source, stats, noun, extra=None) -> Signal` (vt.py); `normalize_url(raw) -> str`, `host_of(url) -> str`, `registrable_domain(host) -> str`, `BRAND_DOMAINS: dict[str, tuple[str,...]]`, `heuristics(url) -> Signal`, `local_intel(host) -> Signal`, `async urlhaus(client,url)`, `async safe_browsing(client,url)`, `async virustotal_url(client,url)`, `async domain_age(client,host)`, `async check_url(raw) -> Verdict` (url.py).

- [ ] **Step 1: Write the failing tests**

`api/tests/test_url.py`:
```python
from datetime import datetime, timedelta, timezone

import httpx
import respx

from argus_api.checkers import url as u
from argus_api.http import make_client


def test_normalize_url_adds_https():
    assert u.normalize_url("example.com/x") == "https://example.com/x"
    assert u.normalize_url("http://a.com") == "http://a.com"


def test_heuristics_flags_brand_impersonation():
    s = u.heuristics("http://paypal-security-alert.net/verify")
    assert s.status == "suspicious" and s.score >= 40
    assert any("Paypal" in r for r in s.evidence["reasons"])


def test_heuristics_flags_lookalike_characters():
    assert u.heuristics("https://amaz0n-support.com").score >= 45


def test_heuristics_trusts_real_brand_domain():
    s = u.heuristics("https://www.paypal.com/signin")
    assert (s.status, s.score) == ("clean", 0)


def test_heuristics_flags_raw_ip():
    assert u.heuristics("http://185.12.4.9/login").score >= 35


def test_local_intel_hit():
    s = u.local_intel("paypal-security-alert.net")
    assert s.status == "malicious" and s.score == 90


async def test_urlhaus_hit(monkeypatch):
    monkeypatch.setenv("ABUSECH_AUTH_KEY", "k")
    with respx.mock:
        respx.post("https://urlhaus-api.abuse.ch/v1/url/").respond(
            json={"query_status": "ok", "threat": "malware_download", "url_status": "online", "tags": ["emotet"]})
        async with make_client() as c:
            s = await u.urlhaus(c, "http://bad.example/x.exe")
    assert s.status == "malicious" and s.authoritative


async def test_urlhaus_without_key_is_unavailable():
    async with make_client() as c:
        s = await u.urlhaus(c, "http://x.example")
    assert s.status == "unavailable"


async def test_safe_browsing_match(monkeypatch):
    monkeypatch.setenv("GOOGLE_SAFE_BROWSING_KEY", "k")
    with respx.mock:
        respx.post(url__startswith="https://safebrowsing.googleapis.com/v4/threatMatches:find").respond(
            json={"matches": [{"threatType": "SOCIAL_ENGINEERING"}]})
        async with make_client() as c:
            s = await u.safe_browsing(c, "http://x.example")
    assert s.status == "malicious" and s.evidence["threat_type"] == "Phishing"


async def test_virustotal_url_counts_engines(monkeypatch):
    monkeypatch.setenv("VIRUSTOTAL_API_KEY", "k")
    stats = {"malicious": 7, "suspicious": 1, "harmless": 60, "undetected": 20}
    with respx.mock:
        respx.get(url__startswith="https://www.virustotal.com/api/v3/urls/").respond(
            json={"data": {"attributes": {"last_analysis_stats": stats}}})
        async with make_client() as c:
            s = await u.virustotal_url(c, "http://x.example")
    assert s.status == "malicious" and "7/88" in s.summary


async def test_virustotal_url_unknown(monkeypatch):
    monkeypatch.setenv("VIRUSTOTAL_API_KEY", "k")
    with respx.mock:
        respx.get(url__startswith="https://www.virustotal.com/api/v3/urls/").respond(404, json={"error": {}})
        async with make_client() as c:
            s = await u.virustotal_url(c, "http://x.example")
    assert s.status == "unknown"


async def test_domain_age_new_domain():
    registered = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
    with respx.mock:
        respx.get("https://rdap.org/domain/brand-new.xyz").respond(
            json={"events": [{"eventAction": "registration", "eventDate": registered}]})
        async with make_client() as c:
            s = await u.domain_age(c, "login.brand-new.xyz")
    assert (s.status, s.score) == ("suspicious", 65)


async def test_domain_age_old_domain():
    with respx.mock:
        respx.get("https://rdap.org/domain/example.com").respond(
            json={"events": [{"eventAction": "registration", "eventDate": "1995-08-14T04:00:00Z"}]})
        async with make_client() as c:
            s = await u.domain_age(c, "www.example.com")
    assert s.status == "clean"


async def test_check_url_survives_failures():
    with respx.mock:
        respx.get(url__startswith="https://rdap.org/").mock(side_effect=httpx.ConnectTimeout("slow"))
        v = await u.check_url("paypal-security-alert.net/verify")
    statuses = {s.source: s.status for s in v.signals}
    assert v.kind == "url"
    assert statuses["URLhaus"] == "unavailable"
    assert statuses["Domain age (RDAP)"] == "error"
    assert v.score >= 60
```

Append to `api/tests/test_text.py`:
```python
import respx


async def test_links_inside_messages_are_scanned():
    with respx.mock:  # every outbound call is unmocked -> error signals, no real network
        v = await check_text("Verify now at http://paypal-security-alert.net/verify")
    assert any(s.source == "Link: paypal-security-alert.net" for s in v.signals)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api; .venv/Scripts/python -m pytest -q`
Expected: FAIL — `cannot import name 'url'`, missing link signal.

- [ ] **Step 3: Implement**

`api/argus_api/checkers/vt.py`:
```python
from argus_api.models import Signal

VT_BASE = "https://www.virustotal.com/api/v3"


def vt_stats_signal(source: str, stats: dict, noun: str, extra: dict | None = None) -> Signal:
    malicious = int(stats.get("malicious", 0))
    suspicious = int(stats.get("suspicious", 0))
    total = sum(int(v) for v in stats.values() if isinstance(v, (int, float)))
    evidence = {"malicious": malicious, "suspicious": suspicious, "total": total, **(extra or {})}
    summary = f"{malicious}/{total} security vendors flag this {noun}"
    if malicious >= 3:
        evidence.setdefault("threat_type", f"Malicious {noun}")
        return Signal(source=source, status="malicious", score=min(100, 70 + malicious), weight=1.5,
                      authoritative=True, summary=summary, evidence=evidence)
    if malicious >= 1 or suspicious >= 2:
        return Signal(source=source, status="suspicious", score=50, weight=1.0, summary=summary, evidence=evidence)
    return Signal(source=source, status="clean", score=0, weight=1.0, summary=summary, evidence=evidence)
```

`api/argus_api/checkers/url.py`:
```python
"""Link analysis: heuristics + ARGUS intel + URLhaus + Safe Browsing + VirusTotal + domain age."""
from __future__ import annotations

import asyncio
import base64
import ipaddress
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

from argus_api import config
from argus_api.aggregate import combine
from argus_api.checkers.vt import VT_BASE, vt_stats_signal
from argus_api.http import guarded, make_client, unavailable
from argus_api.models import Signal, Verdict
from argus_api.risk_engine import get_engine

URLHAUS_URL = "https://urlhaus-api.abuse.ch/v1/url/"
SAFE_BROWSING_URL = "https://safebrowsing.googleapis.com/v4/threatMatches:find"
RDAP_URL = "https://rdap.org/domain/"

SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "ow.ly", "cutt.ly", "rb.gy", "grabify.link", "shorturl.at"}
RISKY_TLDS = {"zip", "mov", "xyz", "top", "click", "country", "gq", "tk", "ml", "cf", "work", "support", "rest", "cam", "icu"}
TWO_LEVEL_SUFFIXES = {"co.uk", "org.uk", "ac.uk", "co.in", "org.in", "gov.in", "ac.in", "net.in",
                      "com.au", "co.jp", "com.br", "co.nz", "com.sg"}
BRAND_DOMAINS: dict[str, tuple[str, ...]] = {
    "paypal": ("paypal.com",),
    "amazon": ("amazon.com", "amazon.in", "amazon.co.uk", "amazon.de"),
    "microsoft": ("microsoft.com", "live.com", "office.com", "microsoftonline.com"),
    "apple": ("apple.com", "icloud.com"),
    "google": ("google.com", "gmail.com", "youtube.com"),
    "netflix": ("netflix.com",),
    "facebook": ("facebook.com", "fb.com"),
    "instagram": ("instagram.com",),
    "whatsapp": ("whatsapp.com",),
    "chase": ("chase.com",),
    "wellsfargo": ("wellsfargo.com",),
    "hdfc": ("hdfcbank.com",),
    "icici": ("icicibank.com",),
    "sbi": ("onlinesbi.sbi", "sbi.co.in"),
    "paytm": ("paytm.com",),
}
SAFE_BROWSING_TYPES = {"MALWARE": "Malware", "SOCIAL_ENGINEERING": "Phishing",
                       "UNWANTED_SOFTWARE": "Unwanted software", "POTENTIALLY_HARMFUL_APPLICATION": "Harmful app"}
LOCAL_SEVERITY = {"strong": 90, "medium": 60, "weak": 30}
_LOOKALIKES = [str.maketrans({"0": "o", "1": "l", "3": "e", "5": "s", "4": "a"}),
               str.maketrans({"0": "o", "1": "i", "3": "e", "5": "s", "4": "a"})]


def normalize_url(raw: str) -> str:
    s = raw.strip()
    return s if re.match(r"^[a-z][a-z0-9+.-]*://", s, re.I) else "https://" + s


def host_of(url: str) -> str:
    return (urlparse(normalize_url(url)).hostname or "").lower().rstrip(".")


def registrable_domain(host: str) -> str:
    parts = host.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in TWO_LEVEL_SUFFIXES:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def _is_official(host: str, domains: tuple[str, ...]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def _brand_hits(host: str) -> list[str]:
    tokens = re.split(r"[.\-]", host)
    return [b for b in BRAND_DOMAINS
            if any(t == b or (len(b) >= 6 and t.startswith(b)) for t in tokens)]


def heuristics(url: str) -> Signal:
    parsed = urlparse(url)
    host = host_of(url)
    points = 0
    reasons: list[str] = []
    threat = None

    def flag(n: int, why: str) -> None:
        nonlocal points
        points += n
        reasons.append(why)

    if _is_ip(host):
        flag(35, "Uses a raw IP address instead of a domain name")
    if "@" in parsed.netloc:
        flag(30, "Hides the real destination behind an '@' in the address")
    if "xn--" in host:
        flag(30, "Uses look-alike international characters (punycode)")
    for brand in _brand_hits(host):
        if not _is_official(host, BRAND_DOMAINS[brand]):
            flag(40, f"Mentions {brand.title()} but isn't an official {brand.title()} domain")
            threat = "Phishing"
    if threat is None:
        for table in _LOOKALIKES:
            swapped = host.translate(table)
            if swapped == host:
                continue
            brand = next((b for b in _brand_hits(swapped) if not _is_official(swapped, BRAND_DOMAINS[b])), None)
            if brand:
                flag(45, f"Imitates {brand.title()} by swapping look-alike characters")
                threat = "Phishing"
                break
    if host in SHORTENERS or registrable_domain(host) in SHORTENERS:
        flag(20, "Link shortener hides the final destination")
    tld = host.rsplit(".", 1)[-1] if "." in host else ""
    if tld in RISKY_TLDS:
        flag(15, f"Uses the .{tld} domain ending, popular with scammers")
    if host.count("-") >= 3 or len(host) > 40:
        flag(10, "Unusually long or hyphen-heavy domain name")
    if parsed.scheme == "http":
        flag(10, "Not encrypted (plain http)")

    score = min(points, 100)
    return Signal(
        source="ARGUS heuristics",
        status="suspicious" if score >= 30 else "clean",
        score=score,
        weight=1.0,
        summary=reasons[0] if reasons else "No suspicious patterns in the address",
        evidence={"reasons": reasons, "host": host, "threat_type": threat or "Suspicious link"},
    )


def local_intel(host: str) -> Signal:
    hits = [e for e in get_engine().threat_intel
            if e["type"] == "domain" and (host == e["indicator"].lower() or host.endswith("." + e["indicator"].lower()))]
    if not hits:
        return Signal(source="ARGUS threat intel", status="clean", score=0, weight=0.5, summary="Not on the ARGUS blocklist")
    top = max(hits, key=lambda e: LOCAL_SEVERITY.get(e["severity"], 30))
    score = LOCAL_SEVERITY.get(top["severity"], 30)
    return Signal(
        source="ARGUS threat intel",
        status="malicious" if score >= 60 else "suspicious",
        score=score,
        weight=1.0,
        summary=top["notes"],
        evidence={"indicator": top["indicator"], "category": top["category"], "threat_type": top["category"]},
    )


async def urlhaus(client: httpx.AsyncClient, url: str) -> Signal:
    key = config.key("ABUSECH_AUTH_KEY")
    if not key:
        return unavailable("URLhaus", "ABUSECH_AUTH_KEY")
    r = await client.post(URLHAUS_URL, data={"url": url}, headers={"Auth-Key": key})
    r.raise_for_status()
    body = r.json()
    if body.get("query_status") == "ok":
        threat = (body.get("threat") or "malware").replace("_", " ")
        return Signal(source="URLhaus", status="malicious", score=95, weight=1.5, authoritative=True,
                      summary=f"Listed on URLhaus as {threat} ({body.get('url_status', 'unknown')})",
                      evidence={"threat": threat, "url_status": body.get("url_status"),
                                "tags": body.get("tags") or [], "threat_type": "Malware distribution"})
    return Signal(source="URLhaus", status="clean", score=0, weight=1.0, summary="Not listed on URLhaus")


async def safe_browsing(client: httpx.AsyncClient, url: str) -> Signal:
    key = config.key("GOOGLE_SAFE_BROWSING_KEY")
    if not key:
        return unavailable("Google Safe Browsing", "GOOGLE_SAFE_BROWSING_KEY")
    body = {
        "client": {"clientId": "argus", "clientVersion": "1.0"},
        "threatInfo": {"threatTypes": list(SAFE_BROWSING_TYPES), "platformTypes": ["ANY_PLATFORM"],
                       "threatEntryTypes": ["URL"], "threatEntries": [{"url": url}]},
    }
    r = await client.post(SAFE_BROWSING_URL, params={"key": key}, json=body)
    r.raise_for_status()
    matches = r.json().get("matches") or []
    if matches:
        label = SAFE_BROWSING_TYPES.get(matches[0].get("threatType"), "Unsafe site")
        return Signal(source="Google Safe Browsing", status="malicious", score=95, weight=1.5, authoritative=True,
                      summary=f"Google flags this as {label.lower()}",
                      evidence={"threat_type": label, "matches": [m.get("threatType") for m in matches]})
    return Signal(source="Google Safe Browsing", status="clean", score=0, weight=1.0,
                  summary="Google Safe Browsing has no warnings")


async def virustotal_url(client: httpx.AsyncClient, url: str) -> Signal:
    key = config.key("VIRUSTOTAL_API_KEY")
    if not key:
        return unavailable("VirusTotal", "VIRUSTOTAL_API_KEY")
    url_id = base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")
    r = await client.get(f"{VT_BASE}/urls/{url_id}", headers={"x-apikey": key})
    if r.status_code == 404:
        return Signal(source="VirusTotal", status="unknown", score=0, weight=0,
                      summary="VirusTotal has no record of this link yet")
    r.raise_for_status()
    return vt_stats_signal("VirusTotal", r.json()["data"]["attributes"]["last_analysis_stats"], "link")


async def domain_age(client: httpx.AsyncClient, host: str) -> Signal:
    source = "Domain age (RDAP)"
    if not host or _is_ip(host):
        return Signal(source=source, status="unknown", score=0, weight=0, summary="No domain name to look up")
    domain = registrable_domain(host)
    r = await client.get(RDAP_URL + domain)
    if r.status_code == 404:
        return Signal(source=source, status="unknown", score=0, weight=0,
                      summary="No public registration record found", evidence={"domain": domain})
    r.raise_for_status()
    events = r.json().get("events") or []
    registered = next((e.get("eventDate") for e in events if e.get("eventAction") == "registration"), None)
    if not registered:
        return Signal(source=source, status="unknown", score=0, weight=0,
                      summary="Registration date isn't published", evidence={"domain": domain})
    created = datetime.fromisoformat(registered.replace("Z", "+00:00"))
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    days = max(0, (datetime.now(timezone.utc) - created).days)
    evidence = {"domain": domain, "registered": created.date().isoformat(), "age_days": days}
    if days < 30:
        return Signal(source=source, status="suspicious", score=65, weight=1.0,
                      summary=f"Domain registered only {days} day{'s' if days != 1 else ''} ago",
                      evidence={**evidence, "threat_type": "Newly registered domain"})
    if days < 180:
        return Signal(source=source, status="suspicious", score=35, weight=1.0,
                      summary=f"Domain is only {days} days old",
                      evidence={**evidence, "threat_type": "Newly registered domain"})
    years = days // 365
    return Signal(source=source, status="clean", score=0, weight=0.8,
                  summary=f"Domain has existed for {years} year{'s' if years != 1 else ''}" if years
                  else f"Domain is {days} days old",
                  evidence=evidence)


async def check_url(raw: str) -> Verdict:
    url = normalize_url(raw)
    host = host_of(url)
    async with make_client() as client:
        remote = await asyncio.gather(
            guarded("URLhaus", urlhaus(client, url)),
            guarded("Google Safe Browsing", safe_browsing(client, url)),
            guarded("VirusTotal", virustotal_url(client, url)),
            guarded("Domain age (RDAP)", domain_age(client, host)),
        )
    return combine("url", url, [heuristics(url), local_intel(host), *remote])
```

In `api/argus_api/checkers/text.py` add imports and replace `check_text`:
```python
import asyncio

from argus_api.aggregate import combine, verdict_as_signal
from argus_api.checkers.url import check_url, host_of
```
```python
async def check_text(text: str) -> Verdict:
    signals = local_text_signals(text)
    urls = extract_urls(text)
    if urls:
        verdicts = await asyncio.gather(*(check_url(u) for u in urls))
        signals += [verdict_as_signal(v, f"Link: {host_of(v.subject)}") for v in verdicts]
    return combine("text", text[:120], signals)
```
(Remove the old `from argus_api.aggregate import combine` line so the import appears once.)

In `api/argus_api/main.py` add `from argus_api.checkers.url import check_url` and change `dispatch`:
```python
async def dispatch(kind: Kind, text: str, community_reports: int) -> Verdict:
    if kind == "url":
        return await check_url(text)
    return await check_text(text)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api; .venv/Scripts/python -m pytest -q`
Expected: all PASS.

- [ ] **Step 5: Live smoke test (real network, no keys needed for RDAP)**

Run: `cd api; .venv/Scripts/python -c "import asyncio; from argus_api.checkers.url import check_url; v=asyncio.run(check_url('https://www.wikipedia.org')); print(v.score, v.level, [(s.source, s.status) for s in v.signals])"`
Expected: SAFE, `Domain age (RDAP)` status `clean`.

- [ ] **Step 6: Commit**

```powershell
git add api
git commit -m "feat(api): real link scanning via URLhaus, Safe Browsing, VirusTotal and RDAP"
```

---

### Task 4: File checker (EICAR, local inspection, VirusTotal, MalwareBazaar), `/scan/file`

**Files:**
- Create: `api/argus_api/checkers/file.py`
- Modify: `api/argus_api/main.py`
- Test: `api/tests/test_file.py`, `api/tests/test_api.py`

**Interfaces:**
- Consumes: `ml_signal`, `vt_stats_signal`, `VT_BASE`, `guarded`, `make_client`, `unavailable`, `combine`.
- Produces: `MAX_FILE_BYTES = 32*1024*1024`, `eicar_bytes() -> bytes`, `local_file_signal(filename, data) -> Signal` (evidence has `sha256`, `size_bytes`), `async virustotal_file(client, sha256)`, `async malwarebazaar(client, sha256)`, `async check_file(filename, data) -> Verdict`; `POST /scan/file` (multipart field `file`) → `Verdict`.

- [ ] **Step 1: Write the failing tests**

`api/tests/test_file.py`:
```python
import hashlib
from pathlib import Path

import respx

from argus_api.checkers import file as f

EICAR_SHA256 = "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f"


def test_eicar_constant_is_correct():
    assert hashlib.sha256(f.eicar_bytes()).hexdigest() == EICAR_SHA256


def test_eicar_not_stored_contiguously():
    needle = "".join(reversed("ELIF-TSET-SURIVITNA-DRADNATS-RACIE"))
    assert needle not in Path(f.__file__).read_text(encoding="utf-8")


def test_local_detects_eicar():
    s = f.local_file_signal("test.txt", f.eicar_bytes())
    assert (s.status, s.score, s.authoritative) == ("malicious", 100, True)


def test_disguised_extension():
    assert f.local_file_signal("invoice.pdf.exe", b"MZ\x90\x00").score >= 60


def test_windows_program_hidden_in_pdf():
    assert f.local_file_signal("report.pdf", b"MZ" + b"\x00" * 100).score >= 50


def test_office_macros():
    assert f.local_file_signal("doc.docm", b"PK\x03\x04....word/vbaProject.bin....").score >= 35


def test_plain_text_is_clean():
    s = f.local_file_signal("notes.txt", b"hello world")
    assert s.status == "clean"
    assert s.evidence["sha256"] == hashlib.sha256(b"hello world").hexdigest()


async def test_virustotal_file_hit(monkeypatch):
    monkeypatch.setenv("VIRUSTOTAL_API_KEY", "k")
    stats = {"malicious": 62, "suspicious": 0, "undetected": 8, "harmless": 0}
    attrs = {"last_analysis_stats": stats, "popular_threat_classification": {"suggested_threat_label": "eicar/test"}}
    with respx.mock:
        respx.get(f"https://www.virustotal.com/api/v3/files/{EICAR_SHA256}").respond(json={"data": {"attributes": attrs}})
        async with f.make_client() as c:
            s = await f.virustotal_file(c, EICAR_SHA256)
    assert s.status == "malicious" and "62/70" in s.summary
    assert s.evidence["threat_type"] == "eicar/test"


async def test_malwarebazaar_not_found_is_unknown(monkeypatch):
    monkeypatch.setenv("ABUSECH_AUTH_KEY", "k")
    with respx.mock:
        respx.post("https://mb-api.abuse.ch/api/v1/").respond(json={"query_status": "hash_not_found"})
        async with f.make_client() as c:
            s = await f.malwarebazaar(c, "0" * 64)
    assert s.status == "unknown"


async def test_binary_file_skips_text_model():
    v = await f.check_file("blob.bin", bytes(range(256)) * 100)
    assert v.kind == "file"
    assert all(s.source != "ARGUS ML (file contents)" for s in v.signals)


async def test_eicar_file_is_high_risk_without_any_keys():
    v = await f.check_file("eicar.com", f.eicar_bytes())
    assert v.level == "HIGH RISK"
```

Append to `api/tests/test_api.py`:
```python
from argus_api import main
from argus_api.checkers.file import eicar_bytes


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api; .venv/Scripts/python -m pytest -q`
Expected: FAIL — `cannot import name 'file'`.

- [ ] **Step 3: Implement**

`api/argus_api/checkers/file.py`:
```python
"""File analysis: local inspection + VirusTotal + MalwareBazaar (hash lookups, the file never leaves the server)."""
from __future__ import annotations

import asyncio
import hashlib

import httpx

from argus_api import config
from argus_api.aggregate import combine
from argus_api.checkers.text import ml_signal
from argus_api.checkers.vt import VT_BASE, vt_stats_signal
from argus_api.http import guarded, make_client, unavailable
from argus_api.models import Signal, Verdict

MAX_FILE_BYTES = 32 * 1024 * 1024
MALWAREBAZAAR_URL = "https://mb-api.abuse.ch/api/v1/"

# Stored reversed so antivirus software doesn't quarantine this file or its .pyc.
_EICAR_REVERSED = "*H+H$!ELIF-TSET-SURIVITNA-DRADNATS-RACIE$}7)CC7)^P(45XZP\\4[PA@%P!O5X"

DANGEROUS_EXT = {"exe", "scr", "bat", "cmd", "com", "pif", "vbs", "vbe", "js", "jse", "wsf", "ps1",
                 "msi", "jar", "hta", "lnk", "dll", "iso", "img"}
DECOY_EXT = {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png", "gif", "txt", "mp3", "mp4", "zip"}
EXECUTABLE_EXT = {"exe", "dll", "scr", "msi", "com", "sys"}


def eicar_bytes() -> bytes:
    return "".join(reversed(_EICAR_REVERSED)).encode("ascii")


def _as_text(data: bytes) -> str | None:
    sample = data[:20000]
    if b"\x00" in sample:
        return None
    try:
        text = sample.decode("utf-8")
    except UnicodeDecodeError:
        return None
    if not text:
        return None
    printable = sum(ch.isprintable() or ch in "\r\n\t" for ch in text)
    return text if printable / len(text) > 0.9 else None


def local_file_signal(filename: str, data: bytes) -> Signal:
    name = (filename or "upload").lower()
    parts = name.split(".")
    ext = parts[-1] if len(parts) > 1 else ""
    evidence = {"sha256": hashlib.sha256(data).hexdigest(), "size_bytes": len(data), "filename": filename}

    if eicar_bytes() in data[:256]:
        return Signal(source="ARGUS file inspection", status="malicious", score=100, weight=1.5, authoritative=True,
                      summary="Matches the EICAR antivirus test signature",
                      evidence={**evidence, "reasons": ["EICAR standard antivirus test file"],
                                "threat_type": "Test malware (EICAR)"})

    points = 0
    reasons: list[str] = []
    if len(parts) >= 3 and ext in DANGEROUS_EXT and parts[-2] in DECOY_EXT:
        points += 60
        reasons.append(f"Disguised as .{parts[-2]} but is actually a .{ext} program")
    elif ext in DANGEROUS_EXT:
        points += 25
        reasons.append(f".{ext} files can run code on your computer")
    if data[:2] == b"MZ" and ext not in EXECUTABLE_EXT:
        points += 50
        reasons.append(f"Contains a Windows program hidden inside a .{ext or 'unknown'} file")
    if data[:4] == b"PK\x03\x04" and b"vbaProject.bin" in data:
        points += 35
        reasons.append("Contains Office macros")
    if data[:4] == b"%PDF" and (b"/JavaScript" in data or b"/OpenAction" in data):
        points += 25
        reasons.append("PDF contains auto-running scripts")

    score = min(points, 100)
    return Signal(source="ARGUS file inspection", status="suspicious" if score >= 30 else "clean", score=score,
                  weight=1.0, summary=reasons[0] if reasons else "No risky file traits found",
                  evidence={**evidence, "reasons": reasons, "threat_type": "Malware" if score >= 30 else "None"})


async def virustotal_file(client: httpx.AsyncClient, sha256: str) -> Signal:
    key = config.key("VIRUSTOTAL_API_KEY")
    if not key:
        return unavailable("VirusTotal", "VIRUSTOTAL_API_KEY")
    r = await client.get(f"{VT_BASE}/files/{sha256}", headers={"x-apikey": key})
    if r.status_code == 404:
        return Signal(source="VirusTotal", status="unknown", score=0, weight=0, summary="VirusTotal has never seen this file")
    r.raise_for_status()
    attrs = r.json()["data"]["attributes"]
    label = (attrs.get("popular_threat_classification") or {}).get("suggested_threat_label")
    return vt_stats_signal("VirusTotal", attrs.get("last_analysis_stats") or {}, "file",
                           {"threat_type": label} if label else None)


async def malwarebazaar(client: httpx.AsyncClient, sha256: str) -> Signal:
    key = config.key("ABUSECH_AUTH_KEY")
    if not key:
        return unavailable("MalwareBazaar", "ABUSECH_AUTH_KEY")
    r = await client.post(MALWAREBAZAAR_URL, data={"query": "get_info", "hash": sha256}, headers={"Auth-Key": key})
    r.raise_for_status()
    body = r.json()
    if body.get("query_status") == "ok" and body.get("data"):
        d = body["data"][0]
        name = d.get("signature") or d.get("file_type") or "malware"
        return Signal(source="MalwareBazaar", status="malicious", score=95, weight=1.5, authoritative=True,
                      summary=f"Known malware sample: {name}",
                      evidence={"signature": d.get("signature"), "file_type": d.get("file_type"),
                                "first_seen": d.get("first_seen"), "threat_type": name})
    return Signal(source="MalwareBazaar", status="unknown", score=0, weight=0,
                  summary="Not in MalwareBazaar's malware database")


async def check_file(filename: str, data: bytes) -> Verdict:
    local = local_file_signal(filename, data)
    sha256 = local.evidence["sha256"]
    async with make_client() as client:
        remote = await asyncio.gather(
            guarded("VirusTotal", virustotal_file(client, sha256)),
            guarded("MalwareBazaar", malwarebazaar(client, sha256)),
        )
    signals = [local, *remote]
    text = _as_text(data)
    if text:
        signals.append(ml_signal(text[:5000]).model_copy(update={"source": "ARGUS ML (file contents)", "weight": 0.5}))
    return combine("file", filename or "upload", signals)
```

In `api/argus_api/main.py`: change the fastapi import to `from fastapi import FastAPI, HTTPException, UploadFile`, add `from argus_api.checkers.file import MAX_FILE_BYTES, check_file`, and append:
```python
@app.post("/scan/file", response_model=Verdict)
async def scan_file(file: UploadFile) -> Verdict:
    data = await file.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (32 MB max)")
    if not data:
        raise HTTPException(status_code=422, detail="File is empty")
    return await check_file(file.filename or "upload", data)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api; .venv/Scripts/python -m pytest -q`
Expected: all PASS. Also run `Get-ChildItem api -Recurse -Include *.py,*.pyc | Select-String -SimpleMatch "EICAR-STANDARD"` — expected: no output.

- [ ] **Step 5: Commit**

```powershell
git add api
git commit -m "feat(api): file scanning via local inspection, VirusTotal and MalwareBazaar"
```

---

## Part B — Data, auth and the web app

### Task 5: Supabase project and schema

**Files:**
- Create: Supabase migration `init_argus_schema` (applied through the Supabase MCP)
- Create: `web/.env.local` (git-ignored; written after Task 6 scaffolds `web/`, values recorded here)

**Interfaces:**
- Produces: tables `public.scans(id uuid, user_id uuid, kind text, input_preview text, score int, level text, threat_type text, verdict jsonb, created_at timestamptz)`, `public.trusted_contacts(id, user_id, name, email, phone, notify_high_risk bool, created_at)`, `public.phone_reports(id, user_id, number text E.164, category text, note text, created_at)`; env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

- [ ] **Step 1:** Invoke the `supabase:supabase` and `supabase:supabase-postgres-best-practices` skills. Call `list_organizations`; create a project named `argus` (region closest to the user) with `create_project`, following any cost-confirmation flow the tool requires. Wait until `get_project` reports `ACTIVE_HEALTHY`.

- [ ] **Step 2:** Apply migration `init_argus_schema`:
```sql
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('url','file','email','phone','text','call')),
  input_preview text not null default '' check (char_length(input_preview) <= 200),
  score int not null check (score between 0 and 100),
  level text not null check (level in ('SAFE','LOW/MODERATE','SUSPICIOUS','HIGH RISK','UNVERIFIED')),
  threat_type text not null default 'None',
  verdict jsonb not null,
  created_at timestamptz not null default now()
);
create index scans_user_created_idx on public.scans (user_id, created_at desc);
alter table public.scans enable row level security;
create policy scans_select_own on public.scans for select to authenticated using ((select auth.uid()) = user_id);
create policy scans_insert_own on public.scans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy scans_delete_own on public.scans for delete to authenticated using ((select auth.uid()) = user_id);

create table public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 32),
  notify_high_risk boolean not null default true,
  created_at timestamptz not null default now()
);
create index trusted_contacts_user_idx on public.trusted_contacts (user_id);
alter table public.trusted_contacts enable row level security;
create policy contacts_select_own on public.trusted_contacts for select to authenticated using ((select auth.uid()) = user_id);
create policy contacts_insert_own on public.trusted_contacts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy contacts_update_own on public.trusted_contacts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy contacts_delete_own on public.trusted_contacts for delete to authenticated using ((select auth.uid()) = user_id);

create table public.phone_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number text not null check (number ~ '^\+[1-9][0-9]{6,14}$'),
  category text not null check (category in ('Scam','Spam','Robocall','Fraud','Other')),
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  unique (user_id, number)
);
create index phone_reports_number_idx on public.phone_reports (number);
alter table public.phone_reports enable row level security;
-- community data: any signed-in user can read reports, but only write their own
create policy reports_select_all on public.phone_reports for select to authenticated using (true);
create policy reports_insert_own on public.phone_reports for insert to authenticated with check ((select auth.uid()) = user_id);
create policy reports_delete_own on public.phone_reports for delete to authenticated using ((select auth.uid()) = user_id);
```

- [ ] **Step 3: Verify**

Run via `execute_sql`:
```sql
select relname, relrowsecurity from pg_class
where relname in ('scans','trusted_contacts','phone_reports') order by relname;
```
Expected: 3 rows, all `relrowsecurity = true`. Then `get_advisors` (security): expected no errors for these tables; fix any warning it raises about these tables.

- [ ] **Step 4:** Get `get_project_url` and `get_publishable_keys`; keep them for `web/.env.local` in Task 6.

- [ ] **Step 5: Manual step for the user** — Supabase dashboard → Authentication → Sign In / Providers → Email → turn **off** "Confirm email" (so demo sign-ups log in instantly). Ask the user to do this and confirm.

- [ ] **Step 6: Commit** — nothing in git changes (schema lives in Supabase). Record the migration SQL in the repo instead:
```powershell
New-Item -ItemType Directory -Force supabase/migrations | Out-Null
# save the SQL above as supabase/migrations/20260925000000_init_argus_schema.sql
git add supabase
git commit -m "chore(db): record initial Supabase schema with RLS"
```

---

### Task 6: Next.js scaffold, theme, Supabase wiring, API client

**Files:**
- Create: `web/` (create-next-app), `web/next.config.ts`, `web/.env.example`, `web/.env.local`, `web/vitest.config.ts`
- Create: `web/src/app/globals.css`, `web/src/app/layout.tsx`, `web/src/proxy.ts`
- Create: `web/src/lib/types.ts`, `web/src/lib/format.ts`, `web/src/lib/stats.ts`, `web/src/lib/api.ts`, `web/src/lib/eicar.ts`, `web/src/lib/supabase/server.ts`
- Create: `web/src/components/brand/logo.tsx`, `web/src/components/app/level-pill.tsx`, `web/src/components/app/page-header.tsx`
- Create: `dev.ps1`
- Test: `web/src/lib/stats.test.ts`, `web/src/lib/eicar.test.ts`

**Interfaces:**
- Consumes: API routes from Tasks 1–4 (and `/phone/normalize`, `/call/turn` added later).
- Produces: types `Signal`, `Verdict`, `ScanRow`, `ScanKind`, `RiskLevel`, `SignalStatus`, `CallTurn`, `CallTurnResponse`; `LEVEL_META`, `STATUS_META`, `KIND_META`, `levelFor(score)`, `timeAgo(iso)`; `summarize(rows, days?, now?) -> DashboardStats`; `api.scan(input, communityReports?)`, `api.scanFile(file)`, `api.normalizePhone(n)`, `api.callTurn(transcript)`, `api.health()`, `ApiOfflineError`; `eicarFile() -> File`; `createClient()` (server Supabase client); `<Logo/>`, `<LevelPill level/>`, `<PageHeader eyebrow title subtitle/>`; CSS utilities `glass`, `text-aurora`, `aurora-bg`, theme colors `risk-*`.

- [ ] **Step 1: Scaffold**

Invoke the `vercel:nextjs`, `vercel:shadcn` and `frontend-design:frontend-design` skills first (read their guidance; apply it to the components below). Then:
```powershell
npx create-next-app@latest web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
cd web
npm i @supabase/supabase-js @supabase/ssr animejs motion lucide-react server-only
npm i -D vitest
npx shadcn@latest init -d
npx shadcn@latest add button input textarea label badge table tooltip sonner chart separator skeleton select
npx next --version
```
Note the Next major version. **If it is 15.x**, name the guard file `src/middleware.ts` and export `middleware` instead of `proxy`; everything else is identical. Check `node_modules/animejs/package.json` is version 4.x (API below is v4: `animate`, `stagger`, `createTimeline`, `ease` param).

- [ ] **Step 2: Write the failing tests**

`web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```
Add `"test": "vitest run"` to `web/package.json` scripts.

`web/src/lib/stats.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { summarize } from "./stats";

const now = new Date("2026-09-25T12:00:00");
const row = (kind: string, score: number, daysAgo: number) => ({
  kind, score, created_at: new Date(now.getTime() - daysAgo * 864e5).toISOString(),
}) as const;

describe("summarize", () => {
  it("counts totals by risk band", () => {
    const s = summarize([row("url", 90, 0), row("text", 65, 1), row("file", 10, 2)], 14, now);
    expect(s).toMatchObject({ total: 3, threats: 2, highRisk: 1, safe: 1 });
  });
  it("builds a zero-filled daily series ending today", () => {
    const s = summarize([row("url", 90, 0), row("url", 5, 0), row("email", 70, 3)], 7, now);
    expect(s.series).toHaveLength(7);
    expect(s.series[6]).toMatchObject({ scans: 2, threats: 1 });
    expect(s.series[3]).toMatchObject({ scans: 1, threats: 1 });
    expect(s.series[0]).toMatchObject({ scans: 0, threats: 0 });
  });
  it("ignores rows older than the window in the series but not totals", () => {
    const s = summarize([row("url", 90, 30)], 14, now);
    expect(s.total).toBe(1);
    expect(s.series.every((p) => p.scans === 0)).toBe(true);
  });
  it("breaks down by kind", () => {
    const s = summarize([row("url", 90, 0), row("url", 5, 0), row("phone", 85, 0)], 14, now);
    expect(s.byKind.find((k) => k.kind === "url")).toMatchObject({ count: 2, threats: 1 });
  });
});
```

`web/src/lib/eicar.test.ts`:
```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eicarText } from "./eicar";

describe("eicar", () => {
  it("rebuilds the exact standard test string", () => {
    expect(createHash("sha256").update(eicarText()).digest("hex"))
      .toBe("275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f");
  });
  it("is not stored contiguously in source", () => {
    const needle = "ELIF-TSET-SURIVITNA-DRADNATS-RACIE".split("").reverse().join("");
    expect(readFileSync(new URL("./eicar.ts", import.meta.url), "utf8")).not.toContain(needle);
  });
});
```

Run: `cd web; npm test` — Expected: FAIL (`Cannot find module './stats'`, `'./eicar'`).

- [ ] **Step 3: Implement lib files**

`web/src/lib/types.ts`:
```ts
export type SignalStatus = "clean" | "suspicious" | "malicious" | "unknown" | "unavailable" | "error";
export type ScanKind = "url" | "file" | "email" | "phone" | "text" | "call";
export type RiskLevel = "SAFE" | "LOW/MODERATE" | "SUSPICIOUS" | "HIGH RISK" | "UNVERIFIED";

export interface Signal {
  source: string;
  status: SignalStatus;
  score: number;
  weight: number;
  summary: string;
  authoritative: boolean;
  evidence: Record<string, unknown>;
}

export interface Verdict {
  kind: ScanKind;
  subject: string;
  score: number;
  level: RiskLevel;
  threat_type: string;
  signals: Signal[];
  recommendation: string;
  scanned_at: string;
}

export interface ScanRow {
  id: string;
  kind: ScanKind;
  input_preview: string;
  score: number;
  level: RiskLevel;
  threat_type: string;
  verdict: Verdict;
  created_at: string;
}

export interface CallTurn { role: "caller" | "assistant"; text: string }
export interface CallTurnResponse { reply: string; mode: string; analysis: Verdict }
```

`web/src/lib/format.ts`:
```ts
import { FileText, Globe, Mail, MessageSquareText, Phone, PhoneCall, type LucideIcon } from "lucide-react";
import type { RiskLevel, ScanKind, SignalStatus } from "./types";

export const LEVEL_META: Record<RiskLevel, { label: string; color: string }> = {
  SAFE: { label: "Safe", color: "var(--risk-safe)" },
  "LOW/MODERATE": { label: "Low risk", color: "var(--risk-low)" },
  SUSPICIOUS: { label: "Suspicious", color: "var(--risk-sus)" },
  "HIGH RISK": { label: "High risk", color: "var(--risk-high)" },
  UNVERIFIED: { label: "Unverified", color: "var(--risk-unknown)" },
};

export const STATUS_META: Record<SignalStatus, { label: string; color: string }> = {
  malicious: { label: "Malicious", color: "var(--risk-high)" },
  suspicious: { label: "Suspicious", color: "var(--risk-sus)" },
  clean: { label: "Clean", color: "var(--risk-safe)" },
  unknown: { label: "No record", color: "var(--risk-unknown)" },
  unavailable: { label: "Not configured", color: "var(--risk-unknown)" },
  error: { label: "Unreachable", color: "var(--risk-unknown)" },
};

export const STATUS_ORDER: SignalStatus[] = ["malicious", "suspicious", "clean", "unknown", "unavailable", "error"];

export const KIND_META: Record<ScanKind, { label: string; icon: LucideIcon }> = {
  url: { label: "Link", icon: Globe },
  file: { label: "File", icon: FileText },
  email: { label: "Email", icon: Mail },
  phone: { label: "Phone", icon: Phone },
  text: { label: "Message", icon: MessageSquareText },
  call: { label: "Call", icon: PhoneCall },
};

export function levelFor(score: number): RiskLevel {
  if (score >= 80) return "HIGH RISK";
  if (score >= 60) return "SUSPICIOUS";
  if (score >= 30) return "LOW/MODERATE";
  return "SAFE";
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(1, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
```

`web/src/lib/stats.ts`:
```ts
import type { ScanKind } from "./types";

type Row = { kind: ScanKind | string; score: number; created_at: string };

export interface DashboardStats {
  total: number;
  threats: number;
  highRisk: number;
  safe: number;
  series: { key: string; label: string; scans: number; threats: number }[];
  byKind: { kind: ScanKind; count: number; threats: number }[];
}

const KINDS: ScanKind[] = ["url", "file", "email", "phone", "text", "call"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function summarize(rows: Row[], days = 14, now = new Date()): DashboardStats {
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1 - i));
    return { key: dayKey(d), label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), scans: 0, threats: 0 };
  });
  const index = new Map(series.map((p, i) => [p.key, i]));
  const byKind = new Map(KINDS.map((k) => [k, { kind: k, count: 0, threats: 0 }]));

  for (const r of rows) {
    const threat = r.score >= 60;
    const i = index.get(dayKey(new Date(r.created_at)));
    if (i !== undefined) {
      series[i].scans += 1;
      if (threat) series[i].threats += 1;
    }
    const k = byKind.get(r.kind as ScanKind);
    if (k) {
      k.count += 1;
      if (threat) k.threats += 1;
    }
  }

  return {
    total: rows.length,
    threats: rows.filter((r) => r.score >= 60).length,
    highRisk: rows.filter((r) => r.score >= 80).length,
    safe: rows.filter((r) => r.score < 30).length,
    series,
    byKind: [...byKind.values()],
  };
}
```

`web/src/lib/eicar.ts`:
```ts
// The EICAR antivirus test string, stored reversed so antivirus software doesn't quarantine
// this file or the built bundle. It is harmless by design: every antivirus flags it on purpose.
const REVERSED = "*H+H$!ELIF-TSET-SURIVITNA-DRADNATS-RACIE$}7)CC7)^P(45XZP\\4[PA@%P!O5X";

export function eicarText(): string {
  return REVERSED.split("").reverse().join("");
}

export function eicarFile(): File {
  return new File([eicarText()], "eicar-test-file.com", { type: "application/octet-stream" });
}
```

`web/src/lib/api.ts`:
```ts
import "server-only";
import type { CallTurn, CallTurnResponse, Verdict } from "./types";

const BASE = process.env.ARGUS_API_URL ?? "http://127.0.0.1:8000";

export class ApiOfflineError extends Error {}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 25000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ApiOfflineError("The ARGUS scanning engine is offline. Start it with dev.ps1.");
  }
  if (!res.ok) {
    const body = await res.text();
    let detail = body;
    try { detail = JSON.parse(body).detail ?? body; } catch { /* plain text */ }
    throw new Error(`Scan failed (${res.status}): ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  scan: (input: string, communityReports = 0) =>
    call<Verdict>("/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input, community_reports: communityReports }),
    }),
  scanFile: (file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return call<Verdict>("/scan/file", { method: "POST", body: form });
  },
  normalizePhone: (number: string) =>
    call<{ e164: string | null }>(`/phone/normalize?number=${encodeURIComponent(number)}`, undefined, 5000),
  callTurn: (transcript: CallTurn[]) =>
    call<CallTurnResponse>("/call/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript }),
    }),
  health: () => call<{ status: string; sources: Record<string, boolean> }>("/health", undefined, 3000),
};
```

`web/src/lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component: the proxy refreshes sessions, so this is safe to ignore.
          }
        },
      },
    },
  );
}
```

Run: `cd web; npm test` — Expected: PASS (6 tests).

- [ ] **Step 4: Theme, layout, proxy, config**

`web/next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
```

`web/.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
ARGUS_API_URL=http://127.0.0.1:8000
```
Write `web/.env.local` with the real values from Task 5 Step 4.

`web/src/app/globals.css` (replace the file shadcn generated, keeping its token names so shadcn components work):
```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-serif: var(--font-instrument-serif);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-risk-safe: var(--risk-safe);
  --color-risk-low: var(--risk-low);
  --color-risk-sus: var(--risk-sus);
  --color-risk-high: var(--risk-high);
  --color-risk-unknown: var(--risk-unknown);
  --color-aurora-1: var(--aurora-1);
  --color-aurora-2: var(--aurora-2);
  --color-aurora-3: var(--aurora-3);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root,
.dark {
  --radius: 0.875rem;
  --background: #070b1a;
  --foreground: #e8ecf8;
  --card: #0c1228;
  --card-foreground: #e8ecf8;
  --popover: #0d1330;
  --popover-foreground: #e8ecf8;
  --primary: #9b8cff;
  --primary-foreground: #0a0e22;
  --secondary: #151c3b;
  --secondary-foreground: #e8ecf8;
  --muted: #11173a;
  --muted-foreground: #8e97b8;
  --accent: #1a2250;
  --accent-foreground: #e8ecf8;
  --destructive: #ff5d6c;
  --border: rgb(148 163 255 / 0.12);
  --input: rgb(148 163 255 / 0.18);
  --ring: #9b8cff;
  --chart-1: #9b8cff;
  --chart-2: #ff8a7a;
  --chart-3: #5ec8e5;
  --chart-4: #f5c451;
  --chart-5: #c38bff;
  --aurora-1: #6d6bff;
  --aurora-2: #a66bff;
  --aurora-3: #ff8a7a;
  --risk-safe: #5ed3b0;
  --risk-low: #f5c451;
  --risk-sus: #ff9f4d;
  --risk-high: #ff5d6c;
  --risk-unknown: #8e97b8;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html {
    color-scheme: dark;
  }
  body {
    @apply bg-background text-foreground;
  }
  ::selection {
    background: rgb(155 140 255 / 0.35);
  }
}

@utility glass {
  background: linear-gradient(180deg, rgb(255 255 255 / 0.055), rgb(255 255 255 / 0.018));
  border: 1px solid var(--border);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 20px 60px -30px rgb(0 0 0 / 0.8);
  backdrop-filter: blur(18px) saturate(140%);
}

@utility text-aurora {
  background: linear-gradient(100deg, var(--aurora-1), var(--aurora-2) 45%, var(--aurora-3));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

@utility eyebrow {
  font-family: var(--font-geist-mono);
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}

.aurora-bg {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(60rem 40rem at 85% -10%, rgb(109 107 255 / 0.22), transparent 60%),
    radial-gradient(50rem 36rem at -10% 20%, rgb(166 107 255 / 0.16), transparent 60%),
    radial-gradient(40rem 30rem at 60% 110%, rgb(255 138 122 / 0.12), transparent 60%),
    var(--background);
}

.aurora-bg::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: linear-gradient(to bottom, black, transparent 70%);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

`web/src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Argus: the watcher that never sleeps",
  description: "Scan links, files, emails, texts and phone numbers against real threat intelligence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} font-sans antialiased`}>
        <div className="aurora-bg" aria-hidden />
        {children}
        <Toaster theme="dark" position="top-center" richColors />
      </body>
    </html>
  );
}
```
If the generated `components/ui/sonner.tsx` imports `next-themes`, replace its `useTheme()` usage with the `theme` prop passed in (the app is dark-only) and remove the `next-themes` import.

`web/src/proxy.ts` (Next 16; for Next 15 see Step 1 note):
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const APP_ROUTES = ["/dashboard", "/scan", "/history", "/call-assistant", "/family"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isApp = APP_ROUTES.some((p) => path === p || path.startsWith(p + "/"));

  if (!user && isApp) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

`web/src/components/brand/logo.tsx`:
```tsx
export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="argus-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--aurora-1)" />
          <stop offset="55%" stopColor="var(--aurora-2)" />
          <stop offset="100%" stopColor="var(--aurora-3)" />
        </linearGradient>
      </defs>
      <path d="M2 16C6 9 10.5 6 16 6s10 3 14 10c-4 7-8.5 10-14 10S6 23 2 16Z" fill="none" stroke="url(#argus-logo)" strokeWidth="2" />
      <circle cx="16" cy="16" r="5.5" fill="url(#argus-logo)" />
      <circle cx="16" cy="16" r="2.2" fill="var(--background)" />
    </svg>
  );
}
```

`web/src/components/app/level-pill.tsx`:
```tsx
import { LEVEL_META } from "@/lib/format";
import type { RiskLevel } from "@/lib/types";

export function LevelPill({ level, score }: { level: RiskLevel; score?: number }) {
  const { label, color } = LEVEL_META[level] ?? LEVEL_META.UNVERIFIED;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {label}
      {score !== undefined && <span className="font-mono opacity-70">{score}</span>}
    </span>
  );
}
```

`web/src/components/app/page-header.tsx`:
```tsx
export function PageHeader({ eyebrow, title, subtitle, children }: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}
```

`dev.ps1` (repo root):
```powershell
# Starts the ARGUS scanning API and the web app in two windows.
$root = $PSScriptRoot
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\api'; .\.venv\Scripts\python -m uvicorn argus_api.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\web'; npm run dev"
Write-Host "API  -> http://127.0.0.1:8000/health"
Write-Host "Web  -> http://localhost:3000"
```

- [ ] **Step 5: Verify**

Run: `cd web; npm test; npx tsc --noEmit; npm run build`
Expected: tests pass, no type errors, build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add web dev.ps1
git commit -m "feat(web): scaffold Next.js app with Midnight Aurora theme, Supabase and API clients"
```

---

### Task 7: Auth pages and app shell

**Files:**
- Create: `web/src/app/(auth)/layout.tsx`, `web/src/app/(auth)/actions.ts`, `web/src/app/(auth)/login/page.tsx`, `web/src/app/(auth)/signup/page.tsx`
- Create: `web/src/components/auth/auth-form.tsx`
- Create: `web/src/app/(app)/layout.tsx`, `web/src/components/app/sidebar.tsx`
- Create (temporary): `web/src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `createClient()`, `<Logo/>`.
- Produces: server actions `signIn(state, formData)`, `signUp(state, formData)`, `signOut()`, type `AuthState`; `(app)` layout that guarantees a user; `<Sidebar name email/>` and `<MobileNav/>`.

- [ ] **Step 1: Implement**

`web/src/app/(auth)/actions.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string } | undefined;

function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !email) return { error: "Enter your name and email." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
  if (error) return { error: error.message };
  if (!data.session) return { error: "Check your inbox to confirm your email, then sign in." };
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
```

`web/src/components/auth/auth-form.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "@/app/(auth)/actions";

type Props = {
  mode: "login" | "signup";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
};

export function AuthForm({ mode, action, next }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const signup = mode === "signup";
  return (
    <form action={formAction} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      {signup && (
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required autoComplete="name" placeholder="Priya Shah" />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={signup ? 8 : undefined}
          autoComplete={signup ? "new-password" : "current-password"}
        />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg border border-risk-high/30 bg-risk-high/10 px-3 py-2 text-sm text-risk-high">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "One moment…" : signup ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {signup ? "Already have an account? " : "New to Argus? "}
        <Link href={signup ? "/login" : "/signup"} className="text-foreground underline-offset-4 hover:underline">
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
```

`web/src/app/(auth)/layout.tsx`:
```tsx
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Logo className="size-8" />
          <span className="font-serif text-3xl">Argus</span>
        </Link>
        <div className="glass rounded-3xl p-8 sm:p-10">{children}</div>
      </div>
    </div>
  );
}
```

`web/src/app/(auth)/login/page.tsx`:
```tsx
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="font-serif text-4xl">Welcome back</h1>
      <p className="mt-2 text-muted-foreground">Sign in to your Argus dashboard.</p>
      <div className="mt-8">
        <AuthForm mode="login" action={signIn} next={next} />
      </div>
    </>
  );
}
```

`web/src/app/(auth)/signup/page.tsx`:
```tsx
import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "../actions";

export default function SignupPage() {
  return (
    <>
      <h1 className="font-serif text-4xl">Create your watch</h1>
      <p className="mt-2 text-muted-foreground">Free, private, and ready in seconds.</p>
      <div className="mt-8">
        <AuthForm mode="signup" action={signUp} />
      </div>
    </>
  );
}
```

`web/src/components/app/sidebar.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LayoutDashboard, LogOut, PhoneCall, ScanSearch, Users } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/scan", label: "Scan", icon: ScanSearch },
  { href: "/history", label: "History", icon: History },
  { href: "/call-assistant", label: "Call Assistant", icon: PhoneCall },
  { href: "/family", label: "Family", icon: Users },
];

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(href + "/");
}

export function Sidebar({ name, email }: { name: string; email: string }) {
  const isActive = useActive();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border/60 bg-background/40 px-4 py-6 backdrop-blur-xl md:flex">
      <Link href="/" className="flex items-center gap-2 px-2">
        <Logo />
        <span className="font-serif text-2xl">Argus</span>
      </Link>
      <nav className="mt-10 flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground",
              isActive(href) && "bg-white/[0.07] text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto rounded-2xl border border-border/60 p-3">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
        <form action={signOut}>
          <button className="mt-3 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const isActive = useActive();
  return (
    <nav className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-border/60 bg-background/70 px-3 py-2 backdrop-blur-xl md:hidden">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground", isActive(href) && "bg-white/[0.07] text-foreground")}
        >
          <Icon className="size-3.5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
```

`web/src/app/(app)/layout.tsx`:
```tsx
import { redirect } from "next/navigation";
import { MobileNav, Sidebar } from "@/components/app/sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "You";
  return (
    <div className="flex min-h-dvh">
      <Sidebar name={name} email={user.email ?? ""} />
      <div className="min-w-0 flex-1">
        <MobileNav />
        <main className="mx-auto max-w-6xl px-5 py-8 lg:px-10 lg:py-12">{children}</main>
      </div>
    </div>
  );
}
```

Temporary `web/src/app/(app)/dashboard/page.tsx` (replaced in Task 10):
```tsx
import { PageHeader } from "@/components/app/page-header";

export default function DashboardPage() {
  return <PageHeader eyebrow="Overview" title="Your watch" subtitle="Dashboard coming together…" />;
}
```

- [ ] **Step 2: Verify**

Run: `cd web; npx tsc --noEmit; npm run build` — Expected: success.
Manual (start both servers with `./dev.ps1`): visit `/dashboard` signed out → redirected to `/login?next=/dashboard`. Sign up a test user → lands on `/dashboard` with name in sidebar. Sign out → back to `/`. Visit `/login` while signed in → redirected to `/dashboard`.

- [ ] **Step 3: Commit**

```powershell
git add web
git commit -m "feat(web): Supabase auth pages, route guard and app shell"
```

---

### Task 8: The Iris and the landing page

**Files:**
- Create: `web/src/components/iris/iris.tsx`
- Create: `web/src/components/landing/{nav,hero,sources,channels,how-it-works,roadmap,cta,footer,reveal}.tsx`
- Modify: `web/src/app/page.tsx` (replace boilerplate)

**Interfaces:**
- Consumes: `<Logo/>`, `Button`, `KIND_META`, `LevelPill`.
- Produces: `<Iris state?: "idle"|"scanning"|"safe"|"danger" size?: number className?/>` (used again on the scan page); `<Reveal delay?>` wrapper.

- [ ] **Step 1: Implement the Iris**

`web/src/components/iris/iris.tsx`:
```tsx
"use client";

import { useEffect, useId, useRef } from "react";
import { animate, createTimeline, stagger } from "animejs";

export type IrisState = "idle" | "scanning" | "safe" | "danger";

const RINGS = [
  { r: 70, n: 28, dot: 2.8 },
  { r: 100, n: 40, dot: 2.4 },
  { r: 130, n: 52, dot: 2.1 },
  { r: 160, n: 64, dot: 1.8 },
  { r: 188, n: 76, dot: 1.5 },
];

const PALETTE: Record<IrisState, [string, string, string]> = {
  idle: ["#6d6bff", "#a66bff", "#ff8a7a"],
  scanning: ["#8f8bff", "#c38bff", "#ffb199"],
  safe: ["#5ed3b0", "#6d9bff", "#5ed3b0"],
  danger: ["#ff5d6c", "#ff8a7a", "#ff5d6c"],
};

function point(r: number, i: number, n: number) {
  const a = (i / n) * Math.PI * 2;
  return { cx: (200 + r * Math.cos(a)).toFixed(2), cy: (200 + r * Math.sin(a)).toFixed(2) };
}

export function Iris({ state = "idle", size = 420, className }: { state?: IrisState; size?: number; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const [c1, c2, c3] = PALETTE[state];

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const fast = state === "scanning";
    const rings = Array.from(svg.querySelectorAll<SVGGElement>("[data-ring]")).map((g, i) =>
      animate(g, { rotate: i % 2 ? -360 : 360, duration: (fast ? 9000 : 42000) + i * (fast ? 1500 : 9000), loop: true, ease: "linear" }),
    );
    const dots = animate(svg.querySelectorAll("[data-dot]"), {
      opacity: [0.25, 1],
      duration: fast ? 600 : 2200,
      delay: stagger(fast ? 6 : 24, { from: "center" }),
      loop: true,
      alternate: true,
      ease: "inOutSine",
    });
    const pupil = svg.querySelector<SVGGElement>("[data-pupil]")!;
    const gaze =
      state === "idle"
        ? createTimeline({ loop: true })
            .add(pupil, { x: 14, y: -9, duration: 1300, ease: "inOutQuad" }, 900)
            .add(pupil, { x: -12, y: 7, duration: 1500, ease: "inOutQuad" }, "+=1700")
            .add(pupil, { x: 0, y: 0, duration: 1100, ease: "inOutQuad" }, "+=1400")
        : animate(pupil, {
            x: 0,
            y: 0,
            scale: fast ? [1, 0.72] : 1.12,
            duration: fast ? 700 : 900,
            ease: fast ? "inOutSine" : "outBack",
            loop: fast,
            alternate: fast,
          });
    return () => {
      rings.forEach((a) => a.revert());
      dots.revert();
      gaze.revert();
    };
  }, [state]);

  return (
    <svg ref={svgRef} viewBox="0 0 400 400" width={size} height={size} className={className} role="img" aria-label="Argus iris">
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0%" stopColor={c2} stopOpacity="0.55" style={{ transition: "stop-color 600ms" }} />
          <stop offset="100%" stopColor={c1} stopOpacity="0" style={{ transition: "stop-color 600ms" }} />
        </radialGradient>
        <linearGradient id={`${id}-dots`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c1} style={{ transition: "stop-color 600ms" }} />
          <stop offset="50%" stopColor={c2} style={{ transition: "stop-color 600ms" }} />
          <stop offset="100%" stopColor={c3} style={{ transition: "stop-color 600ms" }} />
        </linearGradient>
        <radialGradient id={`${id}-pupil`} cx="45%" cy="40%">
          <stop offset="0%" stopColor={c3} style={{ transition: "stop-color 600ms" }} />
          <stop offset="60%" stopColor={c2} style={{ transition: "stop-color 600ms" }} />
          <stop offset="100%" stopColor={c1} style={{ transition: "stop-color 600ms" }} />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="198" fill={`url(#${id}-glow)`} />
      {RINGS.map((ring, i) => (
        <g key={ring.r} data-ring style={{ transformOrigin: "200px 200px" }}>
          <circle cx="200" cy="200" r={ring.r} fill="none" stroke={`url(#${id}-dots)`} strokeOpacity={0.08} />
          {Array.from({ length: ring.n }, (_, j) => (
            <circle key={j} data-dot {...point(ring.r, j, ring.n)} r={ring.dot} fill={`url(#${id}-dots)`} opacity={0.6} />
          ))}
          {i === 2 && <circle cx="200" cy="200" r={ring.r + 6} fill="none" stroke={c2} strokeOpacity={0.25} strokeDasharray="2 10" />}
        </g>
      ))}
      <g data-pupil style={{ transformOrigin: "200px 200px" }}>
        <circle cx="200" cy="200" r="46" fill={`url(#${id}-pupil)`} />
        <circle cx="200" cy="200" r="19" fill="#070b1a" />
        <circle cx="188" cy="187" r="5" fill="white" opacity="0.85" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: Implement landing sections**

`web/src/components/landing/reveal.tsx`:
```tsx
"use client";

import { motion } from "motion/react";

export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

`web/src/components/landing/nav.tsx`:
```tsx
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export function Nav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-serif text-2xl">Argus</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#channels" className="hover:text-foreground">Protection</a>
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#roadmap" className="hover:text-foreground">Roadmap</a>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Button asChild><Link href="/dashboard">Open dashboard</Link></Button>
          ) : (
            <>
              <Button asChild variant="ghost"><Link href="/login">Sign in</Link></Button>
              <Button asChild><Link href="/signup">Get started</Link></Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
```

`web/src/components/landing/hero.tsx`:
```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Iris } from "@/components/iris/iris";
import { Button } from "@/components/ui/button";

const STATS = [
  { value: "70+", label: "antivirus engines via VirusTotal" },
  { value: "5", label: "channels in one place" },
  { value: "1", label: "plain-language verdict" },
];

export function Hero() {
  return (
    <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-24">
      <div>
        <p className="eyebrow">Unified threat intelligence</p>
        <h1 className="mt-5 font-serif text-6xl leading-[0.95] tracking-tight sm:text-7xl xl:text-8xl">
          The watcher
          <br />
          that <em className="text-aurora pr-2">never</em> sleeps.
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Argus checks links, files, emails, texts and phone numbers against VirusTotal, URLhaus, Google Safe Browsing
          and its own AI, then tells you in plain words whether it&apos;s safe.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
            <Link href="/signup">
              Start protecting <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost" className="h-12 rounded-full px-7 text-base">
            <a href="#how">See how it works</a>
          </Button>
        </div>
        <dl className="mt-14 grid max-w-lg grid-cols-3 gap-6 border-t border-border/60 pt-8">
          {STATS.map((s) => (
            <div key={s.label}>
              <dt className="font-serif text-4xl">{s.value}</dt>
              <dd className="mt-1 text-xs leading-snug text-muted-foreground">{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="relative mx-auto w-full max-w-[560px]">
        <div className="absolute inset-10 rounded-full bg-aurora-2/20 blur-3xl" aria-hidden />
        <Iris size={560} className="relative h-auto w-full" />
      </div>
    </section>
  );
}
```

`web/src/components/landing/sources.tsx`:
```tsx
const SOURCES = ["VirusTotal", "URLhaus", "MalwareBazaar", "Google Safe Browsing", "RDAP", "ARGUS ML"];

export function Sources() {
  return (
    <section className="border-y border-border/50 bg-white/[0.015]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 py-7">
        <span className="eyebrow">Verdicts backed by</span>
        {SOURCES.map((s) => (
          <span key={s} className="font-mono text-sm tracking-wide text-foreground/70">{s}</span>
        ))}
      </div>
    </section>
  );
}
```

`web/src/components/landing/channels.tsx`:
```tsx
import { FileText, Globe, Mail, MessageSquareText, Phone } from "lucide-react";
import { Reveal } from "./reveal";

const CHANNELS = [
  { icon: Globe, title: "Links", body: "Blocklists, Google's phishing database, 70+ engines and how old the domain really is.", tags: ["URLhaus", "Safe Browsing", "VirusTotal", "RDAP"] },
  { icon: FileText, title: "Files", body: "We fingerprint the file and check it against known malware, without it ever leaving the server.", tags: ["VirusTotal", "MalwareBazaar", "Inspection"] },
  { icon: Mail, title: "Emails", body: "Sender authentication, spoofed display names, mismatched reply-to addresses and every link inside.", tags: ["SPF", "DKIM", "DMARC"] },
  { icon: MessageSquareText, title: "Texts", body: "Our AI reads the message the way a scammer wrote it: urgency, secrecy, gift cards, fake arrests.", tags: ["ARGUS ML", "Scam rules"] },
  { icon: Phone, title: "Calls", body: "Is the number real, is it VoIP, is it on a blocklist, and have other Argus users reported it?", tags: ["Validation", "Community"] },
];

export function Channels() {
  return (
    <section id="channels" className="mx-auto max-w-7xl px-6 py-24">
      <Reveal>
        <p className="eyebrow">One watch, every door</p>
        <h2 className="mt-3 max-w-3xl font-serif text-5xl leading-tight tracking-tight">
          Scams arrive through five doors. <span className="text-muted-foreground">Argus guards all of them.</span>
        </h2>
      </Reveal>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {CHANNELS.map(({ icon: Icon, title, body, tags }, i) => (
          <Reveal key={title} delay={i * 0.06} className="glass group rounded-3xl p-6 transition-transform hover:-translate-y-1">
            <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-aurora-1/30 to-aurora-3/20">
              <Icon className="size-5" />
            </div>
            <h3 className="mt-6 font-serif text-3xl">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="rounded-full border border-border/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground/60">{t}</span>
              ))}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
```

`web/src/components/landing/how-it-works.tsx`:
```tsx
import { LevelPill } from "@/components/app/level-pill";
import { Reveal } from "./reveal";

const STEPS = [
  { n: "01", title: "Paste or drop anything", body: "A link, an email, a text, a phone number or a file. Argus figures out what it is." },
  { n: "02", title: "Six sources, in parallel", body: "Every relevant intelligence source is queried at once. Slow ones never hold up the verdict." },
  { n: "03", title: "One honest verdict", body: "A 0–100 risk score with the evidence behind it, and what to do next, in plain words." },
];

const PREVIEW = [
  { source: "Google Safe Browsing", summary: "Google flags this as phishing", color: "var(--risk-high)" },
  { source: "ARGUS heuristics", summary: "Mentions Paypal but isn't an official domain", color: "var(--risk-sus)" },
  { source: "Domain age (RDAP)", summary: "Domain registered only 3 days ago", color: "var(--risk-sus)" },
  { source: "VirusTotal", summary: "11/94 security vendors flag this link", color: "var(--risk-high)" },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto grid max-w-7xl items-center gap-14 px-6 py-24 lg:grid-cols-2">
      <div>
        <Reveal>
          <p className="eyebrow">How a verdict is made</p>
          <h2 className="mt-3 font-serif text-5xl leading-tight tracking-tight">Evidence, not guesswork.</h2>
        </Reveal>
        <ol className="mt-10 space-y-8">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <li className="flex gap-5">
                <span className="font-mono text-sm text-aurora-2">{s.n}</span>
                <div>
                  <h3 className="text-lg font-medium">{s.title}</h3>
                  <p className="mt-1 text-muted-foreground">{s.body}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
      <Reveal delay={0.1}>
        <div className="glass rounded-3xl p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Example verdict</p>
              <p className="mt-2 break-all font-mono text-sm text-foreground/80">http://paypal-security-alert.net/verify</p>
            </div>
            <div className="text-right">
              <p className="font-serif text-6xl leading-none text-risk-high">92</p>
              <div className="mt-2"><LevelPill level="HIGH RISK" /></div>
            </div>
          </div>
          <ul className="mt-8 space-y-2.5">
            {PREVIEW.map((p) => (
              <li key={p.source} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-white/[0.02] px-4 py-3">
                <span className="size-2 shrink-0 rounded-full" style={{ background: p.color, boxShadow: `0 0 12px ${p.color}` }} />
                <span className="w-44 shrink-0 text-sm font-medium">{p.source}</span>
                <span className="truncate text-sm text-muted-foreground">{p.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
```

`web/src/components/landing/roadmap.tsx`:
```tsx
import { Chrome, Inbox, Smartphone, BellRing } from "lucide-react";
import { Reveal } from "./reveal";

const ITEMS = [
  { icon: Smartphone, title: "Live call screening", body: "An Android app that screens incoming calls in real time using the network's caller verification." },
  { icon: Inbox, title: "Gmail & Outlook", body: "Connect your inbox and let Argus flag phishing before you open it." },
  { icon: Chrome, title: "Browser extension", body: "A warning before a malicious page ever loads." },
  { icon: BellRing, title: "Real family alerts", body: "Your trusted contacts get a text the moment something high-risk reaches you." },
];

export function Roadmap() {
  return (
    <section id="roadmap" className="mx-auto max-w-7xl px-6 py-24">
      <Reveal>
        <p className="eyebrow">What&apos;s next</p>
        <h2 className="mt-3 font-serif text-5xl tracking-tight">The watch keeps growing.</h2>
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map(({ icon: Icon, title, body }, i) => (
          <Reveal key={title} delay={i * 0.06} className="rounded-3xl border border-dashed border-border p-6">
            <div className="flex items-center justify-between">
              <Icon className="size-5 text-muted-foreground" />
              <span className="rounded-full bg-aurora-2/15 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-aurora-2">Coming soon</span>
            </div>
            <h3 className="mt-6 text-lg font-medium">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
```

`web/src/components/landing/cta.tsx`:
```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function Cta() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-24">
      <Reveal className="glass relative overflow-hidden rounded-[2rem] px-8 py-16 text-center sm:px-16">
        <div className="absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-aurora-1/25 blur-3xl" aria-hidden />
        <h2 className="relative font-serif text-5xl tracking-tight sm:text-6xl">
          Something feel <em className="text-aurora pr-1">off?</em>
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-muted-foreground">Paste it into Argus. You&apos;ll know in seconds.</p>
        <Button asChild size="lg" className="relative mt-9 h-12 rounded-full px-8 text-base">
          <Link href="/signup">Create your free account</Link>
        </Button>
      </Reveal>
    </section>
  );
}
```

`web/src/components/landing/footer.tsx`:
```tsx
import { Logo } from "@/components/brand/logo";

export function Footer() {
  return (
    <footer className="border-t border-border/50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Logo className="size-5" />
          <span className="font-serif text-lg text-foreground">Argus</span>
          <span>· Unified cybersecurity</span>
        </div>
        <p>Threat data from VirusTotal, abuse.ch, Google Safe Browsing and RDAP.</p>
      </div>
    </footer>
  );
}
```

`web/src/app/page.tsx`:
```tsx
import { Channels } from "@/components/landing/channels";
import { Cta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Nav } from "@/components/landing/nav";
import { Roadmap } from "@/components/landing/roadmap";
import { Sources } from "@/components/landing/sources";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <>
      <Nav signedIn={!!user} />
      <main>
        <Hero />
        <Sources />
        <Channels />
        <HowItWorks />
        <Roadmap />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `cd web; npx tsc --noEmit; npm run build` — Expected: success.
Use the `run` skill to screenshot `/` at 1440px and 390px wide. Check: iris animates (rings rotate opposite ways, dots shimmer, pupil glances around), no hydration warnings in the console, no horizontal scroll on mobile, no green anywhere except none. Fix anything off.

- [ ] **Step 4: Commit**

```powershell
git add web
git commit -m "feat(web): animated Argus iris and landing page"
```

---

### Task 9: Scan Anything + verdict view

**Files:**
- Create: `web/src/app/(app)/scan/actions.ts`, `web/src/app/(app)/scan/page.tsx`, `web/src/app/(app)/scan/[id]/page.tsx`
- Create: `web/src/components/app/{scan-console,verdict-view,score-dial,signal-card}.tsx`

**Interfaces:**
- Consumes: `api.scan`, `api.scanFile`, `ApiOfflineError`, `createClient`, `eicarFile()`, `<Iris/>`, `LEVEL_META`, `STATUS_META`, `STATUS_ORDER`, `KIND_META`.
- Produces: server action `runScan(formData) -> Promise<ScanResult>` where `ScanResult = { ok: true; id: string; verdict: Verdict } | { ok: false; error: string }`; `<VerdictView verdict actions?: React.ReactNode/>`; `<ScoreDial score color/>`; `<SignalCard signal/>`; `MAX_UPLOAD_BYTES = 8 * 1024 * 1024`.

- [ ] **Step 1: Implement the action**

`web/src/app/(app)/scan/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { Verdict } from "@/lib/types";

export type ScanResult = { ok: true; id: string; verdict: Verdict } | { ok: false; error: string };

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function runScan(formData: FormData): Promise<ScanResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };

  const file = formData.get("file");
  const input = String(formData.get("input") ?? "").trim();

  try {
    let verdict: Verdict;
    let preview: string;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Files up to 8 MB can be scanned in the web app." };
      verdict = await api.scanFile(file);
      preview = file.name;
    } else if (input) {
      verdict = await api.scan(input);
      preview = input;
    } else {
      return { ok: false, error: "Paste something or drop a file to scan." };
    }

    const { data, error } = await supabase
      .from("scans")
      .insert({
        kind: verdict.kind,
        input_preview: preview.slice(0, 200),
        score: verdict.score,
        level: verdict.level,
        threat_type: verdict.threat_type,
        verdict,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Scanned, but couldn't save the result: ${error.message}` };

    revalidatePath("/dashboard");
    revalidatePath("/history");
    return { ok: true, id: data.id, verdict };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Scan failed." };
  }
}
```

- [ ] **Step 2: Implement verdict components**

`web/src/components/app/score-dial.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";

const R = 88;
const C = 2 * Math.PI * R;

export function ScoreDial({ score, color }: { score: number; color: string }) {
  const numberRef = useRef<HTMLSpanElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const counter = { v: 0 };
    const count = animate(counter, {
      v: score,
      duration: 1400,
      ease: "outExpo",
      onUpdate: () => {
        if (numberRef.current) numberRef.current.textContent = String(Math.round(counter.v));
      },
    });
    const arc = arcRef.current
      ? animate(arcRef.current, { strokeDashoffset: [C, C * (1 - score / 100)], duration: 1400, ease: "outExpo" })
      : null;
    return () => {
      count.pause();
      arc?.pause();
    };
  }, [score]);

  return (
    <div className="relative grid size-56 place-items-center">
      <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90">
        <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="10" />
        <circle
          ref={arcRef}
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - score / 100)}
          style={{ filter: `drop-shadow(0 0 10px ${color})` }}
        />
      </svg>
      <div className="text-center">
        <span ref={numberRef} className="font-serif text-7xl tabular-nums leading-none" style={{ color }}>
          {score}
        </span>
        <p className="eyebrow mt-1">risk / 100</p>
      </div>
    </div>
  );
}
```

`web/src/components/app/signal-card.tsx`:
```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { STATUS_META } from "@/lib/format";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

function EvidenceList({ evidence }: { evidence: Record<string, unknown> }) {
  const items: React.ReactNode[] = [];
  const reasons = evidence.reasons as string[] | undefined;
  const matches = evidence.matches as Record<string, unknown>[] | undefined;
  const nested = evidence.signals as Signal[] | undefined;

  if (reasons?.length) items.push(...reasons.map((r) => <li key={r}>{r}</li>));
  if (matches?.length)
    items.push(
      ...matches.map((m, i) => (
        <li key={`m${i}`}>{String(m.why ?? m.notes ?? m.indicator ?? JSON.stringify(m))}{m.phrase ? <span className="font-mono text-foreground/60"> “{String(m.phrase)}”</span> : null}</li>
      )),
    );
  if (nested?.length)
    items.push(
      ...nested.map((s) => (
        <li key={s.source}>
          <span style={{ color: STATUS_META[s.status].color }}>{s.source}:</span> {s.summary}
        </li>
      )),
    );
  for (const key of ["sha256", "domain", "registered", "carrier", "line_type", "country", "e164", "label"]) {
    if (evidence[key] != null) items.push(<li key={key}><span className="text-foreground/60">{key.replace("_", " ")}:</span> <span className="break-all font-mono">{String(evidence[key])}</span></li>);
  }
  if (!items.length) return null;
  return <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">{items}</ul>;
}

export function SignalCard({ signal }: { signal: Signal }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[signal.status];
  const muted = ["unknown", "unavailable", "error"].includes(signal.status);
  const hasDetails = Object.keys(signal.evidence).some((k) => k !== "threat_type");
  return (
    <div data-signal className={cn("glass rounded-2xl p-4 opacity-0", muted && "bg-none")}>
      <button type="button" onClick={() => hasDetails && setOpen((o) => !o)} className="flex w-full items-start gap-3 text-left">
        <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: meta.color, boxShadow: muted ? "none" : `0 0 12px ${meta.color}` }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn("truncate text-sm font-medium", muted && "text-muted-foreground")}>{signal.source}</p>
            {signal.authoritative && signal.status === "malicious" && <ShieldCheck className="size-3.5 text-risk-high" aria-label="Authoritative source" />}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{signal.summary}</p>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider" style={{ color: meta.color, backgroundColor: `color-mix(in oklab, ${meta.color} 12%, transparent)` }}>
          {meta.label}
        </span>
        {hasDetails && <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />}
      </button>
      {open && <EvidenceList evidence={signal.evidence} />}
    </div>
  );
}
```

`web/src/components/app/verdict-view.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import { KIND_META, LEVEL_META, STATUS_ORDER } from "@/lib/format";
import type { Verdict } from "@/lib/types";
import { ScoreDial } from "./score-dial";
import { SignalCard } from "./signal-card";

export function VerdictView({ verdict, actions }: { verdict: Verdict; actions?: React.ReactNode }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const meta = LEVEL_META[verdict.level] ?? LEVEL_META.UNVERIFIED;
  const Kind = KIND_META[verdict.kind];
  const signals = [...verdict.signals].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const answered = signals.filter((s) => !["unavailable", "error"].includes(s.status)).length;

  useEffect(() => {
    if (!gridRef.current) return;
    const a = animate(gridRef.current.querySelectorAll("[data-signal]"), {
      opacity: [0, 1],
      y: [14, 0],
      delay: stagger(70, { start: 250 }),
      duration: 600,
      ease: "outQuart",
    });
    return () => { a.pause(); };
  }, [verdict]);

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="glass relative flex flex-col items-center overflow-hidden rounded-3xl p-8 text-center">
        <div className="absolute -top-20 h-48 w-72 rounded-full blur-3xl" style={{ background: `color-mix(in oklab, ${meta.color} 22%, transparent)` }} aria-hidden />
        <ScoreDial score={verdict.score} color={meta.color} />
        <p className="relative mt-5 font-serif text-5xl" style={{ color: meta.color }}>{meta.label}</p>
        <p className="relative mt-1 text-sm text-muted-foreground">
          {verdict.threat_type !== "None" ? verdict.threat_type : "No threat detected"}
        </p>
        <div className="relative mt-6 flex max-w-full items-center gap-2 rounded-full border border-border/70 px-3 py-1.5">
          <Kind.icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-xs">{verdict.subject}</span>
        </div>
        <p className="relative mt-6 text-sm leading-relaxed text-foreground/85">{verdict.recommendation}</p>
        {actions && <div className="relative mt-6 w-full">{actions}</div>}
      </section>
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-3xl">Evidence</h2>
          <p className="text-sm text-muted-foreground">{answered} of {signals.length} sources answered</p>
        </div>
        <div ref={gridRef} className="grid gap-3 xl:grid-cols-2">
          {signals.map((s) => <SignalCard key={s.source} signal={s} />)}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Implement the scan console and pages**

`web/src/components/app/scan-console.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, ScanSearch, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { runScan, type ScanResult } from "@/app/(app)/scan/actions";
import { Iris } from "@/components/iris/iris";
import { Button } from "@/components/ui/button";
import { eicarFile } from "@/lib/eicar";
import { cn } from "@/lib/utils";
import { VerdictView } from "./verdict-view";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const SAMPLES: { label: string; input?: string; eicar?: boolean }[] = [
  { label: "Phishing link", input: "http://paypal-security-alert.net/verify-account" },
  { label: "Scam text", input: "URGENT: Your bank account has been suspended due to unusual activity. Verify your identity within 24 hours at bit.ly/secure-verify or you will be arrested." },
  {
    label: "Spoofed email",
    input: `From: "PayPal Security" <security@paypa1-security.com>
Reply-To: refunds@secure-helpdesk.xyz
To: you@example.com
Subject: Final notice: account suspended
Authentication-Results: mx.example.com; spf=fail smtp.mailfrom=paypa1-security.com; dkim=none; dmarc=fail

Dear customer, we detected an unusual sign-in. Click here to verify your password immediately: http://paypal-security-alert.net/login`,
  },
  { label: "Blocklisted caller", input: "1-800-555-0142" },
  { label: "EICAR test file", eicar: true },
  { label: "Safe message", input: "Hey are we still on for lunch tomorrow at noon?" },
];

const STAGES = ["Reading the input…", "Querying VirusTotal…", "Checking URLhaus & MalwareBazaar…", "Asking Google Safe Browsing…", "Measuring domain age…", "Running the ARGUS model…", "Weighing the evidence…"];

export function ScanConsole() {
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<Extract<ScanResult, { ok: true }> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!scanning) return;
    setStage(0);
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 900);
    return () => clearInterval(t);
  }, [scanning]);

  function pickFile(f: File | null | undefined) {
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error("Files up to 8 MB can be scanned in the web app.");
      return;
    }
    setFile(f);
    setInput("");
  }

  async function submit(override?: { input?: string; file?: File }) {
    const f = override ? override.file ?? null : file;
    const text = override ? override.input ?? "" : input;
    if (!f && !text.trim()) {
      toast.error("Paste something or drop a file to scan.");
      return;
    }
    const form = new FormData();
    if (f) form.append("file", f);
    else form.append("input", text);
    setScanning(true);
    setResult(null);
    const res = await runScan(form);
    setScanning(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setResult(res);
  }

  function runSample(s: (typeof SAMPLES)[number]) {
    if (s.eicar) {
      const f = eicarFile();
      setFile(f);
      setInput("");
      void submit({ file: f });
    } else {
      setFile(null);
      setInput(s.input!);
      void submit({ input: s.input! });
    }
  }

  const irisState = scanning ? "scanning" : result ? (result.verdict.score >= 60 ? "danger" : result.verdict.score < 30 ? "safe" : "idle") : "idle";

  return (
    <div className="space-y-8">
      <div
        className={cn("glass relative rounded-3xl p-2 transition-shadow", dragging && "ring-2 ring-primary/60")}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
      >
        <div className="flex items-start gap-4 p-4">
          <Iris state={irisState} size={72} className="hidden shrink-0 sm:block" />
          {file ? (
            <div className="flex min-h-24 flex-1 items-center gap-3">
              <FileUp className="size-5 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · only its fingerprint is sent to threat databases</p>
              </div>
              <button type="button" onClick={() => setFile(null)} className="ml-auto rounded-full p-1.5 text-muted-foreground hover:bg-white/5" aria-label="Remove file">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
              placeholder="Paste a link, an email, a text message or a phone number, or drop a file here…"
              rows={4}
              className="min-h-24 flex-1 resize-y bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/70"
            />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <input ref={fileInput} type="file" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
            <Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
              <FileUp className="size-4" /> Upload file
            </Button>
            <span className="hidden text-xs text-muted-foreground sm:inline">Ctrl + Enter to scan</span>
          </div>
          <Button type="button" onClick={() => void submit()} disabled={scanning} className="rounded-full px-6">
            {scanning ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
            {scanning ? "Scanning…" : "Scan"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1 flex items-center gap-1.5"><Sparkles className="size-3" /> Try a sample</span>
        {SAMPLES.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={scanning}
            onClick={() => runSample(s)}
            className="rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}
      </div>

      {scanning && (
        <div className="glass flex flex-col items-center rounded-3xl py-14">
          <Iris state="scanning" size={220} />
          <p className="mt-6 font-mono text-sm text-muted-foreground" aria-live="polite">{STAGES[stage]}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <VerdictView verdict={result.verdict} />
          <p className="text-center text-xs text-muted-foreground">
            Saved to your <Link href={`/scan/${result.id}`} className="underline underline-offset-4">history</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
```

`web/src/app/(app)/scan/page.tsx`:
```tsx
import { PageHeader } from "@/components/app/page-header";
import { ScanConsole } from "@/components/app/scan-console";

export default function ScanPage() {
  return (
    <>
      <PageHeader
        eyebrow="Scan"
        title="Scan anything"
        subtitle="Links, emails, texts, phone numbers and files, checked against real threat intelligence in seconds."
      />
      <ScanConsole />
    </>
  );
}
```

`web/src/app/(app)/scan/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { VerdictView } from "@/components/app/verdict-view";
import { createClient } from "@/lib/supabase/server";
import type { ScanRow } from "@/lib/types";

export default async function SavedScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("scans").select("*").eq("id", id).maybeSingle<ScanRow>();
  if (!data) notFound();
  return (
    <>
      <Link href="/history" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> History
      </Link>
      <PageHeader
        eyebrow={new Date(data.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        title="Saved verdict"
      />
      <VerdictView verdict={data.verdict} />
    </>
  );
}
```
Note: an invalid UUID in the URL makes Postgres return an error, `data` is null → `notFound()`. That is the intended behavior.

- [ ] **Step 4: Verify**

Run: `cd web; npx tsc --noEmit; npm run build` — Expected: success.
Manual with `./dev.ps1`: each sample chip produces a verdict and a new history row; EICAR shows HIGH RISK; the phishing link shows the heuristics + ARGUS intel cards as malicious/suspicious and unconfigured sources as "Not configured". **Offline check:** stop the API window, click a sample → toast "The ARGUS scanning engine is offline. Start it with dev.ps1." and no crash. Try a 9 MB file → toast about the 8 MB limit, no upload.

- [ ] **Step 5: Commit**

```powershell
git add web
git commit -m "feat(web): Scan Anything console with animated evidence-backed verdicts"
```

---

### Task 10: Dashboard and history

**Files:**
- Modify: `web/src/app/(app)/dashboard/page.tsx` (replace placeholder)
- Create: `web/src/app/(app)/history/page.tsx`
- Create: `web/src/components/app/{stat-card,threats-chart,kind-breakdown,recent-scans,protection-status}.tsx`

**Interfaces:**
- Consumes: `summarize`, `api.health`, `createClient`, `LevelPill`, `KIND_META`, `timeAgo`, shadcn `chart` + `table`.
- Produces: dashboard and history pages; `<StatCard label value tone hint?/>`.

- [ ] **Step 1:** Invoke the `dataviz` skill and apply its guidance to the chart below (keep series colors `--chart-1` scans / `--chart-2` threats).

- [ ] **Step 2: Implement components**

`web/src/components/app/stat-card.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";

export function StatCard({ label, value, tone, hint }: { label: string; value: number; tone: string; hint?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const counter = { v: 0 };
    const a = animate(counter, {
      v: value,
      duration: 1200,
      ease: "outExpo",
      onUpdate: () => {
        if (ref.current) ref.current.textContent = Math.round(counter.v).toLocaleString();
      },
    });
    return () => { a.pause(); };
  }, [value]);
  return (
    <div className="glass rounded-3xl p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-4 font-serif text-5xl tabular-nums leading-none" style={{ color: tone }}>
        <span ref={ref}>{value.toLocaleString()}</span>
      </p>
      {hint && <p className="mt-3 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
```

`web/src/components/app/threats-chart.tsx`:
```tsx
"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = {
  scans: { label: "Scans", color: "var(--chart-1)" },
  threats: { label: "Threats", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function ThreatsChart({ data }: { data: { label: string; scans: number; threats: number }[] }) {
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fill-scans" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-scans)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-scans)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fill-threats" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-threats)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-threats)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeOpacity={0.08} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        <Area dataKey="scans" type="monotone" stroke="var(--color-scans)" fill="url(#fill-scans)" strokeWidth={2} />
        <Area dataKey="threats" type="monotone" stroke="var(--color-threats)" fill="url(#fill-threats)" strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}
```

`web/src/components/app/kind-breakdown.tsx`:
```tsx
import { KIND_META } from "@/lib/format";
import type { DashboardStats } from "@/lib/stats";

export function KindBreakdown({ data }: { data: DashboardStats["byKind"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="space-y-4">
      {data.map(({ kind, count, threats }) => {
        const { label, icon: Icon } = KIND_META[kind];
        return (
          <li key={kind}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><Icon className="size-4 text-muted-foreground" />{label}</span>
              <span className="font-mono text-xs text-muted-foreground">{count} · <span className={threats ? "text-risk-high" : ""}>{threats} threats</span></span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-aurora-1 to-aurora-2" style={{ width: `${(count / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

`web/src/components/app/recent-scans.tsx`:
```tsx
import Link from "next/link";
import { KIND_META, timeAgo } from "@/lib/format";
import type { ScanRow } from "@/lib/types";
import { LevelPill } from "./level-pill";

type Row = Pick<ScanRow, "id" | "kind" | "input_preview" | "score" | "level" | "created_at">;

export function RecentScans({ rows }: { rows: Row[] }) {
  return (
    <ul className="divide-y divide-border/60">
      {rows.map((r) => {
        const Icon = KIND_META[r.kind].icon;
        return (
          <li key={r.id}>
            <Link href={`/scan/${r.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/[0.03]">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{r.input_preview.split("\n")[0]}</span>
              <LevelPill level={r.level} score={r.score} />
              <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground sm:block">{timeAgo(r.created_at)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
```

`web/src/components/app/protection-status.tsx`:
```tsx
const ALWAYS_ON = ["ARGUS ML model", "Scam phrase rules", "ARGUS heuristics", "Domain age (RDAP)", "File inspection"];

export function ProtectionStatus({ sources }: { sources: Record<string, boolean> | null }) {
  if (!sources) {
    return (
      <div className="rounded-2xl border border-risk-high/30 bg-risk-high/10 p-4 text-sm text-risk-high">
        Scanning engine offline. Run <code className="font-mono">dev.ps1</code> to start it.
      </div>
    );
  }
  const rows = [...ALWAYS_ON.map((name) => [name, true] as const), ...Object.entries(sources)];
  return (
    <ul className="space-y-2.5">
      {rows.map(([name, on]) => (
        <li key={name} className="flex items-center justify-between text-sm">
          <span className={on ? "" : "text-muted-foreground"}>{name}</span>
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider" style={{ color: on ? "var(--risk-safe)" : "var(--risk-unknown)" }}>
            <span className="size-1.5 rounded-full" style={{ background: on ? "var(--risk-safe)" : "var(--risk-unknown)" }} />
            {on ? "Active" : "Not configured"}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Implement pages**

`web/src/app/(app)/dashboard/page.tsx`:
```tsx
import Link from "next/link";
import { ScanSearch } from "lucide-react";
import { KindBreakdown } from "@/components/app/kind-breakdown";
import { PageHeader } from "@/components/app/page-header";
import { ProtectionStatus } from "@/components/app/protection-status";
import { RecentScans } from "@/components/app/recent-scans";
import { StatCard } from "@/components/app/stat-card";
import { ThreatsChart } from "@/components/app/threats-chart";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { summarize } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: rows }, health] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("scans").select("id,kind,input_preview,score,level,created_at").order("created_at", { ascending: false }).limit(500),
    api.health().catch(() => null),
  ]);
  const scans = rows ?? [];
  const stats = summarize(scans);
  const firstName = String(user?.user_metadata?.full_name ?? "").split(" ")[0] || "there";

  return (
    <>
      <PageHeader eyebrow="Overview" title={`${greeting()}, ${firstName}.`} subtitle="Here's everything Argus has watched for you.">
        <Button asChild className="rounded-full px-5"><Link href="/scan"><ScanSearch className="size-4" /> New scan</Link></Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total scans" value={stats.total} tone="var(--foreground)" />
        <StatCard label="Threats caught" value={stats.threats} tone="var(--risk-sus)" hint="Suspicious or worse" />
        <StatCard label="High risk" value={stats.highRisk} tone="var(--risk-high)" />
        <StatCard label="Safe" value={stats.safe} tone="var(--risk-safe)" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="glass rounded-3xl p-6 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-serif text-2xl">Last 14 days</h2>
            <p className="text-xs text-muted-foreground">Scans vs. threats</p>
          </div>
          <ThreatsChart data={stats.series} />
        </section>
        <section className="glass rounded-3xl p-6">
          <h2 className="mb-5 font-serif text-2xl">Protection status</h2>
          <ProtectionStatus sources={health?.sources ?? null} />
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="glass rounded-3xl p-6">
          <h2 className="mb-5 font-serif text-2xl">By channel</h2>
          <KindBreakdown data={stats.byKind} />
        </section>
        <section className="glass rounded-3xl p-6 lg:col-span-2">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-serif text-2xl">Recent activity</h2>
            <Link href="/history" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
          </div>
          {scans.length ? (
            <RecentScans rows={scans.slice(0, 6)} />
          ) : (
            <div className="py-10 text-center">
              <p className="text-muted-foreground">Nothing scanned yet.</p>
              <Button asChild variant="outline" className="mt-4 rounded-full"><Link href="/scan">Run your first scan</Link></Button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
```

`web/src/app/(app)/history/page.tsx`:
```tsx
import Link from "next/link";
import { LevelPill } from "@/components/app/level-pill";
import { PageHeader } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KIND_META, timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ScanKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: (ScanKind | "all")[] = ["all", "url", "file", "email", "phone", "text", "call"];

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const active = FILTERS.includes(kind as ScanKind) ? (kind as ScanKind) : "all";
  const supabase = await createClient();
  let query = supabase.from("scans").select("id,kind,input_preview,score,level,threat_type,created_at").order("created_at", { ascending: false }).limit(200);
  if (active !== "all") query = query.eq("kind", active);
  const { data: rows } = await query;

  return (
    <>
      <PageHeader eyebrow="History" title="Everything you've scanned" />
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/history" : `/history?kind=${f}`}
            className={cn("rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground", active === f && "border-primary/60 bg-primary/10 text-foreground")}
          >
            {f === "all" ? "All" : KIND_META[f].label}
          </Link>
        ))}
      </div>
      <div className="glass overflow-hidden rounded-3xl">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28">Type</TableHead>
              <TableHead>Scanned</TableHead>
              <TableHead className="hidden md:table-cell">Threat</TableHead>
              <TableHead>Verdict</TableHead>
              <TableHead className="hidden text-right sm:table-cell">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((r) => {
              const { label, icon: Icon } = KIND_META[r.kind as ScanKind];
              return (
                <TableRow key={r.id} className="cursor-pointer">
                  <TableCell><Link href={`/scan/${r.id}`} className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" />{label}</Link></TableCell>
                  <TableCell className="max-w-72"><Link href={`/scan/${r.id}`} className="block truncate">{r.input_preview.split("\n")[0]}</Link></TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{r.threat_type}</TableCell>
                  <TableCell><LevelPill level={r.level} score={r.score} /></TableCell>
                  <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">{timeAgo(r.created_at)}</TableCell>
                </TableRow>
              );
            })}
            {!rows?.length && (
              <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">No scans here yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Verify**

Run: `cd web; npm test; npx tsc --noEmit; npm run build` — Expected: success.
Manual: dashboard numbers match history; chart shows today's scans; stopping the API shows the offline banner on the dashboard instead of an error page.

- [ ] **Step 5: Commit**

```powershell
git add web
git commit -m "feat(web): live dashboard and filterable scan history"
```

---

### Task 11: Email checker

**Files:**
- Create: `api/argus_api/checkers/email.py`
- Modify: `api/argus_api/main.py`
- Test: `api/tests/test_email.py`

**Interfaces:**
- Consumes: `extract_urls`, `ml_signal`, `rules_signal`, `BRAND_DOMAINS`, `check_url`, `host_of`, `combine`, `verdict_as_signal`.
- Produces: `parse_auth_results(msg) -> dict[str,str]`, `header_signal(msg) -> Signal`, `extract_body(msg) -> tuple[str, list[str]]`, `async check_email(raw) -> Verdict`; dispatch `"email"`.

- [ ] **Step 1: Write the failing tests**

`api/tests/test_email.py`:
```python
from email import policy
from email.parser import Parser

import respx

from argus_api.checkers.email import check_email, header_signal, parse_auth_results

SPOOFED = """From: "PayPal Security" <security@paypa1-security.com>
Reply-To: refunds@secure-helpdesk.xyz
To: you@example.com
Subject: Final notice: account suspended
Authentication-Results: mx.example.com; spf=fail smtp.mailfrom=paypa1-security.com; dkim=none; dmarc=fail

Dear customer, we detected an unusual sign-in. Verify your password immediately."""

CLEAN = """From: Alice <alice@example.com>
To: you@example.com
Subject: lunch
Authentication-Results: mx.example.com; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com; dmarc=pass

Hey are we still on for lunch tomorrow at noon?"""

HTML_ONLY = """From: Shop <news@shop.example>
To: you@example.com
Subject: deal
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<p>Your parcel is waiting. <a href="http://paypal-security-alert.net/login">Track it</a></p>"""


def parse(raw):
    return Parser(policy=policy.default).parsestr(raw)


def test_parse_auth_results():
    assert parse_auth_results(parse(CLEAN)) == {"spf": "pass", "dkim": "pass", "dmarc": "pass"}
    assert parse_auth_results(parse(SPOOFED)) == {"spf": "fail", "dkim": "none", "dmarc": "fail"}


def test_spoofed_headers_flagged():
    s = header_signal(parse(SPOOFED))
    assert s.status == "suspicious" and s.score >= 80
    assert any("secure-helpdesk.xyz" in r for r in s.evidence["reasons"])
    assert any("Paypal" in r for r in s.evidence["reasons"])


async def test_clean_email_is_safe():
    v = await check_email(CLEAN)
    assert v.kind == "email"
    assert v.level == "SAFE"
    assert v.subject == "lunch"


async def test_spoofed_email_scores_high():
    v = await check_email(SPOOFED)
    assert v.score >= 60


async def test_links_in_html_are_scanned():
    with respx.mock:
        v = await check_email(HTML_ONLY)
    assert any(s.source == "Link: paypal-security-alert.net" for s in v.signals)
```
Append to `api/tests/test_api.py`:
```python
def test_scan_routes_raw_email():
    raw = "From: Alice <alice@example.com>\nTo: you@example.com\nSubject: hi\n\nSee you at noon."
    assert client.post("/scan", json={"input": raw}).json()["kind"] == "email"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api; .venv/Scripts/python -m pytest -q` — Expected: FAIL (`No module named 'argus_api.checkers.email'`).

- [ ] **Step 3: Implement**

`api/argus_api/checkers/email.py`:
```python
"""Email analysis: sender authentication + spoofing tells + body model + every link inside."""
from __future__ import annotations

import asyncio
import re
from email import policy
from email.message import EmailMessage
from email.parser import Parser
from email.utils import parseaddr

from argus_api.aggregate import combine, verdict_as_signal
from argus_api.checkers.text import extract_urls, ml_signal, rules_signal
from argus_api.checkers.url import BRAND_DOMAINS, check_url, host_of
from argus_api.models import Signal, Verdict

_HREF = re.compile(r"""href\s*=\s*["'](https?://[^"']+)""", re.I)
_TAG = re.compile(r"<[^>]+>")
_ADDRESS = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def _domain(address: str) -> str:
    return address.rsplit("@", 1)[-1].lower() if "@" in address else ""


def parse_auth_results(msg: EmailMessage) -> dict[str, str]:
    header = " ".join(str(h) for h in (msg.get_all("Authentication-Results") or []))
    results = {}
    for mech in ("spf", "dkim", "dmarc"):
        match = re.search(rf"\b{mech}\s*=\s*([a-z]+)", header, re.I)
        results[mech] = match.group(1).lower() if match else "none"
    return results


def header_signal(msg: EmailMessage) -> Signal:
    auth = parse_auth_results(msg)
    points = 0
    reasons: list[str] = []
    if auth["spf"] in ("fail", "softfail"):
        points += 30
        reasons.append(f"SPF {auth['spf']}: the sending server isn't authorized to send for this domain")
    if auth["dkim"] == "fail":
        points += 25
        reasons.append("DKIM failed: the message was altered or forged")
    if auth["dmarc"] == "fail":
        points += 40
        reasons.append("DMARC failed: the sender's domain doesn't vouch for this email")

    from_name, from_addr = parseaddr(str(msg.get("From", "")))
    from_domain = _domain(from_addr)
    reply_domain = _domain(parseaddr(str(msg.get("Reply-To", "")))[1])
    if reply_domain and from_domain and reply_domain != from_domain:
        points += 25
        reasons.append(f"Replies go to a different domain ({reply_domain})")

    embedded = _ADDRESS.search(from_name)
    if embedded and _domain(embedded.group(0)) != from_domain:
        points += 30
        reasons.append(f"Display name shows {_domain(embedded.group(0))} but the real sender is {from_domain}")
    else:
        squashed = from_name.lower().replace(" ", "")
        for brand, domains in BRAND_DOMAINS.items():
            if brand in squashed and from_domain and not any(from_domain == d or from_domain.endswith("." + d) for d in domains):
                points += 30
                reasons.append(f"Claims to be {brand.title()} but was sent from {from_domain}")
                break

    bounce_domain = _domain(parseaddr(str(msg.get("Return-Path", "")))[1])
    if bounce_domain and from_domain and bounce_domain != from_domain:
        points += 10
        reasons.append(f"Bounce address uses a different domain ({bounce_domain})")

    score = min(points, 100)
    if reasons:
        summary = reasons[0]
    elif all(v == "pass" for v in auth.values()):
        summary = "SPF, DKIM and DMARC all passed"
    else:
        summary = "No sender red flags found"
    return Signal(source="Sender authentication", status="suspicious" if score >= 30 else "clean", score=score,
                  weight=1.2, summary=summary,
                  evidence={"auth": auth, "from": from_addr, "reply_to": reply_domain or None,
                            "reasons": reasons, "threat_type": "Phishing / spoofing"})


def extract_body(msg: EmailMessage) -> tuple[str, list[str]]:
    plain: list[str] = []
    html: list[str] = []
    for part in msg.walk():
        if part.is_multipart() or part.get_content_disposition() == "attachment":
            continue
        try:
            content = part.get_content()
        except Exception:  # noqa: BLE001 - undecodable parts are skipped
            continue
        if not isinstance(content, str):
            continue
        (html if part.get_content_type() == "text/html" else plain).append(content)
    html_text = "\n".join(html)
    body = "\n".join(plain) or _TAG.sub(" ", html_text)
    return body.strip(), _HREF.findall(html_text)


async def check_email(raw: str) -> Verdict:
    msg = Parser(policy=policy.default).parsestr(raw.strip())
    body, links = extract_body(msg)
    text = body or raw
    signals = [header_signal(msg), ml_signal(text), rules_signal(text)]
    urls = list(dict.fromkeys(links + extract_urls(text)))[:3]
    if urls:
        verdicts = await asyncio.gather(*(check_url(u) for u in urls))
        signals += [verdict_as_signal(v, f"Link: {host_of(v.subject)}") for v in verdicts]
    return combine("email", str(msg.get("Subject") or "Pasted email"), signals)
```

In `api/argus_api/main.py` add `from argus_api.checkers.email import check_email` and in `dispatch` add before the fallback:
```python
    if kind == "email":
        return await check_email(text)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api; .venv/Scripts/python -m pytest -q` — Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add api
git commit -m "feat(api): email scanning with SPF/DKIM/DMARC, spoofing tells and link checks"
```

---

### Task 12: Phone checker + community reports

**Files:**
- Create: `api/argus_api/checkers/phone.py`
- Modify: `api/argus_api/main.py`, `web/src/app/(app)/scan/actions.ts`, `web/src/components/app/scan-console.tsx`
- Create: `web/src/components/app/report-number.tsx`
- Test: `api/tests/test_phone.py`, `api/tests/test_api.py`

**Interfaces:**
- Consumes: `get_engine().lookup_phone`, `combine`, `api.normalizePhone`.
- Produces: `normalize(raw) -> str | None`, `validity_signal(parsed)`, `blocklist_signal(e164)`, `community_signal(count)`, `check_phone(raw, community_reports=0) -> Verdict`; `GET /phone/normalize?number=` → `{e164}`; dispatch `"phone"`; server action `reportNumber(e164, category, note) -> {ok:true}|{ok:false,error}`; `<ReportNumber e164/>`.

- [ ] **Step 1: Write the failing tests**

`api/tests/test_phone.py`:
```python
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
```
Append to `api/tests/test_api.py`:
```python
def test_phone_normalize_endpoint():
    assert client.get("/phone/normalize", params={"number": "(800) 555-0142"}).json() == {"e164": "+18005550142"}


def test_scan_phone_with_community_reports():
    r = client.post("/scan", json={"input": "+1 650-253-0000", "community_reports": 5}).json()
    assert r["kind"] == "phone" and r["score"] >= 60
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api; .venv/Scripts/python -m pytest -q` — Expected: FAIL (`No module named 'argus_api.checkers.phone'`).

- [ ] **Step 3: Implement the API side**

`api/argus_api/checkers/phone.py`:
```python
"""Phone number analysis: validation + ARGUS blocklist + community reports."""
from __future__ import annotations

import os

import phonenumbers
from phonenumbers import PhoneNumber, PhoneNumberFormat, PhoneNumberType, carrier, geocoder

from argus_api.aggregate import combine
from argus_api.models import Signal, Verdict
from argus_api.risk_engine import get_engine

LINE_TYPES = {
    PhoneNumberType.MOBILE: "mobile",
    PhoneNumberType.FIXED_LINE: "landline",
    PhoneNumberType.FIXED_LINE_OR_MOBILE: "landline or mobile",
    PhoneNumberType.TOLL_FREE: "toll-free",
    PhoneNumberType.PREMIUM_RATE: "premium-rate",
    PhoneNumberType.VOIP: "VoIP",
    PhoneNumberType.SHARED_COST: "shared-cost",
    PhoneNumberType.PERSONAL_NUMBER: "personal",
    PhoneNumberType.UAN: "business",
}


def _region() -> str:
    return os.environ.get("ARGUS_DEFAULT_REGION", "US").upper()


def _parse(raw: str) -> PhoneNumber | None:
    try:
        parsed = phonenumbers.parse(raw.strip(), _region())
    except phonenumbers.NumberParseException:
        return None
    return parsed if phonenumbers.is_possible_number(parsed) else None


def normalize(raw: str) -> str | None:
    parsed = _parse(raw)
    return phonenumbers.format_number(parsed, PhoneNumberFormat.E164) if parsed else None


def validity_signal(parsed: PhoneNumber | None) -> Signal:
    source = "Number validation"
    if parsed is None:
        return Signal(source=source, status="suspicious", score=40, weight=1.0,
                      summary="Not a real, dialable phone number, a common sign of spoofing",
                      evidence={"threat_type": "Spoofed caller ID"})
    number_type = phonenumbers.number_type(parsed)
    line = LINE_TYPES.get(number_type, "unknown")
    region = geocoder.description_for_number(parsed, "en") or phonenumbers.region_code_for_number(parsed) or "an unknown region"
    evidence = {
        "e164": phonenumbers.format_number(parsed, PhoneNumberFormat.E164),
        "country": phonenumbers.region_code_for_number(parsed),
        "carrier": carrier.name_for_number(parsed, "en") or None,
        "line_type": line,
    }
    if not phonenumbers.is_valid_number(parsed):
        return Signal(source=source, status="suspicious", score=40, weight=1.0,
                      summary="This number isn't assigned to anyone, often a sign of a spoofed caller ID",
                      evidence={**evidence, "threat_type": "Spoofed caller ID"})
    if number_type == PhoneNumberType.VOIP:
        return Signal(source=source, status="suspicious", score=35, weight=1.0,
                      summary=f"Internet (VoIP) number from {region}; scam call centers often use these",
                      evidence={**evidence, "threat_type": "Possible scam call"})
    if number_type == PhoneNumberType.PREMIUM_RATE:
        return Signal(source=source, status="suspicious", score=45, weight=1.0,
                      summary="Premium-rate number: calling back can cost you money",
                      evidence={**evidence, "threat_type": "Premium-rate fraud"})
    return Signal(source=source, status="clean", score=0, weight=1.0,
                  summary=f"Valid {line} number from {region}", evidence=evidence)


def blocklist_signal(e164: str | None) -> Signal:
    entry = get_engine().lookup_phone(e164) if e164 else None
    if entry:
        return Signal(source="ARGUS blocklist", status="malicious", score=95, weight=1.5, authoritative=True,
                      summary=entry["notes"], evidence={"category": entry["category"], "threat_type": entry["category"]})
    return Signal(source="ARGUS blocklist", status="clean", score=0, weight=0.5, summary="Not on the ARGUS blocklist")


def community_signal(count: int) -> Signal:
    source = "Community reports"
    if count <= 0:
        return Signal(source=source, status="clean", score=0, weight=0.5, summary="No reports from Argus users")
    if count < 3:
        return Signal(source=source, status="suspicious", score=45, weight=1.0,
                      summary=f"Reported by {count} Argus user{'s' if count != 1 else ''}",
                      evidence={"reports": count, "threat_type": "Reported by the community"})
    return Signal(source=source, status="malicious", score=85, weight=1.2,
                  summary=f"Reported by {count} Argus users",
                  evidence={"reports": count, "threat_type": "Reported scam number"})


def check_phone(raw: str, community_reports: int = 0) -> Verdict:
    parsed = _parse(raw)
    e164 = normalize(raw)
    signals = [validity_signal(parsed), blocklist_signal(e164), community_signal(community_reports)]
    return combine("phone", e164 or raw.strip(), signals)
```

In `api/argus_api/main.py` add `from argus_api.checkers.phone import check_phone, normalize`, add to `dispatch` before the fallback:
```python
    if kind == "phone":
        return check_phone(text, community_reports)
```
and append:
```python
@app.get("/phone/normalize")
def phone_normalize(number: str) -> dict:
    return {"e164": normalize(number)}
```

Run: `cd api; .venv/Scripts/python -m pytest -q` — Expected: all PASS.

- [ ] **Step 4: Web: community lookup + report button**

In `web/src/app/(app)/scan/actions.ts`, add below `MAX_UPLOAD_BYTES`:
```ts
const PHONEISH = /^\+?[\d\s\-().]{7,20}$/;

async function communityReports(supabase: Awaited<ReturnType<typeof createClient>>, input: string): Promise<number> {
  if (!PHONEISH.test(input)) return 0;
  try {
    const { e164 } = await api.normalizePhone(input);
    if (!e164) return 0;
    const { count } = await supabase.from("phone_reports").select("id", { count: "exact", head: true }).eq("number", e164);
    return count ?? 0;
  } catch {
    return 0;
  }
}
```
Change the text branch to:
```ts
    } else if (input) {
      verdict = await api.scan(input, await communityReports(supabase, input));
      preview = input;
```
And append:
```ts
export type ReportResult = { ok: true } | { ok: false; error: string };
const CATEGORIES = ["Scam", "Spam", "Robocall", "Fraud", "Other"] as const;

export async function reportNumber(e164: string, category: string, note: string): Promise<ReportResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!/^\+[1-9]\d{6,14}$/.test(e164)) return { ok: false, error: "That number can't be reported." };
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) return { ok: false, error: "Pick a category." };
  const { error } = await supabase.from("phone_reports").insert({ number: e164, category, note: note.trim().slice(0, 280) || null });
  if (error) return { ok: false, error: error.code === "23505" ? "You've already reported this number." : error.message };
  return { ok: true };
}
```

`web/src/components/app/report-number.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { reportNumber } from "@/app/(app)/scan/actions";
import { Button } from "@/components/ui/button";

const CATEGORIES = ["Scam", "Spam", "Robocall", "Fraud", "Other"];

export function ReportNumber({ e164 }: { e164: string }) {
  const [category, setCategory] = useState("Scam");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <p className="text-sm text-muted-foreground">Thanks. Your report helps protect other Argus users.</p>;
  return (
    <div className="flex items-center gap-2">
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="h-9 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
        aria-label="Report category"
      >
        {CATEGORIES.map((c) => <option key={c} value={c} className="bg-popover">{c}</option>)}
      </select>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await reportNumber(e164, category, "");
            if (res.ok) {
              setDone(true);
              toast.success("Number reported to the Argus community.");
            } else toast.error(res.error);
          })
        }
      >
        <Flag className="size-3.5" /> Report
      </Button>
    </div>
  );
}
```

In `web/src/components/app/scan-console.tsx` import `ReportNumber` and pass it to the verdict view:
```tsx
import { ReportNumber } from "./report-number";
```
```tsx
          <VerdictView
            verdict={result.verdict}
            actions={result.verdict.kind === "phone" && result.verdict.subject.startsWith("+") ? <ReportNumber e164={result.verdict.subject} /> : undefined}
          />
```

- [ ] **Step 5: Verify**

Run: `cd api; .venv/Scripts/python -m pytest -q` then `cd ../web; npx tsc --noEmit; npm run build` — Expected: success.
Manual: scan `+1 650-253-0000` → SAFE; click Report → success toast; report it again → "You've already reported this number."; rescan → "Community reports: Reported by 1 Argus user".

- [ ] **Step 6: Commit**

```powershell
git add api web
git commit -m "feat: phone number validation, blocklist and community reports"
```

---

### Task 13: Call Assistant

**Files:**
- Create: `api/argus_api/call.py`, `web/src/app/(app)/call-assistant/page.tsx`, `web/src/app/(app)/call-assistant/actions.ts`, `web/src/components/app/call-console.tsx`
- Modify: `api/argus_api/main.py`
- Test: `api/tests/test_call.py`, `api/tests/test_api.py`

**Interfaces:**
- Consumes: `local_text_signals`, `combine`, `config.key`, `api.callTurn`, `api.scan`, `levelFor`, `LEVEL_META`.
- Produces: `DISCLOSURE_LINE`, `CALL_MODEL`, `Turn`, `CallTurnRequest`, `CallTurnResponse`, `analyze_call(transcript) -> Verdict`, `scripted_reply(analysis, rng=random) -> str`, `llm_reply(transcript, analysis, api_key) -> str`, `reply_to(req) -> CallTurnResponse`; `POST /call/turn`; server actions `screenCaller(callerId)`, `callTurn(transcript)`, `saveCall(callerId, analysis)`.

- [ ] **Step 1:** Invoke the `claude-api` skill and confirm the model id `claude-sonnet-5` and the `messages.create` call shape used below.

- [ ] **Step 2: Write the failing tests**

`api/tests/test_call.py`:
```python
import random

from argus_api import call
from argus_api.call import CallTurnRequest, Turn, analyze_call, reply_to, scripted_reply

SCAM = ("This is your bank's fraud department calling from 1-800-555-0142, we noticed suspicious activity, "
        "please confirm your pin and card number immediately, do not tell your family, keep this confidential.")


def req(*caller_lines):
    turns = [Turn(role="assistant", text=call.DISCLOSURE_LINE)]
    turns += [Turn(role="caller", text=t) for t in caller_lines]
    return CallTurnRequest(transcript=turns)


def test_scam_call_scores_high():
    assert analyze_call(req(SCAM).transcript).score >= 60


def test_scripted_high_risk_reply_ends_call():
    reply = scripted_reply(analyze_call(req(SCAM).transcript), rng=random.Random(0))
    assert "end" in reply.lower()


def test_without_key_uses_scripted():
    assert reply_to(req("Hi, wrong number, sorry")).mode == "scripted"


def test_llm_failure_falls_back(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.setattr(call, "llm_reply", lambda *a: (_ for _ in ()).throw(RuntimeError("down")))
    assert reply_to(req("hello")).mode == "scripted"


def test_llm_used_when_available(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    monkeypatch.setattr(call, "llm_reply", lambda *a: "Who is calling, please?")
    r = reply_to(req("hello"))
    assert (r.mode, r.reply) == ("Claude", "Who is calling, please?")
```
Append to `api/tests/test_api.py`:
```python
def test_call_turn_endpoint():
    body = {"transcript": [{"role": "assistant", "text": "Hi"}, {"role": "caller", "text": "Wrong number, sorry"}]}
    r = client.post("/call/turn", json=body)
    assert r.status_code == 200 and r.json()["mode"] == "scripted"


def test_call_turn_rejects_empty_transcript():
    assert client.post("/call/turn", json={"transcript": []}).status_code == 422
```

Run: `cd api; .venv/Scripts/python -m pytest -q` — Expected: FAIL (`cannot import name 'call'`).

- [ ] **Step 3: Implement API**

`api/argus_api/call.py`:
```python
"""AI call-screening assistant: scores the caller live and answers in character."""
from __future__ import annotations

import random
from typing import Literal

from pydantic import BaseModel, Field

from argus_api import config
from argus_api.aggregate import combine
from argus_api.checkers.text import local_text_signals
from argus_api.models import Verdict

CALL_MODEL = "claude-sonnet-5"
DISCLOSURE_LINE = "Hi, this is the Argus call assistant screening this line. Who's calling, and what's this about?"

FOLLOW_UPS = {
    "SAFE": [
        "Got it, thanks for explaining. Is there anything specific you need from this number?",
        "Understood. Can I ask what this is regarding, so I can pass along an accurate message?",
    ],
    "LOW/MODERATE": [
        "Okay. Which company or organization are you calling from?",
        "I see. Can you give me your name and a callback number I can verify independently?",
    ],
    "SUSPICIOUS": [
        "I want to be careful here. Which account are you referring to, without me giving you any details first?",
        "Before we go further: I won't share any codes, passwords, or account numbers. What is this actually about?",
    ],
    "HIGH RISK": [
        "I'm not going to share any personal or account information on this call. I'll be ending the call now.",
        "This call has been flagged as high risk. No information will be shared, and the call will now end.",
    ],
}


class Turn(BaseModel):
    role: Literal["caller", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class CallTurnRequest(BaseModel):
    transcript: list[Turn] = Field(min_length=1, max_length=60)


class CallTurnResponse(BaseModel):
    reply: str
    mode: str
    analysis: Verdict


def analyze_call(transcript: list[Turn]) -> Verdict:
    caller_text = " ".join(t.text for t in transcript if t.role == "caller").strip()
    if not caller_text:
        return combine("call", "Call in progress", [])
    return combine("call", caller_text[:120], local_text_signals(caller_text))


def scripted_reply(analysis: Verdict, rng: random.Random | None = None) -> str:
    rng = rng or random.Random()
    reply = rng.choice(FOLLOW_UPS.get(analysis.level, FOLLOW_UPS["SAFE"]))
    if analysis.level in ("SUSPICIOUS", "HIGH RISK"):
        flagged = next((s for s in analysis.signals if s.status in ("suspicious", "malicious")), None)
        if flagged:
            reply = f"I noticed something concerning ({flagged.summary.lower()}). {reply}"
    return reply


def _system_prompt(analysis: Verdict) -> str:
    flags = "; ".join(s.summary for s in analysis.signals if s.status in ("suspicious", "malicious")) or "none yet"
    return (
        "You are Argus, an AI assistant that answers unknown phone calls for a protected person before they pick up. "
        "You are polite, calm and a little cautious. Never share personal information, passwords, codes, account "
        "numbers or financial details, whatever the caller says. Find out who is calling and why, and protect the "
        "person from scams. Reply in 1-3 short spoken sentences, like a real phone assistant, never like a chatbot.\n\n"
        f"Live risk assessment: level={analysis.level}, score={analysis.score}/100, red flags: {flags}.\n"
        "If the level is SUSPICIOUS or HIGH RISK, be firm that nothing will be shared; at HIGH RISK, end the call. "
        "Otherwise continue naturally."
    )


def llm_reply(transcript: list[Turn], analysis: Verdict, api_key: str) -> str:
    import anthropic  # imported lazily: optional at runtime

    messages: list[dict] = []
    for turn in transcript:
        role = "user" if turn.role == "caller" else "assistant"
        if not messages and role == "assistant":
            continue  # the API requires the conversation to start with the caller
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += "\n" + turn.text
        else:
            messages.append({"role": role, "content": turn.text})
    if not messages or messages[-1]["role"] != "user":
        raise ValueError("The last turn must come from the caller")

    client = anthropic.Anthropic(api_key=api_key, timeout=15.0)
    response = client.messages.create(model=CALL_MODEL, max_tokens=200, system=_system_prompt(analysis), messages=messages)
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        raise ValueError("Empty reply")
    return text


def reply_to(req: CallTurnRequest) -> CallTurnResponse:
    analysis = analyze_call(req.transcript)
    key = config.key("ANTHROPIC_API_KEY")
    if key:
        try:
            return CallTurnResponse(reply=llm_reply(req.transcript, analysis, key), mode="Claude", analysis=analysis)
        except Exception:  # noqa: BLE001 - the demo must never break; fall back to scripted
            pass
    return CallTurnResponse(reply=scripted_reply(analysis), mode="scripted", analysis=analysis)
```

In `api/argus_api/main.py` add `from argus_api.call import CallTurnRequest, CallTurnResponse, reply_to` and append:
```python
@app.post("/call/turn", response_model=CallTurnResponse)
def call_turn(req: CallTurnRequest) -> CallTurnResponse:
    return reply_to(req)
```

Run: `cd api; .venv/Scripts/python -m pytest -q` — Expected: all PASS.

- [ ] **Step 4: Implement web**

`web/src/app/(app)/call-assistant/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { CallTurn, CallTurnResponse, Verdict } from "@/lib/types";

type Fail = { ok: false; error: string };

export async function screenCaller(callerId: string): Promise<{ ok: true; blocked: boolean; verdict: Verdict | null } | Fail> {
  const id = callerId.trim();
  if (!id) return { ok: true, blocked: false, verdict: null };
  try {
    const verdict = await api.scan(id);
    const blocked = verdict.kind === "phone" && verdict.signals.some((s) => s.source === "ARGUS blocklist" && s.status === "malicious");
    return { ok: true, blocked, verdict };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't check that number." };
  }
}

export async function callTurn(transcript: CallTurn[]): Promise<({ ok: true } & CallTurnResponse) | Fail> {
  try {
    return { ok: true, ...(await api.callTurn(transcript)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The call assistant is unavailable." };
  }
}

export async function saveCall(callerId: string, analysis: Verdict): Promise<{ ok: true; id: string } | Fail> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };
  const { data, error } = await supabase
    .from("scans")
    .insert({
      kind: "call",
      input_preview: `Call from ${callerId.trim() || "unknown caller"}`.slice(0, 200),
      score: analysis.score,
      level: analysis.level,
      threat_type: analysis.threat_type,
      verdict: { ...analysis, kind: "call", subject: callerId.trim() || "Unknown caller" },
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/history");
  return { ok: true, id: data.id };
}
```

`web/src/components/app/call-console.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, PhoneIncoming, PhoneOff, Send, ShieldAlert, User } from "lucide-react";
import { toast } from "sonner";
import { callTurn, saveCall, screenCaller } from "@/app/(app)/call-assistant/actions";
import { Iris } from "@/components/iris/iris";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LEVEL_META, levelFor } from "@/lib/format";
import type { CallTurn, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";

const DISCLOSURE = "Hi, this is the Argus call assistant screening this line. Who's calling, and what's this about?";
const EXAMPLES = [
  { label: "Wrong number", text: "Hi sorry, I think I have the wrong number, I was trying to reach a plumber." },
  { label: "Vague urgency", text: "This is urgent, I need you to confirm your identity right now or there will be a problem with your account." },
  { label: "Fake tech support", text: "This is Microsoft technical support. We detected a virus on your computer. Give us remote access to your computer immediately and do not tell anyone." },
  { label: "Bank PIN scam", text: "This is your bank's fraud department, we noticed suspicious activity, please confirm your pin and card number immediately, do not tell your family, keep this confidential." },
];

type Phase = "setup" | "live" | "blocked" | "ended";

export function CallConsole() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [callerId, setCallerId] = useState("");
  const [transcript, setTranscript] = useState<CallTurn[]>([]);
  const [analysis, setAnalysis] = useState<Verdict | null>(null);
  const [blockVerdict, setBlockVerdict] = useState<Verdict | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [transcript]);

  const score = analysis?.score ?? 0;
  const level = analysis?.level && analysis.level !== "UNVERIFIED" ? analysis.level : levelFor(score);
  const color = LEVEL_META[level].color;

  function startCall() {
    start(async () => {
      const res = await screenCaller(callerId);
      if (!res.ok) return void toast.error(res.error);
      if (res.blocked) {
        setBlockVerdict(res.verdict);
        setPhase("blocked");
        if (res.verdict) await saveCall(callerId, res.verdict);
        return;
      }
      setTranscript([{ role: "assistant", text: DISCLOSURE }]);
      setAnalysis(null);
      setSavedId(null);
      setPhase("live");
    });
  }

  function send(text: string) {
    const line = text.trim();
    if (!line || pending) return;
    const next: CallTurn[] = [...transcript, { role: "caller", text: line }];
    setTranscript(next);
    setMessage("");
    start(async () => {
      const res = await callTurn(next);
      if (!res.ok) return void toast.error(res.error);
      setTranscript([...next, { role: "assistant", text: res.reply }]);
      setAnalysis(res.analysis);
      setMode(res.mode);
    });
  }

  function endCall() {
    start(async () => {
      if (analysis) {
        const res = await saveCall(callerId, analysis);
        if (res.ok) setSavedId(res.id);
        else toast.error(res.error);
      }
      setPhase("ended");
    });
  }

  function reset() {
    setPhase("setup");
    setTranscript([]);
    setAnalysis(null);
    setBlockVerdict(null);
    setMode(null);
    setSavedId(null);
  }

  if (phase === "setup") {
    return (
      <div className="glass mx-auto flex max-w-xl flex-col items-center rounded-3xl p-10 text-center">
        <Iris size={160} />
        <h2 className="mt-6 font-serif text-3xl">Simulate an incoming call</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter a caller ID, or leave it blank for an unknown caller. Known scam numbers are declined before the call ever rings. Try <span className="font-mono">1-800-555-0142</span>.
        </p>
        <div className="mt-6 flex w-full gap-2">
          <Input value={callerId} onChange={(e) => setCallerId(e.target.value)} placeholder="Caller ID (optional)" onKeyDown={(e) => e.key === "Enter" && startCall()} />
          <Button onClick={startCall} disabled={pending} className="shrink-0"><PhoneIncoming className="size-4" /> Answer</Button>
        </div>
      </div>
    );
  }

  if (phase === "blocked") {
    return (
      <div className="glass mx-auto max-w-xl rounded-3xl p-10 text-center">
        <Iris state="danger" size={160} className="mx-auto" />
        <h2 className="mt-6 font-serif text-4xl text-risk-high">Call declined</h2>
        <p className="mt-3 text-muted-foreground">
          <span className="font-mono text-foreground">{callerId}</span> is a known scam number. Argus blocked it before it could ring. No conversation took place.
        </p>
        {blockVerdict && <p className="mt-2 text-sm text-muted-foreground">{blockVerdict.signals.find((s) => s.source === "ARGUS blocklist")?.summary}</p>}
        <Button variant="outline" className="mt-8" onClick={reset}>Take another call</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <section className="glass flex h-[620px] flex-col rounded-3xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <p className="text-sm"><span className="text-muted-foreground">On the line:</span> <span className="font-mono">{callerId || "Unknown caller"}</span></p>
          {phase === "live" ? (
            <Button size="sm" variant="outline" onClick={endCall} disabled={pending}><PhoneOff className="size-3.5" /> End &amp; save</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={reset}>New call</Button>
          )}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {transcript.map((t, i) => (
            <div key={i} className={cn("flex gap-3", t.role === "caller" && "flex-row-reverse")}>
              <div className={cn("grid size-8 shrink-0 place-items-center rounded-full", t.role === "caller" ? "bg-white/10" : "bg-gradient-to-br from-aurora-1 to-aurora-2")}>
                {t.role === "caller" ? <User className="size-4" /> : <Bot className="size-4" />}
              </div>
              <p className={cn("max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed", t.role === "caller" ? "bg-white/[0.07]" : "border border-border/60 bg-background/40")}>{t.text}</p>
            </div>
          ))}
          {pending && phase === "live" && <p className="pl-11 font-mono text-xs text-muted-foreground">Argus is listening…</p>}
          <div ref={endRef} />
        </div>
        {phase === "live" && (
          <div className="border-t border-border/60 p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e.label} type="button" onClick={() => send(e.text)} disabled={pending} className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50">{e.label}</button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(message); }} className="flex gap-2">
              <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Speak as the caller…" disabled={pending} />
              <Button type="submit" size="icon" disabled={pending || !message.trim()} aria-label="Send"><Send className="size-4" /></Button>
            </form>
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <div className="glass rounded-3xl p-6">
          <p className="eyebrow">Live call risk</p>
          <p className="mt-3 font-serif text-6xl tabular-nums" style={{ color }}>{score}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full transition-[width,background-color] duration-700" style={{ width: `${Math.max(score, 2)}%`, background: color, boxShadow: `0 0 16px ${color}` }} />
          </div>
          <p className="mt-3 text-sm" style={{ color }}>{LEVEL_META[level].label}</p>
          {mode && <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Replies: {mode}</p>}
        </div>
        {analysis && analysis.signals.some((s) => s.status === "suspicious" || s.status === "malicious") && (
          <div className="glass rounded-3xl p-6">
            <p className="eyebrow flex items-center gap-1.5"><ShieldAlert className="size-3" /> Red flags</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {analysis.signals.filter((s) => s.status === "suspicious" || s.status === "malicious").map((s) => <li key={s.source}>{s.summary}</li>)}
            </ul>
          </div>
        )}
        {phase === "ended" && (
          <div className="glass rounded-3xl p-6 text-sm">
            <p className="font-medium">Call ended.</p>
            <p className="mt-1 text-muted-foreground">No information was shared.{savedId && <> <Link href={`/scan/${savedId}`} className="underline underline-offset-4">View saved report</Link>.</>}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
```

`web/src/app/(app)/call-assistant/page.tsx`:
```tsx
import { CallConsole } from "@/components/app/call-console";
import { PageHeader } from "@/components/app/page-header";

export default function CallAssistantPage() {
  return (
    <>
      <PageHeader
        eyebrow="Call Assistant · simulation"
        title="Let Argus pick up"
        subtitle="Play the unknown caller. Argus screens the call live, scores every sentence, and never shares a thing."
      />
      <CallConsole />
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `cd api; .venv/Scripts/python -m pytest -q` then `cd ../web; npx tsc --noEmit; npm run build` — Expected: success.
Manual: caller `1-800-555-0142` → "Call declined" and a call row in history. Blank caller → chat; "Bank PIN scam" chip → risk meter climbs to High risk, reply says the call will end; End & save → saved report link works.

- [ ] **Step 6: Commit**

```powershell
git add api web
git commit -m "feat: live AI call-screening assistant"
```

---

### Task 14: Family & trusted contacts

**Files:**
- Create: `web/src/app/(app)/family/page.tsx`, `web/src/app/(app)/family/actions.ts`, `web/src/components/app/contacts-manager.tsx`

**Interfaces:**
- Consumes: `createClient`, `trusted_contacts` table.
- Produces: server actions `addContact(state, formData)`, `deleteContact(formData)`, `toggleAlerts(formData)`; `<ContactsManager contacts/>`.

- [ ] **Step 1: Implement**

`web/src/app/(app)/family/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ContactState = { error?: string; ok?: boolean } | undefined;

export async function addContact(_: ContactState, formData: FormData): Promise<ContactState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  if (!name) return { error: "Add a name." };
  if (!email && !phone) return { error: "Add an email or a phone number." };
  if (name.length > 100 || (email && email.length > 254) || (phone && phone.length > 32)) return { error: "That's a bit long." };
  const supabase = await createClient();
  const { error } = await supabase.from("trusted_contacts").insert({ name, email, phone });
  if (error) return { error: error.message };
  revalidatePath("/family");
  return { ok: true };
}

export async function deleteContact(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("trusted_contacts").delete().eq("id", String(formData.get("id")));
  revalidatePath("/family");
}

export async function toggleAlerts(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("trusted_contacts")
    .update({ notify_high_risk: formData.get("value") === "true" })
    .eq("id", String(formData.get("id")));
  revalidatePath("/family");
}
```

`web/src/components/app/contacts-manager.tsx`:
```tsx
"use client";

import { useActionState, useEffect, useRef } from "react";
import { BellOff, BellRing, Trash2, UserPlus } from "lucide-react";
import { addContact, deleteContact, toggleAlerts } from "@/app/(app)/family/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Contact = { id: string; name: string; email: string | null; phone: string | null; notify_high_risk: boolean };

export function ContactsManager({ contacts }: { contacts: Contact[] }) {
  const [state, action, pending] = useActionState(addContact, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) formRef.current?.reset(); }, [state]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="glass rounded-3xl p-6">
        <h2 className="font-serif text-2xl">Trusted contacts</h2>
        {contacts.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No one yet. Add a family member who should hear about high-risk scams.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border/60">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-4 py-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-aurora-1/40 to-aurora-3/30 font-serif text-lg">{c.name[0]?.toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
                </div>
                <form action={toggleAlerts}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="value" value={String(!c.notify_high_risk)} />
                  <Button variant="ghost" size="sm" title={c.notify_high_risk ? "Alerts on" : "Alerts off"}>
                    {c.notify_high_risk ? <BellRing className="size-4 text-aurora-2" /> : <BellOff className="size-4 text-muted-foreground" />}
                  </Button>
                </form>
                <form action={deleteContact}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button variant="ghost" size="sm" aria-label={`Remove ${c.name}`}><Trash2 className="size-4" /></Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="glass h-fit rounded-3xl p-6">
        <h2 className="font-serif text-2xl">Add someone</h2>
        <form ref={formRef} action={action} className="mt-4 space-y-3">
          <Input name="name" placeholder="Name" required maxLength={100} />
          <Input name="email" type="email" placeholder="Email" maxLength={254} />
          <Input name="phone" placeholder="Phone" maxLength={32} />
          {state?.error && <p className="text-sm text-risk-high">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}><UserPlus className="size-4" /> Add contact</Button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Alerts are <span className="text-foreground">simulated</span> in this version. Real SMS/email delivery is on the roadmap.
        </p>
      </section>
    </div>
  );
}
```

`web/src/app/(app)/family/page.tsx`:
```tsx
import { ContactsManager, type Contact } from "@/components/app/contacts-manager";
import { PageHeader } from "@/components/app/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function FamilyPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("trusted_contacts").select("id,name,email,phone,notify_high_risk").order("created_at");
  return (
    <>
      <PageHeader
        eyebrow="Family"
        title="Protect the people you love"
        subtitle="Trusted contacts are told when something high-risk reaches you, so nobody faces a scam alone."
      />
      <ContactsManager contacts={(data ?? []) as Contact[]} />
    </>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd web; npx tsc --noEmit; npm run build` — Expected: success.
Manual: add a contact with only a name → "Add an email or a phone number."; add a valid one → appears; toggle bell; delete.

- [ ] **Step 3: Commit**

```powershell
git add web
git commit -m "feat(web): trusted contacts for family protection"
```

---

### Task 15: Final verification, README, demo run-through

**Files:**
- Create: `README.md` (repo root)

- [ ] **Step 1: README**

`README.md`:
````markdown
# Argus: the watcher that never sleeps

An all-in-one security web app. Paste a link, email, text or phone number, or drop a file, and Argus checks it
against real threat intelligence (VirusTotal, URLhaus, MalwareBazaar, Google Safe Browsing, RDAP) plus its own
ML model, then gives one plain-language verdict with the evidence behind it.

## Run it

1. **API keys (all free):** copy `.env.example` to `api/.env` and fill in what you have. Missing keys just show "Not configured".
2. **Web env:** copy `web/.env.example` to `web/.env.local` with your Supabase URL and publishable key.
3. **Install once:**
   ```powershell
   python -m venv api/.venv; api/.venv/Scripts/python -m pip install -r api/requirements.txt
   cd web; npm install; cd ..
   ```
4. **Start:** `./dev.ps1`, then open http://localhost:3000

## Tests

```powershell
cd api; .venv/Scripts/python -m pytest -q
cd ../web; npm test; npm run build
```

## Demo script

1. Landing page → **Get started** → sign up.
2. **Scan** → sample **Phishing link** → HIGH RISK with heuristics, ARGUS intel and domain-age evidence.
3. Sample **EICAR test file** → HIGH RISK (every antivirus flags this harmless test file on purpose).
4. Sample **Spoofed email** → SPF/DMARC failures, reply-to mismatch, the link inside scanned too.
5. Sample **Blocklisted caller** → report a number, rescan, see community reports.
6. **Call Assistant** → answer `1-800-555-0142` (auto-declined), then an unknown caller with the **Bank PIN scam** line.
7. **Overview** → the dashboard has counted everything.

## Layout

- `api/`: FastAPI scanner (stateless; reuses the original `risk_engine.py`)
- `web/`: Next.js app (Supabase auth + Postgres with row-level security)
- `ARGUS-main/`: the original Streamlit prototype, kept for reference
- `docs/superpowers/`: design spec and implementation plan
````

- [ ] **Step 2: Full verification**

Run:
```powershell
cd api; .venv/Scripts/python -m pytest -q
cd ../web; npm test; npx tsc --noEmit; npm run lint; npm run build
```
Expected: everything green. Fix any lint errors.

- [ ] **Step 3: Demo run-through**

Start `./dev.ps1`. Use the `run` skill to walk the README demo script end to end, screenshotting landing, scan verdict (phishing + EICAR), dashboard, call assistant. Confirm: no console errors, no hydration warnings, iris animates, risk colors only on verdict elements, nothing green-hacker-styled.

- [ ] **Step 4: Commit**

```powershell
git add README.md
git commit -m "docs: README with setup, tests and demo script"
```
