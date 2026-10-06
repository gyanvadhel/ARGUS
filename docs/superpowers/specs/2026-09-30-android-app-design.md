# Argus for Android — Design Spec

**Date:** 2026-09-30 · **Status:** approved in conversation, awaiting review of this document

## Goal

A "nice" native Android app for Argus that anyone can install from a link (no Play Store for now). It protects the
phone in the background — warnings for scam calls, scam texts and scam sites — and puts Argus's checks one tap away.
Everything else (History, Family, Caller ID, Inbox, dashboard) is the existing website at https://askargus.app,
opened inside the app already signed in.

Same rules as the website: **free**, **never fake anything** ("Safe" only with positive evidence, otherwise "No red
flags"; a source that didn't answer says so), monochrome with the living eye.

**Success:** someone you send the link to can install Argus, sign in and switch protection on in about a minute, and
then gets real warnings about scam calls, texts and sites, without noticeable battery drain.

## Decisions (and why)

| Decision | Why |
|---|---|
| Shared as APK files on GitHub Releases; no Play Store for now | The user's choice; free |
| For anyone the user shares it with | The user's choice; so setup explains itself and works on many phones |
| **One "Argus" app for everyone + an optional "Argus SMS helper" add-on** | Play Protect in India blocks installing, from a link/WhatsApp/file manager, any APK that declares SMS-reading permissions. Keeping them out of the main app means everyone can install it; the helper is installed over USB by those who want automatic text checks |
| Sign-in optional | The site blocker and QR/screenshot reading work on the phone alone. Anything that uses Argus's servers (calls, texts, link checks, Gmail, history, family) needs an account, so free limits stay fair |
| Native app + website pages inside it (not a wrapped website, not a full rebuild) | Google blocks its sign-in inside wrapped web pages; a full rebuild doubles all work |
| Kotlin + Jetpack Compose (not Flutter/React Native) | Every chosen feature is an Android-only system feature; there is no iPhone equivalent to share code with |
| No contacts upload, no Truecaller-style names for strangers | Uploading people's address books without their consent is what Argus exists to protect against (and India's DPDP Act requires consent). Argus shows what the number *is* and what users reported instead |
| Family circle included, as the last phase | Scammers mostly target parents and grandparents; the person installing Argus is usually protecting them |

## Architecture

```
Android phone                                   askargus.app (Vercel, Next.js)          Render
┌──────────────────────────────┐   HTTPS +     ┌──────────────────────────────┐       ┌──────────┐
│ Argus app (app.askargus)     │  Supabase     │ /api/app/*  (new)            │──────►│ engine   │
│  Compose UI (home, scanner,  │  access token │ /api/blocklist (public, CDN) │       │ /scan    │
│   activity, settings)        │──────────────►│ /api/app/latest (public)     │       │ /blocklist│
│  Call screening service      │               │ website pages (Chrome tab)   │       └──────────┘
│  DNS-only VPN (site blocker) │◄──── FCM ─────│ Firebase push (family)       │
│  WorkManager jobs            │               └──────────────┬───────────────┘
│  ML Kit (QR + text, on phone)│                              │ RLS as the user
│  Room (activity, on phone)   │                              ▼
└──────────────▲───────────────┘                        Supabase (auth + Postgres)
               │ signature-protected broadcast
┌──────────────┴───────────────┐
│ Argus SMS helper (optional)  │  receives SMS, passes it to Argus; nothing else
└──────────────────────────────┘
```

- **Repo:** new `android/` folder with two Gradle modules: `app` (package `app.askargus`) and `smshelper`
  (package `app.askargus.smshelper`), both signed with the same release key.
- **Android versions:** minimum Android 8 (API 26). Call warnings need Android 10 (API 29); on older phones that
  switch says "Needs Android 10". Target/compile the newest stable API level available when building.
- **Libraries:** Jetpack Compose (Material 3, restyled), Room, WorkManager, DataStore with values encrypted by a key
  in the Android Keystore, OkHttp + kotlinx.serialization, CameraX, ML Kit barcode scanning and text recognition
  (Latin + Devanagari, **bundled** so they work offline and without Google services), androidx.browser (Custom Tabs /
  Trusted Web Activity), Credential Manager + Google ID, Firebase Cloud Messaging (phase 6 only).

## What people see

- **First launch:** welcome with the eye → **"Choose your protection"** (one switch each: call warnings, scam-site
  blocker; SMS checks appear when the helper is installed). Android's permission prompt appears only when a switch is
  turned on → a battery step on phones known to kill background apps (Xiaomi, Oppo, Vivo, Realme, Samsung…): "Let
  Argus run in the background" opening the right settings screen → **sign in** (Google one-tap or email) or **"Skip
  for now"**.
- **Home:** the eye (blinks, follows touch, mood = protection state), a status line ("Watching calls and sites" /
  "Call warnings are off"), one card per protection with today's numbers ("12 calls checked · 1 warning", "3 scam
  sites blocked", "Gmail checked 20 min ago"), quick actions **Scan QR · Read screenshot · Check copied link · Paste
  a message**.
- **Tabs:** Home · **Activity** (on-phone timeline of warnings and blocks; allow a site, report a number) · **Argus**
  (website pages, signed in) · **Settings**.
- **Scan results:** native score dial and the website's honest words (`levelMeta`), top reasons, **"See full
  evidence"** opening `/scan/<id>` on the website. **UPI codes** get the website's card: "This code sends money. It
  never receives it."
- **Call warning while it rings** (heads-up notification): e.g. *"Likely scam · reported for spam (IPQS) · 6 Argus
  users: 'Fake KYC call' · Mumbai · Mobile"*, with India's series labels, and **Scam** / **Not scam** buttons.
- **Notification channels:** Call warnings (high), Scam texts (high), Gmail scam alerts (high), Family (high),
  Blocked sites (low, grouped), Blocker running (ongoing, required by Android for the VPN), Updates (low).
- **Quick Settings tiles:** "Check copied link", "Scam-site blocker" (on/off). **Widget:** eye + status + Scan QR +
  Check copied link.
- **Look:** dark only, the website's tokens (background `#08080a`, risk colours safe `#5ed3b0`, low `#f5c451`,
  suspicious `#ff9f4d`, high `#ff5d6c`, unknown `#8f8b93`), Archivo (bundled, OFL), the eye logo as a vector.
  English only. Honest copy rules from the website apply (plain words, no fake reassurance).

## How each protection works

### Call warnings (Android 10+, signed in)
1. The switch requests the **call screening role** (`RoleManager.ROLE_CALL_SCREENING`). Android then binds
   `ArgusCallScreeningService` for every incoming call from a number **not in the user's contacts**.
2. `onScreenCall` answers **immediately** (the phone never waits on the network): *allow*, or *silence* when the user
   turned on "Silence likely scam calls" **and** the number is already known on the phone as high risk.
3. On the phone: the number is checked against the **known scam numbers** list (downloaded daily) and the phone's own
   recent verdicts (kept 7 days). A hit shows the warning at once.
4. In parallel, `GET /api/app/phone?number=` (≈3 s budget). Score ≥ 80 → "Likely scam" (high importance), 60–79 →
   "Suspicious number", below 60 → no notification, logged in Activity only. If the answer comes after the call has
   ended (the free engine was asleep), the warning says so in the past tense: *"That call from +91… was likely a
   scam."*
5. **Scam** button → reports the number (existing `reportNumber` logic, category "Scam") and clears its shared
   cache entry. **Not scam** → this phone never warns about that number again; nothing is sent.
6. Calls scoring ≥ 60 are saved to history as kind `call`; family alerts follow the existing rules (Telegram, ≥ 80,
   10-minute dedupe) and, from phase 6, family push.
7. Hidden/withheld numbers: no lookup, nothing shown.

### SMS checks (only with the Argus SMS helper)
- The helper's receiver gets `SMS_RECEIVED`, joins the message parts and sends `{sender, body, time}` to Argus by an
  explicit broadcast protected by a **signature-level permission** (`app.askargus.permission.RELAY_SMS`, defined in
  both apps so install order doesn't matter). No other app can send or receive it.
- Argus filters on the phone first: only texts with a **link**, a **phone number**, or **scam words** (KYC, blocked,
  suspended, verify, prize, lottery, refund, cashback, reward, UPI, loan, job, parcel, courier, electricity, bill,
  pay, police, customs, and Hindi equivalents such as खाता, बंद, इनाम, लॉटरी) are sent to
  `POST /api/app/scan` as kind `text`. OTP-only texts and everyday chats stay on the phone ("Not checked: nothing
  risky in it" in Activity).
- Score ≥ 60 → notification with the top reason; saved to history; family alerts as above. Clean texts are not
  saved.
- Without the helper: long-press a text → Share → Argus.
- The helper has one screen ("Passes new texts to Argus to check. Nothing else.") with its status and "Open Argus".
  Argus detects it (package visibility `<queries>`) and shows the SMS switch.

### Scam-site blocker (everyone, no account needed)
- `ArgusVpnService` (`VpnService`) creates a local interface that routes **only** a fake DNS server address (IPv4
  `10.111.222.53`, IPv6 `fd00:a7:5::53`) into the app, and sets it as the phone's DNS server. Normal traffic never
  enters the app.
- Each DNS query's name (and each parent domain) is checked against the blocklist. Blocked → the app answers
  `NXDOMAIN`, the site doesn't open, and a quiet grouped notification says *"Argus blocked evil.example (known
  phishing site)"* with **Allow**. Allowed names go to the network's own DNS servers (from the active non-VPN
  network's `LinkProperties`) over a protected socket, falling back to `1.1.1.1` only if the network gives none.
- **Blocklist:** the phone downloads `https://askargus.app/api/blocklist` (plain text, one name per line, gzip by the
  CDN) daily on Wi-Fi or any network if older than 3 days, and stores it as a sorted array of 64-bit hashes (binary
  search, a few MB). Each entry blocks that name and everything under it.
- Starts on boot if it was on. Offers Android's "Always-on VPN" setting.
- **Honest limits, shown in the app:** only sites already on the lists; can't run alongside another VPN app; doesn't
  see lookups when the user set a custom **Private DNS** (detected via `LinkProperties.getPrivateDnsServerName()` →
  warning) or a browser's own custom secure DNS (can't be detected; explained in Settings).

### Quick tile and widget
- "Check copied link": opens a small transparent Argus panel (Android only lets the app on screen read the clipboard),
  reads the clipboard, finds the first link, checks it (signed in) and shows the verdict in the panel.
- Blocker tile: switches the VPN on/off (asks for VPN permission the first time).

### QR codes and screenshots
- ML Kit barcode scanning (CameraX live view and still images) and text recognition (Latin + Devanagari), all on the
  phone. The QR rules are a Kotlin port of `web/src/lib/qr.ts` with the same test cases: links → link check,
  `tel:` → phone check, UPI (`upi://pay`, `upi://mandate`) → the UPI card (not scored, not saved), other text → text
  check.
- **Share to Argus:** the app accepts shared text, links and images (`ACTION_SEND` for `text/plain` and `image/*`).
  Images: QR first, then text recognition, then a check.

### Gmail scam alerts (signed in, Gmail connected on the website)
- WorkManager periodic job (60 min, network required) → `POST /api/app/inbox-check`. The server reuses the Inbox
  page's code (moved into a shared server module): newest inbox emails not yet in `mail_scans`, at most 6 per run
  (Vercel's 60 s limit), scanned with `mailbox: inbox`. Returns new emails scoring ≥ 80 → one notification each (max
  3, then a summary). Tapping opens the website's Inbox.
- Android may delay the job to save battery; Settings says "about once an hour". Gmail's testing mode still limits
  connecting to listed test users.

### Family circle (phase 6; "Invite family" link from phase 1)
- **Invite:** `POST /api/app/family/invite` → a code valid 7 days → link `https://askargus.app/app/join/<code>`.
  The app opens it when installed (verified App Link); otherwise the page offers the download and "tap this link
  again after installing". Accepting (signed in) creates a family link. Both people consented: one by inviting, one
  by accepting. Either can leave at any time.
- **What members share with each other:** each phone's protection status (which protections are on, app version,
  last seen) and alerts for high-risk events. Alerts say what happened and how risky ("warned her about a likely
  scam call"); calls include the caller's number (the scammer's, not the member's); texts never include their
  words; blocked sites never name the site.
- **"Protection switched off":** a phone reports its status on every change and daily (`POST /api/app/device`). When
  a protection turns off, or a phone hasn't checked in for 48 hours (Vercel cron, daily), the circle gets a push.
- **Push:** Firebase Cloud Messaging HTTP v1, sent from Vercel with a service-account key. The existing Telegram
  family alerts keep working alongside.

## Website and server changes

### Auth
- **In the app:** Supabase Auth over its REST API with the public publishable key: email + password, sign-up (the
  confirmation email goes through Resend, already set up), and **Google one-tap** via Credential Manager → Google ID
  token (with a nonce) → `grant_type=id_token`. The session (access + refresh token) is stored encrypted and refreshed
  before expiry. Google one-tap needs an **Android OAuth client** (package `app.askargus` + the release key's SHA-1)
  in the sign-in Google project; the ID token's audience is the existing web client (`GOOGLE_SIGNIN_CLIENT_ID`), which
  Supabase already accepts.
- **App → website:** every `/api/app/*` call sends `Authorization: Bearer <access token>`; the route creates a
  Supabase client with that header, so row-level security applies exactly as on the website. `401` → the app refreshes
  the session once, then asks the user to sign in again.
- **Website pages signed in:** `POST /api/app/handoff` (bearer) → the server, with the **Supabase secret key**
  (`SUPABASE_SECRET_KEY`, Sensitive on Vercel; used only for this, the daily family check-in job and sending family
  pushes, never for anything a user can steer to someone else's data), generates a one-time
  magic-link token for that user only → the app opens
  `https://askargus.app/auth/confirm?token_hash=…&type=magiclink&next=<page>` in a Trusted Web Activity (falls back
  to a Custom Tab). `/auth/confirm` already verifies this token type.
- **Digital Asset Links:** `https://askargus.app/.well-known/assetlinks.json` names `app.askargus` and the release
  key's SHA-256 (TWA without an address bar, and verified App Links for `/app/join/*`). Excluded from the proxy.

### New endpoints
| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/app/scan` | bearer | Text or link → same pipeline as the Scan page; family alerts as today. `save: "always"` for checks the user started (scanner, share, tile), like the Scan page; `save: "flagged"` for automatic ones (SMS), saved only when score ≥ 60 |
| `GET /api/app/phone?number=` | bearer | Phone verdict; shared cache (below); saves ≥ 60 as kind `call` when `call=1` |
| `POST /api/app/report` | bearer | "Scam" from a call warning → existing report logic, then clears that number's cache |
| `GET /api/app/scam-numbers` | bearer | Numbers with ≥ 3 community Scam/Fraud reports or ≥ 3 sightings, with their label, for on-phone instant warnings |
| `POST /api/app/inbox-check` | bearer | New high-risk inbox emails (above) |
| `POST /api/app/handoff` | bearer | One-time sign-in link for the website pages |
| `POST /api/app/device` | bearer | This phone's protection status, app version and FCM token |
| `POST /api/app/family/invite`, `POST /api/app/family/join`, `DELETE /api/app/family/<id>` | bearer | Family circle |
| `GET /api/blocklist` | public | Engine blocklist, `Cache-Control: public, s-maxage=21600, stale-while-revalidate=86400` |
| `GET /api/app/latest` | public | Latest release (version, APK URLs, notes) from GitHub Releases, cached 1 h |

- **Fair use:** per-account daily caps with the existing `take_check_slot` counters (HMAC-keyed): 200 phone lookups,
  500 scans, 48 inbox checks, 20 handoffs. Over the cap → a clear message, never a fake verdict.

### Database (Supabase migrations)
- `phone_verdicts(number text primary key, verdict jsonb, checked_at timestamptz)` — shared by everyone, **no user
  IDs**. RLS on with no policies; accessed only through security-definer functions `get_phone_verdict(number)`
  (fresh within **24 hours**), `put_phone_verdict(number, verdict)` and `forget_phone_verdict(number)`, all
  validating `^\+[0-9]{8,15}$`. 24 hours (not a week) because community reports change verdicts; reporting a number
  clears its entry. Nobody can list the table.
- `known_scam_numbers()` — security-definer aggregate over `phone_reports` and `phone_sightings` returning numbers and
  labels only (never reporters).
- `app_devices(id, user_id, name, app_version, protections jsonb, fcm_token, last_seen_at, created_at)` — RLS: owner
  reads/writes own rows only; family members get each other's status (never the token) through a security-definer
  function `family_status()` that checks the family link.
- `family_invites(code_hash, inviter_id, expires_at, used_at)` and `family_links(id, user_a, user_b, created_at)` —
  RLS: members see their own links; created only through a security-definer `accept_family_invite(code)`.

### Engine (Render)
- `GET /blocklist` (token): Phishing.Database domains + OpenPhish hosts + URLhaus hosts (names only, no IPs), minus
  shared hosts (shorteners, publish-anything platform roots, Tranco top 10k) and minus the Tranco top 100k, so popular
  sites are never blocked. Platform subdomains (e.g. `evil.pages.dev`) stay as exact entries.
- **India's number series** in the phone checker: **140…** → "Registered telemarketer (promotional call)";
  **1600…** → "Registered bank/finance service line". Both are recognised **before** the validity check, so they are
  never called fake numbers even if libphonenumber doesn't know them. Also shown on the website's Caller ID.
- **Text rule:** a message that sounds like a bank ("your account", KYC, bank names) and asks you to call an ordinary
  Indian mobile number is flagged ("Banks don't ask you to call a personal mobile number").

### Distribution and updates
- Two APKs per release on GitHub Releases (`gyanvadhel/ARGUS`), tag `android-v<version>`: `argus-<version>.apk` and
  `argus-sms-helper-<version>.apk`.
- **`askargus.app/app`** (public page): download buttons, install steps (allow installs from the browser; what Play
  Protect may say about an unknown developer), and the USB steps for the SMS helper.
- The app checks `/api/app/latest` daily and shows "Update available" (low notification + a card on Home).
- **Signing key:** created once on this PC at `%USERPROFILE%\.argus\argus-release.jks` with its passwords in
  `%USERPROFILE%\.argus\keystore.properties`, both **outside the repo**, read by Gradle. The user must back both up:
  losing them means installed copies can never be updated.

### Privacy page
A new "Argus for Android" section: call numbers are looked up (answers cached 24 h, shared, without who asked);
texts leave the phone only when they contain a link, a number or scam words, and are saved only when flagged; the
blocker checks site names on the phone and never sends browsing anywhere; QR codes and screenshots are read on the
phone; family members see only protection status and alert types as described above.

## Error handling
- Every network call has a timeout and a clear failure state; a failed check says "couldn't check" — never a
  verdict it doesn't have.
- The engine asleep (Render free plan): the app says "Argus's checker is waking up" and retries in the background
  (WorkManager with backoff); call warnings fall back to the on-phone list and the late past-tense warning.
- Signed out: server-backed features show "Sign in to turn on"; on-phone features keep working.
- Blocklist download fails: keep the last list; after 7 days Settings says the list is out of date.
- The VPN is revoked by the system or another VPN: the switch turns off, a notification explains, and family members
  are told (phase 6).
- The call screening role is removed: detected on app start and daily; the switch turns off and says why.

## Testing
- **Android unit tests (JVM):** DNS packet parsing and NXDOMAIN answers; blocklist hashing and parent-domain matching;
  QR/UPI parsing (same cases as `web/src/lib/qr.test.ts`); SMS pre-filter; verdict → notification wording
  (`levelMeta` parity); number normalisation; update version comparison; API client JSON and 401-refresh.
- **Emulator tests (instrumented / scripted with adb):** `adb emu gsm call +18775569255` → call warning shown;
  `adb emu sms send` with a scam text (helper installed) → notification; blocked test domain → `NXDOMAIN` and
  notification; QR and screenshot images → correct reading; share intents.
- **Website:** vitest for new pure logic and route handlers (bearer auth, caps, cache rules, family consent);
  migrations tested with SQL against the functions' rules.
- **Engine:** pytest for `/blocklist` filtering and the 140/1600 series and bank-mobile text rule.
- **Before each release:** a check on the user's phone; production smoke test of the new endpoints.

## Build phases (each ends with an installable APK; each gets its own implementation plan)
1. **Foundation:** project + look, onboarding, home, sign-in (email + Google one-tap), website pages signed in
   (handoff + TWA + assetlinks), scanner (paste, QR camera, screenshot) + results + UPI card, Share to Argus, Activity
   (scans), update check, **"Invite family"** (invite + join page + `family_invites`/`family_links`, so families are
   linked from day one and helped to install Argus; status and push come in phase 6), `askargus.app/app` page, first
   GitHub release.
2. **Call warnings:** call screening, phone endpoint + shared cache + known scam numbers + report, 140/1600 series and
   the bank-mobile text rule (engine + website Caller ID).
3. **Scam-site blocker:** engine `/blocklist`, website `/api/blocklist`, VPN service, tiles, widget.
4. ~~SMS helper add-on~~ — dropped (user decision, 2026-10-06).
5. ~~Gmail alerts~~ — dropped (user decision, 2026-10-06); Gmail scanning stays on the website.
6. **Family circle:** devices, status, FCM push, "protection switched off" (cron), in-app family screen.

## The user's steps (all free)
- **Phase 1:** back up the signing key; create the Android OAuth client in the sign-in Google project (package +
  SHA-1, exact steps given then); add `SUPABASE_SECRET_KEY` to Vercel (Sensitive) from Supabase → API keys.
- **Testing on the phone:** turn on Developer options and USB debugging (steps given then).
- **Phase 4:** install the SMS helper over USB (guided).
- **Phase 6:** create a free Firebase project, add the Android app, and put its service-account key in Vercel.

## Out of scope (for now)
Play Store listing, iPhone, reading WhatsApp/Telegram notifications, scanning installed apps, Hindi interface,
drawing over the call screen (overlay caller ID), answering calls for the user or recording them, uploading
contacts, a new engine host (Render's sleep is handled by the on-phone lists; moving hosts is a separate decision).

## Risks
- **Play Protect** may warn about an unknown developer when installing; the download page explains it honestly.
- **Google's Android developer verification** (announced for sideloaded apps, reaching India later) may require
  registering the developer; watch for it before it applies.
- **Phone makers' battery savers** can stop background work; onboarding guides the user, the VPN runs as a foreground
  service, and call screening is bound by the system (reliable).
- **Free limits** (IPQS, VirusTotal, AbuseIPDB, Resend, Vercel bandwidth for the blocklist) are shared by everyone;
  caps and caching keep them in check, and the app says honestly when a limit is hit.
