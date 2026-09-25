# ARGUS: complete project handoff for an AI assistant

Written 2026-09-25, the night before a live project demo on 2026-09-26. It describes everything built so far, how it
works, why it was built that way, what's deployed, and what's still open. No secrets are in this file: environment
variable names are listed, values are not.

## TL;DR

- **Argus** is an all-in-one scam and threat checker for links, texts, emails, phone numbers (Caller ID) and files.
  It also scans a Gmail inbox, sends family alerts on Telegram, and has a Chrome/Edge extension. Its own detection
  engine uses free live threat feeds, a safe live visit to the site, look-alike detection, phone-number analysis,
  and two machine-learning models of its own (scam texts, phishing domain names; see §5a). VirusTotal is only an
  optional extra.
- **Stack:**
  - `web/`: Next.js 16 + React 19 + Tailwind v4 + Supabase auth/Postgres.
  - `api/`: Python FastAPI scanning engine.
  - `extension/`: Chrome/Edge extension, Manifest V3.
- **Repo:** https://github.com/gyanvadhel/ARGUS (public), branch `main`. The original Streamlit prototype lives in
  `ARGUS-main/`, kept for reference only.
- **Live site:** https://argus-watcher.vercel.app (Vercel), with the engine on Render at
  https://argus-api-xsea.onrender.com. **Working end to end** (verified 2026-09-26, both ML models live).
- **Core rule from the user: never fake anything.** Unfinished features are shown as "Coming soon". "Safe" is only
  shown when positive evidence verifies it; otherwise the verdict is "No red flags".

---

## 1. The user and their goals

- The user is building Argus for a **project demo on 2026-09-26**. Half-built is acceptable, but nothing may be faked.
- In their words it "HAS to be a super duper crazy webapp": an "ULTIMATE security and antivirus system" that's
  highly interactive. Explicitly **not** a green "hacker" look and **not** a generic "AI slop" look.
- They rejected an earlier AI chat that talked to scam callers (it used Claude). They want **Truecaller-style caller
  ID, "but better"**. Claude/Anthropic is not used anywhere in the product now.
- "We're making everything on our own": Argus's own detection is the core; paid/keyed services are optional extras.
- Based in India: the default phone region is `IN`.
- Communication style: casual and short messages. Sometimes they ask you to use very few tokens. They approve GitHub
  pushes in batches: ask or confirm before pushing, and never push secrets.

---

## 2. Status at a glance (end of 2026-09-25)

**Working locally and tested:**
- Link, text, email, phone and file scanning with evidence-backed verdicts.
- Caller ID with FCC complaint data, community reports, an incoming-call simulator and impossible-number detection.
- Gmail inbox and spam scanning (connected on the user's real account).
- Telegram family alerts. Built and tested up to the bot token: the real Telegram round trip hasn't been verified
  yet.
- The browser extension (warning page, popup, right-click check).
- The landing page with the 3D eye, custom cursor, logo, favicons and link preview card.
- Phone layout: every page audited on Chrome's and Safari's engines at 390, 360 and 320 px wide, with no sideways
  overflow (fixed 2026-09-25; see the grid rule in §6).

**Tests:** API 191 (pytest), web 68 (vitest), extension 5 (node:test). The production build passes. A full browser
rehearsal of the demo script passed.

**Deployed:** the website on Vercel and the engine on Render, both from `main`. See §11.

**Kept "Coming soon" by the user's choice:** Android live call screening, Outlook inbox, SMS/WhatsApp family alerts,
and extension store listings.

---

## 3. Architecture

```
Browser ──> Next.js website (Vercel, region bom1)
              │  server actions / route handlers (the engine is never called from the browser)
              ├──> Supabase Postgres + Auth (project "argus", ap-south-1), row-level security everywhere
              ├──> FastAPI scanning engine (local: 127.0.0.1:8000; planned: Render free tier, Singapore)
              │       └──> live threat feeds, DNS/TLS/page fetches, FCC open data, RDAP, optional VirusTotal
              ├──> Google OAuth + Gmail API (read-only)
              └──> Telegram Bot API (family alerts; outbound only, no webhook)

Chrome/Edge extension ──> the engine directly (/scan/quick and /scan), plus a token if the engine is hosted
```

- The website calls the engine server-to-server with `ARGUS_API_URL`, plus `Authorization: Bearer ARGUS_API_TOKEN`
  when a token is set.
- The engine is stateless apart from its in-memory threat feeds, which are cached on disk in `api/.cache/feeds`.
- All user data (scans, contacts, reports, Gmail connections, alert logs) lives in Supabase, never in the engine.

---

## 4. Repo layout (key paths)

```
api/                         FastAPI engine (Python 3.13 locally; venv in api/.venv, git-ignored)
  argus_api/main.py          routes, token middleware, lifespan (starts feed refresh)
  argus_api/config.py        reads keys from the environment / api/.env (config.key)
  argus_api/http.py          shared HTTP client and the "unavailable"/"error" signal helpers
  argus_api/models.py        Signal and Verdict pydantic models
  argus_api/aggregate.py     combine(): turns signals into one score/level/verified verdict
  argus_api/detect.py        detect_kind(): url / email / phone / text
  argus_api/risk_engine.py   scam phrase rules + local intel CSV (from the prototype; its old 65-example classifier
                             still trains here but the API no longer uses it)
  argus_api/ml/              scam_text.py (text model), phish_link.py (link model)
  argus_api/data/            training data, link_model.npz/.json, threat_intel.csv; DATA_SOURCES.md credits all
  scripts/train_link_model.py  rebuilds the link model from the cached feeds (~4 min)
  argus_api/checkers/        url.py, phone.py, email.py, text.py, file.py, vt.py
  argus_api/intel/           feeds.py (live feeds), netcheck.py (DNS/TLS/page fetch), page.py (page analysis),
                             brands.py (brand domains), fcc.py (FCC complaints)
  tests/                     pytest suite (conftest forces offline mode and region US)
web/                         Next.js 16 app (App Router, src/)
  src/app/                   pages: / (landing), (auth)/login|signup, (app)/dashboard|scan|scan/[id]|caller-id|
                             inbox|history|family, api/gmail/connect|callback, icon.svg, favicon.ico, apple-icon,
                             opengraph-image, manifest.ts
  src/proxy.ts               route guard (Next 16 uses proxy.ts, not middleware.ts)
  src/components/landing/    hero, hundred-eyes, channels, how-it-works, roadmap, cta, nav, footer
  src/components/app/        scan console, verdict view, signal cards, caller ID, incoming call, inbox, contacts...
  src/components/eye/        eye-scene.tsx (3D eye), eye.tsx, watching-eye.tsx (small SVG eyes)
  src/components/fx/         cursor.tsx (custom cursor), magnetic.tsx, reactive-word.tsx
  src/lib/                   api.ts, format.ts, types.ts, detect.ts, gmail.ts, token-box.ts, telegram.ts,
                             family-alerts.ts, community*.ts, pool.ts, use-media.ts, safe-next.ts, stats.ts...
  vercel.json                functions region bom1
extension/                   MV3 extension: background.js, popup, warning page, options, lib/verdict.js (tested)
supabase/migrations/         4 SQL migrations (schema + RLS)
render.yaml                  Render blueprint for the engine
dev.ps1                      starts the engine and the website locally in two PowerShell windows
README.md                    setup, deployment, Gmail/Telegram setup, demo script
ARGUS-main/                  original Streamlit prototype (reference only)
.superpowers/                LOCAL ONLY (git-ignored): browser test scripts and screenshots
```

---

## 5. The scanning engine (`api/`)

### Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | status, which optional keys are set, feed counts and freshness (always open, no token) |
| POST | `/scan` | `{input, kind?, community?, community_reports?, mailbox?}` returns a Verdict. Kind is auto-detected if omitted. |
| POST | `/scan/quick` | instant link verdict with no network visit (address + feeds + reputation); used by the extension |
| POST | `/scan/file` | multipart upload (32 MB engine limit; the website caps uploads at 4 MB for Vercel) |
| GET | `/phone/normalize?number=` | returns `{"e164": "+91…"}`, or `{"e164": null}` when the number can't be read |

If `ARGUS_API_TOKEN` is set, every endpoint except `/health` requires `Authorization: Bearer <token>`. `mailbox` is
`inbox` or `spam` for emails the website fetched from Gmail itself; it changes which links get visited (see below).

### Data model
- **Signal:** `source`, `status` (`clean|suspicious|malicious|unknown|unavailable|error`), `score` 0–100, `weight`,
  `summary`, `authoritative`, `trust` 0–1 (positive evidence), `evidence` dict.
- **Verdict:** `kind`, `subject`, `score`, `level`, `threat_type`, `signals`, `recommendation`, `scanned_at`,
  `verified`.

### Scoring (`aggregate.combine`)
- Only `clean`, `suspicious` and `malicious` signals with weight > 0 count.
- Red flags combine as independent evidence (noisy-OR):
  `safe_odds *= 1 - min(0.97, score/100 * min(1, weight))`, then
  `risk = (1 - safe_odds) * (1 - 0.7 * max_trust)`, where `max_trust` is the highest trust among clean signals.
  Two weak warnings add up, and "found nothing" never dilutes a real warning.
- An authoritative malicious signal floors the score at **85**.
- Levels: SAFE 0–29, LOW/MODERATE 30–59, SUSPICIOUS 60–79, HIGH RISK 80–100, UNVERIFIED (no usable signal at all).
- `verified = level == SAFE and max_trust >= 0.5`.
- UI labels:
  - SAFE and verified: "Safe"
  - SAFE and not verified: "No red flags"
  - LOW/MODERATE: "Low risk"
  - SUSPICIOUS: "Suspicious"
  - HIGH RISK: "High risk"

### Links (`checkers/url.py`)
- **Address rules ("ARGUS heuristics").**
  - Flags: raw IP, `@` tricks, punycode, a brand name on a non-official domain (brand list in `intel/brands.py`,
    including the Indian `.bank.in` domains), an official domain embedded in another, look-alike character swaps.
  - Also flags: bait words (login, verify, secure...), free-hosting platforms (pages.dev, vercel.app, github.io...),
    random-looking names, shorteners, risky TLDs, long or hyphen-heavy names, deep subdomains, plain http.
  - Brand and bait-word rules are skipped for well-known sites (Tranco rank ≤ 100k or official brand domains).
- **"Look-alike check":** compared against the Tranco top 10,000. Catches homoglyph swaps, the same name with a
  different TLD, or one edit away (65; 50 for 5-letter names).
- **"Site reputation":**
  - Official brand domain: trust 0.9.
  - Tranco rank ≤ 10k: trust 0.9. ≤ 100k: 0.6. ≤ 200k: 0.3.
  - Shorteners and publish-anything platforms get no trust.
- **Live feeds** (keyless, `intel/feeds.py`): URLhaus (malware links), OpenPhish (phishing pages),
  Phishing.Database (phishing domains) and Tranco (top 200k).
  - Downloaded into `api/.cache/feeds`. Refreshed when older than 6 h, checked every 30 min by a background thread.
  - Sizes on 2026-09-25: URLhaus 16,466 links, OpenPhish 300 links, Phishing.Database 391,980 domains, Tranco
    200,000 sites. `/health` shows the live counts.
  - An exact URL match is malicious and authoritative.
  - Host/domain matches are ignored for **shared hosts** (shorteners, sites.google.com-style hosts, platform roots,
    the Tranco top 10k), because one bad link on github.com or bit.ly says nothing about the rest.
  - Listed but popular (ranked) sites are downgraded to "suspicious, may have been hacked".
- **Live check** (`intel/netcheck.py`):
  - **DNS:** "This domain doesn't exist" (45) is trusted only after confirming the resolver works; private IPs score 50.
  - **TLS certificate:** invalid scores 55.
  - **Page fetch:** hop by hop (max 5 redirects, 1.5 MB), refusing private/local IPs. It feeds:
    - "Page content" (`intel/page.py`): a login or card/code form pretending to be a brand (60), card/OTP/PIN/ID
      fields (35), a credential form posting off-site (25), obfuscated JS (25), a password form on a little-known site
      (20), an off-site meta refresh (15), strong scam phrases (up to +30, only when the page already scores). A page
      the live check had to stop (e.g. a redirect to a private address) scores 50.
    - "Download check": apps/programs/scripts 70, Mac installers/disk images/shortcuts 60, archives 40, any other
      file 20. Web data types (json, js, pdf) and audio/video/fonts are ignored.
    - "Redirects": off-site to an unknown site scores 20; to a well-known site it's clean.
    - "After redirect: …": the destination gets its own address, feed and reputation signals, and the origin's trust
      is dropped (trust comes from where a link lands).
- **Optional keyed:** URLhaus API, Google Safe Browsing, VirusTotal (1 engine = 20, 2 = 45, ≥ 3 = malicious and
  authoritative), RDAP domain age (< 30 days = 65, < 180 days = 35).
- **Safe visiting of links found in mail** (`visit_decision`):
  - Links the user pastes are always visited.
  - For Gmail inbox mail, links that look one-time (unsubscribe, verify, reset, magic, token=, …), shorteners and
    well-known sites are not opened.
  - Spam links are never opened.
  - A "Page visit" signal explains why a page wasn't opened. DNS, certificate, feeds and reputation still run.

### Phone numbers (`checkers/phone.py`, `intel/fcc.py`)
- **Parsing:** Google's libphonenumber with the default region `ARGUS_DEFAULT_REGION` (`IN` live; tests use `US`).
  If an 11-digit number starting with "1" isn't valid in the home region but is a valid North American number, it's
  read as American (so `1-877-…` still works with region IN).
- **"Number validation":** an impossible number scores 70 ("Not a real phone number: <reason>", e.g. more than 15
  digits or a fake country code). Unassigned scores 55, VoIP 35, premium-rate 45.
- **"Callback trap check":** one-ring (wangiri) country codes and Caribbean area codes that look domestic (+1 876
  Jamaica etc.) score 50.
- **"ARGUS blocklist":** the prototype's CSV. It only has two fictional 555 numbers; demo samples no longer rely on it.
- **"Community reports":** Argus users' reports from Supabase `phone_reports`.
  - ≥ 5 reports, mostly Scam/Fraud: 92, authoritative.
  - ≥ 3 reports: 85 (scam-heavy) or 60 (spam).
  - 1–2 reports: 45.
- **"Seen in scam messages":** numbers found in high-risk scanned texts/emails (`phone_sightings`). ≥ 3 sightings
  score 80, otherwise 55.
- **"FCC complaints (US)":** US/Canadian numbers only, from the FCC open data Socrata dataset `3xyp-aqkj`
  (keyless). Issue "Unwanted Calls", several number formats, up to 200 rows, cached 6 h.
  - ≥ 10 complaints: 90, authoritative. 5–9: 80. 2–4: 60. 1: 40.
  - "None in the past year": 25.
  - Complaints aren't proof (caller IDs get spoofed), which is why count and recency decide the weight.
- **No public spam database exists for Indian numbers,** so +91 numbers rely on the checks above and Argus reports.

### Emails (`checkers/email.py`)
- **Sender signal:**
  - SPF/DKIM/DMARC results come from the top `Authentication-Results` header.
  - Also flagged: a Reply-To pointing to another domain, a display name showing a different address, and a brand
    claim from a non-brand domain.
  - A different bounce domain only counts when DMARC didn't pass.
- **Trust 0.8** (positive evidence) when authentication fully passes and the sender is an official brand domain or a
  Tranco top-100k site. Free-mail domains (gmail.com, outlook.com, …) never earn trust.
- **Body:** the scam-text model (with the stricter email bar, §5a), scam phrase rules, phone numbers
  (blocklist + FCC), and up to 3 links (with the mailbox visit rules).

### Texts (`checkers/text.py`)
- The scam-text model (§5a), scam phrase rules, the local intel CSV, phone numbers and links.
- **Trust 0.6** only when every link goes to a verified site and nothing else is flagged.

### Files (`checkers/file.py`)
- **Local inspection:** EICAR test signature (100, authoritative), disguised extensions like `.pdf.exe` (60), a
  Windows program inside a non-exe (50), Office macros (35), auto-running PDF scripts (25), any other file type that
  can run code, like `.exe` or `.js` (25). Points add up, capped at 100.
- **VirusTotal hash lookup** (optional key). Trust 0.6 when the file has been known ≥ 30 days, has 0 detections and
  ≥ 50 engines analysed it, **and** the local inspection is clean (a good reputation never excuses a disguised
  file).
- MalwareBazaar (optional key), and the scam-text model on text contents (weight 0.5, stricter bar).

### 5a. Argus's own machine-learning models (added 2026-09-26)
Both are real models trained on real data, with honest held-out scores; neither is a stand-in.

**Scam-text model** (`ml/scam_text.py`, signal "ARGUS ML model"; used for texts, email bodies, file contents)
- Data (5,730 messages): the public **SMS Spam Collection** (5,574 real texts from the UK and Singapore), the
  prototype's 65 hand-written examples, and ~90 **hand-written Indian messages**. The Indian set covers bank
  alerts, OTPs and deliveries, plus KYC, power, job, parcel and lottery scams. It exists because the collection
  alone flagged ordinary Indian bank alerts as spam (95%).
- Method: TF-IDF word pairs plus 2-5 character pieces, then logistic regression. Digits are all read as 0, so it
  learns the wording, not the amounts. Trains in about 3 s at startup; the lifespan hook warms it in a thread.
- **Held out (1,146 messages it never saw): 98% precision, 91% recall, 98.4% accuracy** (`scam_text.evaluate()`).
- Separately, 20 messages were written after training: it caught 8/10 scams and flagged 0/10 normal ones. It
  missed a fake job offer and a "stuck abroad, send money" plea (other checks still apply).
- Flags at **0.6** for texts. Emails and documents need **0.8**: on them it's less sure (real newsletters and bank
  emails scored up to 0.61, scam emails 0.89+).

**Phishing-link model** (`ml/phish_link.py`, weights `data/link_model.npz`, card `data/link_model.json`, signal
"ARGUS ML (link)")
- Reads only the **registered domain** (e.g. `paypal-security-alert.net`) as 3-5 letter pieces hashed into 2^20
  features, then logistic regression.
- Trained on about 153k phishing domains (Phishing.Database + OpenPhish, one per registered domain) and 450k
  legitimate domains sampled across the **Tranco top 1M**. Pages on publish-anything platforms are left out.
- Held out (~30k phishing, ~90k legitimate domains it never saw): AUC 0.866. At its **0.95** threshold:
  **0.13% false alarms** (0.14% on sites ranked 500k-1M), 98.5% precision on the balanced test, and it catches
  **~26%** of phishing domains by name alone.
- It's a careful second opinion: flagged gives score 60 × weight 0.8, so on its own at most "Low risk".
- It's skipped for: ranked or official sites, publish-anything platforms, and IPs.
- **Lessons (don't undo):**
  - Training on full hostnames made it learn "any vercel.app/github.io page = phishing". `argus-watcher.vercel.app`
    scored 100%.
  - Using only the top 200k as legitimate made long everyday names look like phishing.
  - Small-business names (e.g. `rkpuramdentalclinic.com`) still score up to ~0.9, below the 0.95 bar. That's why
    the threshold is high.
- Retrain with `scripts/train_link_model.py` when the feeds have moved on. Check the printed table before
  committing the new weights.

### Engine gotchas
- The tests run offline: `conftest.py` sets `ARGUS_OFFLINE=1`, deletes key env vars and `ARGUS_API_TOKEN`, and sets
  the region to US. `respx` mocks HTTP.
- In offline mode the lifespan hook only loads the feed cache; otherwise it starts the refresher thread.
- Render's free plan has 512 MB of RAM. `render.yaml` sets `OPENBLAS_NUM_THREADS=1` and `OMP_NUM_THREADS=1` to
  keep numpy's buffers small. Memory use on Render hasn't been measured yet; if the service dies with an
  out-of-memory error, look there first.

---

## 6. The website (`web/`)

### Pages and features
- **Landing (`/`):**
  - A React Three Fiber 3D eye that follows the cursor, blinks, changes mood (idle / watching / scanning / safe /
    danger, lid angles in `eye-scene.tsx`), and dives into the pupil on scroll.
  - **Hero "line of sight" search:** a hairline field with a watching eye, a condensed CHECK button and a live
    "Reads as a link/phone number/…" hint. It runs a no-account preview scan (`app/preview-actions.ts`).
  - Sections: "A hundred eyes", "What it watches" (hover rows showing real engine verdict snapshots), "Evidence, not
    guesswork" (a real verdict figure), "Coming next" (roadmap), CTA, footer.
  - A custom cursor (fine pointers only): a small eye that looks where you move and blinks on click, becoming corner
    brackets that "lock on" to clickable elements.
  - Film grain overlay.
  - On phones: the eye sits lower on portrait screens, with a shorter placeholder.
- **Auth:** Supabase email/password (`(auth)/login`, `(auth)/signup`). `proxy.ts` guards the app routes.
  `safe-next.ts` validates `?next=`.
- **Dashboard:**
  - Stats: total, threats, high risk, and "No red flags" with a verified-safe count.
  - A 14-day chart, a breakdown by channel, and the 10 most recent scans.
  - **Protection status:** live feed counts and freshness, built-in checks, extra services. It says "waking up"
    when a hosted engine sleeps.
- **Scan:**
  - Paste anything or drop a file (≤ 4 MB), with samples: Phishing link, Scam text, Spoofed email, Reported
    robocaller, EICAR test file, Safe message.
  - Shows a score dial, the honest level label, and evidence cards ("Vouches" marks positive evidence).
  - `?input=<link>` pre-fills and auto-runs link scans (used by the extension).
  - A toast appears when family was alerted on Telegram.
- **Scan detail (`/scan/[id]`):** the full evidence page for any past scan.
- **Caller ID:**
  - Look up any number: verdict word (score ≥ 80 Likely scam, ≥ 60 Suspicious, ≥ 30 Be careful, otherwise Looks
    safe when verified or No red flags), location, carrier, line type, community name tags and categories, recent
    reports.
  - A report/tag form, shown only for real, reportable numbers (a faked caller ID has no real line to report).
  - The **incoming-call simulator** ("Simulate a call from this number": phone UI, eye reacting to risk, Block and
    report / Decline / Answer). When the number is high-risk it sends a real Telegram alert to connected contacts,
    and the alert says "(This was a simulated call in the Argus demo.)".
- **Inbox:**
  - Gmail connect (OAuth, read-only) with **Inbox** and **Spam** tabs. Spam shows what Gmail caught, with Argus's
    reasons.
  - Checks the 12 latest emails, 3 at a time. Already-checked emails show saved verdicts (`mail_scans`).
  - "Check again" re-checks everything; Disconnect revokes at Google.
- **History:** every scan, filterable by kind.
- **Family:**
  - Trusted contacts, each with an alert on/off toggle.
  - **Connect Telegram** via a QR code or link (`t.me/<bot>?start=<code>`). The page polls `getUpdates` until the
    contact presses Start, then sends a welcome message.
  - Test alert, disconnect, and a recent-alerts log.

### Family alerts (`lib/family-alerts.ts`, `lib/telegram.ts`)
- **Sent for:**
  - high-risk scans (score ≥ 80)
  - high-risk emails that reach the Gmail **inbox** (never for spam)
  - high-risk simulated calls
- **Privacy:** an alert says what kind of thing it was and how risky. It never includes what messages or emails
  said, and link hosts are defanged (`paypal-security-alert[.]net`).
- **Dedupe and logging:** the same subject isn't re-alerted within 10 minutes. Every alert is logged in
  `family_alerts`.
- **No token, no alerts:** without `TELEGRAM_BOT_TOKEN`, nothing pretends to send; the UI says nobody was alerted.

### Gmail (`lib/gmail.ts`, `app/api/gmail/*`, `app/(app)/inbox/*`)
- **Sign-in:** OAuth with the `gmail.readonly` scope, offline access and a consent prompt. A one-time state value
  lives in an httpOnly cookie (path `/api/gmail`).
- **Token storage:** refresh tokens are sealed with **AES-256-GCM** (`lib/token-box.ts`, key `GMAIL_TOKEN_KEY`)
  before going into `mail_connections`. Access tokens are cached in memory for about 50 minutes.
- **What the engine receives:** each email is converted to a compact RFC 822 message and scanned with
  `mailbox: inbox|spam`. The message keeps only the headers used for judging, plus text and HTML bodies capped at
  30,000 characters each, with no attachments. The engine accepts up to 100,000 characters per input.
- **Testing mode:** the Google app is in testing mode. Only listed test users can connect, and they must reconnect
  every 7 days.

### Other conventions
- **UI kit:** shadcn with Base UI, which has **no `asChild`**; put `buttonVariants()` on a `<Link>`. Toasts use sonner.
- **Grids need an explicit phone layout:** every `grid` gets `grid-cols-1` (which is `minmax(0,1fr)`), and custom
  tracks use `minmax(0,1fr)`, not `1fr`. A grid with only `lg:grid-cols-*` gets a content-sized column on phones,
  and one long line of text or a chart pushes the whole page sideways. That was the cause of the phone bug on
  2026-09-25.
- **App shell:** desktop has a sidebar (nav, account, Sign out). Phones get an account row (logo, email, Sign out)
  and a pinned six-tab bar that always fits the screen (`MobileNav` in `components/app/sidebar.tsx`).
- **Server-only code:** marked with `import "server-only"`, which vitest stubs via its config alias.
- **Upload limit:** capped at 4 MB, because Vercel limits request bodies to 4.5 MB.
- **Time limits:** scan pages export `maxDuration = 60`.
- **`lib/api.ts`:** sends the token, and turns a hosted engine's timeouts into "waking up" messages.

---

## 7. Browser extension (`extension/`)

- **Background:** on each top-level navigation, calls `/scan/quick` (instant). If the score is ≥ 60, it swaps the tab
  to `warning.html` ("Argus stopped this page", with reasons, "Back to safety" / "Continue anyway"; continuing allows
  the host for the session). It never blocks browsing when the engine is down, and never checks private or local
  pages.
- **Popup:** instant verdict, then the full check, plus "Check another link" and "See the full evidence in Argus"
  (opens `/scan?input=`).
- **Right-click menu:** "Check this link/page with Argus". The toolbar badge shows "!" for risky and ✓ for verified.
- **Options:** engine URL (default `http://127.0.0.1:8000`), web app URL, access token (for a hosted engine), and a
  protect toggle.
- **Host permissions:** localhost, 127.0.0.1 and `https://*.onrender.com/*`.
- **Install:** `chrome://extensions` or `edge://extensions` → Developer mode → Load unpacked → `extension/`. Tests:
  `cd extension; npm test`.

---

## 8. Database (Supabase)

Project **"argus"**, id `yvcxqwrgizfmzgohnezj`, region ap-south-1. The schema is in `supabase/migrations/` (4
files). **RLS is on for every table**; policies use `(select auth.uid()) = user_id`.

| Table | Purpose / notes |
|---|---|
| `scans` | every verdict: kind, input_preview (≤ 200 chars), score, level, threat_type, `verdict` jsonb (includes `verified`) |
| `trusted_contacts` | name, email, phone, notify_high_risk, `telegram_chat_id`, `telegram_name`, `telegram_code` (one-time link code) |
| `phone_reports` | community reports: number (E.164), category (Scam/Spam/Robocall/Fraud/Other), note, name_tag. One per user per number. Any signed-in user can read (it's community data); users insert/delete their own. |
| `phone_sightings` | numbers seen in high-risk scanned texts/emails, one per user, number and channel. Any signed-in user can read; users insert their own. |
| `mail_connections` | one Gmail connection per user: email, **sealed** refresh token |
| `mail_scans` | (user, gmail message id) → scan id, so checked emails show saved verdicts |
| `family_alerts` | log of alerts sent or failed: contact, kind (scan/call/test), subject, score, status |

- The only security advisory is optional: "Leaked password protection" is off (a Supabase Auth dashboard toggle).
- **Test data hygiene:** browser test runs with the demo tester account create `phone_reports`/`phone_sightings`
  rows. Delete them afterwards so the demo samples stay clean:
  ```sql
  delete from public.phone_reports
   where user_id = (select id from auth.users where email = 'argus.demo.tester@gmail.com');
  delete from public.phone_sightings
   where user_id = (select id from auth.users where email = 'argus.demo.tester@gmail.com');
  ```

---

## 9. Environment variables (names only; never commit values)

**`api/.env`** (git-ignored; on Render, set in its dashboard):
| Name | Purpose |
|---|---|
| `VIRUSTOTAL_API_KEY` | optional: 70+ antivirus engines for links and files (free tier: 4 lookups/min) |
| `GOOGLE_SAFE_BROWSING_KEY`, `ABUSECH_AUTH_KEY` | optional extras (not set) |
| `ARGUS_DEFAULT_REGION` | `IN` (the region for numbers typed without a country code) |
| `ARGUS_API_TOKEN` | set only when hosted; then every endpoint except /health requires it |
| `ARGUS_OFFLINE` | `1` disables all live network checks (used by tests) |

**`web/.env.local`** (git-ignored; on Vercel, Settings → Environment Variables):
| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase |
| `ARGUS_API_URL` | engine address (`http://127.0.0.1:8000` locally; the Render URL in production) |
| `ARGUS_API_TOKEN` | the engine token (empty locally) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the Gmail OAuth client (the user created it in Google Cloud) |
| `GMAIL_TOKEN_KEY` | 32 random bytes, base64. It seals Gmail refresh tokens; keep it the same everywhere or existing connections break. |
| `APP_URL` | the site's own address (OAuth redirect base and link-preview metadataBase) |
| `TELEGRAM_BOT_TOKEN` | the family-alert bot from @BotFather |

---

## 10. Running locally

```powershell
# once
python -m venv api/.venv; api/.venv/Scripts/python -m pip install -r api/requirements.txt
cd web; npm install; cd ..
# every time
./dev.ps1        # engine on :8000, website on :3000 (two PowerShell windows)
```
- The first engine start downloads about 20 MB of threat feeds in the background.
- **Tests:**
  - `cd api; .venv/Scripts/python -m pytest -q`
  - `cd web; npm test; npm run build`
  - `cd extension; npm test`
- **Browser tests** (local only, in git-ignored `.superpowers/e2e/`, using playwright-core with the Edge channel):
  - The main ones: `rehearsal.mjs` (the whole demo), `mobile.mjs`, `callerid.mjs`, `scan.mjs`, `hero-new.mjs`,
    `extension.mjs`, `gmail.mjs`, `family-telegram.mjs`, `verdicts.mjs`, `pages.mjs`, `prod-check.mjs <url>`
    (production smoke test), and `make-logo.mjs` (regenerates every logo asset from `logo-marks.mjs`).
  - These scripts contain the demo tester's credentials, which is why they're git-ignored.
- **Demo tester account:** `argus.demo.tester@gmail.com` (email/password sign-in), used by the browser tests and
  for demo logins. It has no Gmail connected. Its password is deliberately not in this file or anywhere in the
  repo. It's only in the git-ignored `.superpowers/e2e` scripts on the user's machine; otherwise ask the user.
  Never commit it.

---

## 11. Deployment (free): current state and what's left

- **GitHub:** `main` auto-deploys to Vercel on every push. An old local branch, `feat/argus-webapp`, is a stale
  subset of main; ignore it.
- **Vercel (website):**
  - Team slug `gyanvadhels-projects`, project **argus** (`prj_j1FcglpTGNskR90khJKmspsZ0Kf7`).
  - **Root Directory `web`, framework Next.js**, functions in `bom1`.
  - Domains: **argus-watcher.vercel.app** (primary) and argus-pi-opal.vercel.app.
  - Env vars set (checked 2026-09-26, names only):
    - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
    - `ARGUS_API_URL`: set on 2026-09-26 to **https://argus-api-xsea.onrender.com** (production + preview). A new
      deployment is needed for it to take effect.
    - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_KEY`, `APP_URL`, `TELEGRAM_BOT_TOKEN`
    - Engine-only variables the website never reads: `VIRUSTOTAL_API_KEY`, `GOOGLE_SAFE_BROWSING_KEY`,
      `ABUSECH_AUTH_KEY`, `ARGUS_DEFAULT_REGION`. They're marked Sensitive, so their values can't be read back. The
      engine gets its own copies on Render.
  - `ARGUS_API_TOKEN`: set by the user (Sensitive, production only). Live scans verified on 2026-09-26.
  - Vercel flags `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_KEY` and `TELEGRAM_BOT_TOKEN` as "readable-secret": they
    should be re-added as Sensitive.
  - The first deploys were built from the repo root by mistake; fixed on 2026-09-25 by setting the Root Directory.
- **Render (engine): deployed 2026-09-26 at https://argus-api-xsea.onrender.com.**
  - `/health` is OK with feeds loaded. `/scan` correctly demands the token.
  - VirusTotal is on there (the user added `VIRUSTOTAL_API_KEY` on Render).
  - `argus-api.onrender.com` (no suffix) is **someone else's** Node app ("Argus backend is live"); Render names are
    first come, first served.
  - The engine auto-deploys from GitHub `main`. The ML models were confirmed live there on 2026-09-26
    (`.superpowers/e2e/prod-ml-check.mjs`).
  - The blueprint `render.yaml` defines a free web service:
  - name `argus-api`, region singapore, rootDir `api`
  - build `pip install -r requirements.txt`
  - start `uvicorn argus_api.main:app --host 0.0.0.0 --port $PORT`, health check `/health`
  - a generated `ARGUS_API_TOKEN`, a `VIRUSTOTAL_API_KEY` prompt, `ARGUS_DEFAULT_REGION=IN`, and the OpenBLAS/OMP
    thread limits
  - It sleeps after 15 min idle; the first request after that takes about a minute, and the website shows "waking up".
- **Remaining steps:**
  1. ~~Render Blueprint~~ (done). ~~Vercel `ARGUS_API_URL`~~ (done).
  2. ~~Vercel `ARGUS_API_TOKEN`~~ (done).
  3. Google Cloud OAuth client: add `https://argus-watcher.vercel.app/api/gmail/callback` as a redirect URI.
  4. Supabase Auth URL configuration: Site URL `https://argus-watcher.vercel.app`, and add it to the redirect URLs
     (keep localhost).
  5. Optional: mark the Vercel secrets as "Sensitive". In the extension options, point to the Render URL and token.
- **What still works while Render sleeps:** the landing page, auth, dashboard stats, history and evidence pages, the
  Family page, and Gmail connect. Everything that scans pauses until the engine wakes.

---

## 12. Design system and copy rules

- **Colour:**
  - A monochrome world: background `#08080a`, bone text `#ece6dc`, muted `#8f8b93`, hairlines at `rgb(236 230 220 / 0.1)`.
  - Colour appears **only** in the eye, the data and the verdicts.
    - Risk colours: safe `#5ed3b0`, "no red flags" `#9cb8b0`, low `#f5c451`, suspicious `#ff9f4d`, high `#ff5d6c`,
      unknown `#8f8b93`.
    - Eye/"aurora" colours: `#6d6bff`, `#a66bff`, `#ff8a7a`.
- **Type:** Archivo variable (with a width axis).
  - The `font-display` utility: stretch 62%, weight 860, uppercase (the ARGUS wordmark, big verdicts).
  - The `.font-serif` class is actually condensed Archivo (74%, weight 700) for headings.
- **Signature elements:** the 3D eye, small SVG `WatchingEye`s that track the cursor and blink (`logo` prop gives the
  brand gradient iris), the lock-on eye cursor, and the "line of sight" hairline inputs with a scan sweep.
- **Logo:** a bone almond eye on black with a violet-to-coral iris.
  - A bold mark for favicons (`icon.svg`, `favicon.ico`), and a fine mark (dotted iris, glowing pupil ring) for the
    larger app icons (`apple-icon.png`, `icon-192/512.png`, the maskable icon).
  - Assets: `web/src/app/icon.svg`, `favicon.ico`, `apple-icon.png`, `opengraph-image.png` (1200×630),
    `web/public/icon-*.png`, and the extension icons.
- **Copy:** plain words, sentence case, and verbs on buttons.
  - No "→" in buttons, no middle-dot meta strings, no ALL-CAPS eyebrow labels.
  - Errors say what happened and what to do.
  - Never overclaim.

---

## 13. Honesty rules and key decisions (why things are the way they are)

- **Honesty rules:**
  - **Never fake.** Unfinished features say "Coming soon", and simulated things say "simulated".
  - Landing-page examples are snapshots of verdicts the engine really returned.
  - Demo samples use real data: an FCC-reported robocaller and a published line with no complaints.
- **"Safe" needs positive evidence;** otherwise "No red flags". This came after the user found suspicious sites
  scored "safe" and a 20-digit number scored "safe".
- **Detection engine decisions:**
  - **Noisy-OR instead of averaging:** averaging diluted real warnings with "found nothing" results.
  - **Shared-host rules:** real feeds list bit.ly, tinyurl, github.com and sites.google.com because of single bad
    links, which caused false alarms.
  - **Page-analysis limits:** a news page mentioning "Microsoft", or a search box posting elsewhere, used to count as
    phishing. Brand checks now look at the title, or at pages that ask for secrets.
  - **Link-visit rules for mail:** visiting unsubscribe/verify/reset/magic links can use them up, and visiting spam
    links tells spammers the address is live.
- **Product decisions:**
  - **Gmail Spam tab:** Gmail already filters most phishing, so the inbox is mostly clean. The Spam tab shows what
    Gmail caught, with explanations Gmail doesn't give.
  - **Telegram for family alerts:** it's free and instant. Indian SMS needs DLT registration, which takes days.
  - **Render for the engine:** it's a long-running process (in-memory feeds, background refresh, ML model), which
    doesn't suit Vercel's serverless functions.
  - **Caller ID over an AI chat:** the user rejected the AI call assistant.

---

## 14. Demo script and sample inputs

- **Landing:**
  - Move the cursor and the eye follows.
  - "a phishing link" gives High risk 99. "a fake number" (+999 123 4567) gives Suspicious 70.
  - Scroll to dive into the pupil, then hover the "What it watches" rows.
- **Scan** (every result below was re-checked against the local engine on 2026-09-25):
  - Phishing link (`http://paypal-security-alert.net/verify-account`): High risk 99.
    - Be accurate about why. The address rules alone give 82 ("Mentions PayPal but isn't an official PayPal
      domain"). The domain is also on the prototype's built-in demo list (`api/argus_api/data/threat_intel.csv`, 90),
      and the two combine to 99. Live feeds didn't catch it; don't say they did.
  - Scam text, Spoofed email and EICAR test file: High risk 100 each.
  - Safe message: No red flags 0 (not "Safe": a chat message has no positive evidence to verify).
  - `https://www.google.com`: **Safe** 0, verified.
- **Caller ID samples:**
  - Reported robocaller `+1 877-556-9255`: Likely scam 90. The evidence is 25 real FCC complaints, mostly
    robocalls about "Google Listings" and "IRS" services, the latest within days.
  - Faked caller ID `+999 123 4567`: Suspicious 70 (not a real country code).
  - One-ring trap `+232 76 123456` (Sierra Leone), and Look-alike area code `+1 876 203 4567` (Jamaica): Be careful 50.
  - Ordinary number `+1 202-707-5000` (Library of Congress): No red flags 0.
  - An Indian mobile typed without +91 (`98765 43210`): read as +91 98765 43210, No red flags 0.
  - Made-up invalid Indian numbers (`+91 98765 4321`, `+91 55555 55555`): Be careful 55 ("isn't assigned to
    anyone").
- **Simulate a call:** use it on the robocaller; connected Telegram contacts get an alert while it rings.
- **Inbox:** use the user's own account (the tester account has no Gmail connected). Show the Inbox and Spam tabs.
- **Extension:** open `http://paypal-security-alert.net/verify` to get the warning page.
- **Overview:** dashboard counts and the live feeds panel.

---

## 15. Known limitations

- **Phone data:**
  - No public spam list for Indian numbers exists.
  - FCC data covers only +1 numbers.
  - Community reports start empty, since there are no real users yet.
- **Gmail:** testing mode means test users only and reconnecting every 7 days. Opening it to everyone needs Google's
  restricted-scope verification, which takes weeks.
- **Free hosting:**
  - Render sleeps (about 1 min to wake).
  - The VirusTotal free tier allows 4 lookups/min (it shows "unavailable" when rate-limited).
  - Vercel caps uploads at 4 MB.
- **Not built** (the landing page's "Coming next" list): "Live call screening" (an Android app), "Outlook inbox",
  "Family alerts by SMS and WhatsApp", "Extension in the stores".
- **Telegram:** family alerts are unit- and browser-tested without a bot. The live Telegram round trip (QR, then
  Start, then welcome, then alert) still needs a check with the real bot token and a phone.
- **Machine learning:**
  - The text model's Indian coverage rests on ~90 hand-written examples, not a real Indian dataset.
  - Social-engineering pleas with no spammy wording ("stuck abroad, send money") can slip past it.
  - The link model sees only the domain name, so it catches about a quarter of phishing domains alone. It's kept
    deliberately cautious because descriptive small-business names look similar.

---

## 16. Gotchas (Windows environment)

- **Dev server restarts:** stopping a background `npm run dev` shell leaves the Node child alive, keeping port 3000
  busy. Find the PID and `Stop-Process` it.
- **Engine reloads:** `uvicorn --reload` is unreliable on Windows, so restart the engine after Python changes.
- **Git Bash path mangling:** it rewrites arguments that start with `/`. Prefix commands with `MSYS_NO_PATHCONV=1`.
- **File encodings:** when editing files with curly quotes from Python, use `encoding="utf-8"`.
- **React effects:** React dev mode runs effects twice. Side-effecting server actions in effects (like sending an
  alert) are deferred with `setTimeout` + `clearTimeout`.
- **Lint rule:** `react-hooks/set-state-in-effect` is on. For media queries, use `useSyncExternalStore`
  (`lib/use-media.ts`).
- **Stale types:** after deleting pages, remove `web/.next/types` if types go stale.
- **Phone-width checks:** compare page width with the device width, never with `window.innerWidth`. Phone browsers
  widen their viewport to fit overflowing content, which hides the bug; an earlier check passed this way while the
  landing page was 677 px wide on a 390 px phone. Use `.superpowers/e2e/mobile-audit.mjs [widths…]`; add
  `ENGINE=webkit` for Safari's engine (Playwright's WebKit is installed on this machine).

---

## 17. Next steps (suggested order)

1. ~~Token, push, deploy~~ (done 2026-09-26). Re-verify any time with
   `.superpowers/e2e/prod-check.mjs https://argus-watcher.vercel.app`.
2. Add the production Gmail redirect URI in Google Cloud and the Site URL in Supabase.
3. Test the Telegram flow end to end with the real bot token and a phone.
4. Before the demo: open the site a couple of minutes early to wake Render. Clean test data with the SQL above.
5. Optional: Supabase leaked-password protection, and marking Vercel secrets as Sensitive.
