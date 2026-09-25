# ARGUS Web App — Design Spec

**Date:** 2026-09-25 · **Demo deadline:** 2026-09-26 · **Audience:** project demo / portfolio

## Goal

Turn the ARGUS Streamlit prototype into an elite-looking web app: an all-in-one
security platform that scans links, files, emails, phone numbers and messages
using **real threat-intelligence sources** plus ARGUS's own ML, with real user
accounts and saved history. Half-built is acceptable; features that aren't
real yet are shown as polished "coming soon" items, never faked as working.

## Architecture

```
web/  Next.js (App Router, TS, Tailwind, shadcn/ui, Motion, anime.js)
  │   pages + server actions; talks to Supabase with the user's session
  │
  ├──► api/  Python FastAPI (stateless scanner, no user data)
  │        reuses risk_engine.py; runs checkers concurrently
  │
  └──► Supabase: Auth (email+password) + Postgres with RLS
```

- **Data flow for a scan:** browser → Next.js server action → `POST api/scan`
  → verdict JSON → server action inserts row into `scans` (RLS: `user_id = auth.uid()`)
  → UI renders verdict. The API never sees user identity.
- **Existing Streamlit app** stays untouched in `ARGUS-main/` as a fallback.
- Runs locally for the demo (`dev.ps1` starts both servers).

## Verdict model (shared by every channel)

Each checker returns a **Signal**:
`{source, status: clean|suspicious|malicious|unknown|unavailable|error, score 0–100, weight, summary, evidence{}}`

The aggregator combines signals with weights into a final **0–100 score** and
the existing bands (SAFE 0–29, LOW/MODERATE 30–59, SUSPICIOUS 60–79, HIGH RISK
80–100). Any `malicious` signal from an authoritative source (VirusTotal ≥3
engines, URLhaus hit, Safe Browsing hit) floors the score at 85.
Response: `{kind, score, level, threat_type, signals[], recommendation, scanned_at}`.

**Resilience:** every external call has a 6s timeout and runs concurrently. A
missing API key → signal status `unavailable` (shown as "not configured"); a
failure → `error`. The verdict always returns using whatever signals succeeded.

## Channels (API)

`POST /scan` with `{input}` (auto-detects kind) or multipart file. `GET /health`.

| Kind | Real checks |
|---|---|
| **url** | URLhaus lookup, Google Safe Browsing v4, domain age via RDAP (no key), heuristics (IP host, punycode, brand typosquat, shorteners, risky TLD), local threat intel |
| **file** | SHA-256 → VirusTotal v3 + MalwareBazaar; local: EICAR signature, double extension (`.pdf.exe`), executable magic bytes, Office macro markers; text content → ML |
| **email** | Parse raw email: SPF/DKIM/DMARC from `Authentication-Results`, From/Reply-To mismatch, display-name spoofing; body → ML + rules; each URL → url checker |
| **phone** | `phonenumbers` validation (valid/country/line type), local blocklist, community report count (passed in by web from Supabase) |
| **text** | Existing ML + keyword rules; embedded URLs and phone numbers checked too |

`POST /call/turn` `{transcript[]}` → `{reply, analysis}` — Call Assistant. Uses
Claude (`claude-sonnet-5`) if `ANTHROPIC_API_KEY` set, else the scripted responder.

## Data (Supabase, all tables RLS-protected per user)

- `scans` — id, user_id, kind, input_preview (≤200 chars), score, level, threat_type, verdict jsonb, created_at
- `trusted_contacts` — id, user_id, name, email, phone, notify_high_risk bool
- `phone_reports` — id, user_id, number (E.164), category, note, created_at; readable by all signed-in users (community data), writable only as self

## Frontend

**Visual direction — "Midnight Aurora":** deep navy-ink background (not black,
never hacker-green), frosted glass panels, soft aurora gradient
(indigo → violet → coral). Headlines in an elegant serif (Instrument Serif),
UI in Geist Sans, data in Geist Mono. Risk colors appear only in verdicts.
**Signature element:** the ARGUS iris — rings of dots animated with anime.js
that drift, "look around", and focus during a scan. Motion handles UI
transitions; anime.js handles showpieces (iris, score count-up, staggered reveals).

**Pages:**
- `/` landing — iris hero, pitch, channel showcase, "coming soon" roadmap, CTA
- `/login`, `/signup` — Supabase auth
- `/dashboard` — stat cards, threats-over-time chart, channel breakdown, recent scans, live feed of own activity
- `/scan` — the "Scan Anything" bar (text/URL/email/phone + file drop) → animated verdict with per-source evidence cards
- `/history` — filterable table of saved scans, click to reopen verdict
- `/call-assistant` — live screening chat with climbing risk meter
- `/family` — trusted contacts CRUD (alerts shown as "simulated" until real delivery is built)

**Priority order** (build in this order; stop wherever time runs out):
1. API scaffold + url/file/text checkers + aggregator
2. Supabase schema + auth + app shell
3. Landing page with iris
4. Scan page + verdict view
5. Dashboard + history
6. Email + phone checkers
7. Call Assistant
8. Family page

## Configuration

`.env.example` at root and in `web/`/`api/`: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ARGUS_API_URL`, `VIRUSTOTAL_API_KEY`,
`GOOGLE_SAFE_BROWSING_KEY`, `ABUSECH_AUTH_KEY` (URLhaus + MalwareBazaar),
`ANTHROPIC_API_KEY`. Real `.env` files are git-ignored.

## Testing

- **API:** pytest for aggregator math, each checker's parsing (HTTP mocked with
  recorded responses), kind auto-detection, and missing-key/timeout fallbacks.
- **Web:** `tsc` + `next build` must pass; manual run-through of the demo
  script (sign up → scan EICAR → scan phishing URL → scan email → dashboard updates).

## Out of scope (shown as "coming soon")

Android live call/SMS screening, Gmail/Outlook connection, browser extension,
real alert delivery (SMS/email/push), public deployment.
