# Argus for Android: what's left and how to build it

Read this together with `AI_HANDOFF.md` (the whole project) and
`docs/superpowers/specs/2026-09-30-android-app-design.md` (the Android design spec, which is the authority if the
two disagree). Written 2026-10-06; status updated 2026-10-07.

## Where things stand

| Phase | What | State |
|---|---|---|
| 1 | Foundation: app, sign-in, scanner, QR/screenshots, share, Activity, update check, family invites | Released as `android-v0.1.0` |
| 2 | Call warnings | Built; phase 2 loose ends fixed. Ships in `android-v0.2.1` |
| 3 | Scam-site blocker | Built and unit-tested; engine and `/api/blocklist` live (about 278k names). **Not yet tried on a real phone** |
| 4, 5 | SMS helper, Gmail alerts | Dropped by the owner. Don't build them |
| 6 | Family circle (status + push) | Built and unit-tested. Needs the migration applied and `FIREBASE_SERVICE_ACCOUNT`, `SUPABASE_SECRET_KEY`, `CRON_SECRET` on Vercel. **Push not yet tried end to end** |

`android-v0.2.0` was tagged but never published as a release (the tag predates the blocker fixes); `android-v0.2.1`
is the release to publish.

The project is due around **2026-10-08**. Suggested order: publish 0.2.1 → try the blocker and family push on a real phone → loose ends. Phase 6 needs the
owner to set up Firebase first (see its section), so ask for that early.

## Ground rules (the owner cares about these)

- **Honest results.** Never show "Safe" without proof; a failed check says it couldn't check. Never fake a feature —
  unfinished things are shown as "Coming soon".
- **Ask before you push, publish a release, or change anything live.** The owner deploys by pushing to `main`
  (Vercel and Render auto-deploy). The owner sets dashboard secrets and runs Supabase migrations themselves.
- **Look:** dark, monochrome, the living eye; colour only for risk levels. Plain words, no fake reassurance.
- **Privacy:** no contacts upload, nothing about browsing leaves the phone, and every new data flow goes on
  `web/src/app/privacy/page.tsx` in the same change.
- Keep `AI_HANDOFF.md` accurate when you change something it describes.

## How to work in this repo

| What | Command (Windows, from the repo root unless noted) |
|---|---|
| Android tests + build + lint | PowerShell in `android/`: `. .\tools\env.ps1; .\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:lintDebug` |
| Website tests | `cd web; npx vitest run; npx tsc --noEmit; npx eslint .` (3 old lint warnings are expected) |
| Engine tests | `cd api; .venv\Scripts\python -m pytest` |
| Signed release APK | PowerShell in `android/`: `.\gradlew.bat :app:assembleRelease` (key is read from `%USERPROFILE%\.argus\keystore.properties`, outside the repo) |
| Emulator scripts | `.superpowers/e2e/*.py` using the helpers in `adbui.py` (git-ignored; run with `api\.venv\Scripts\python`) |

- Android SDK, emulator and Gradle live on `D:\ArgusAndroid` (C: is full); `android/tools/env.ps1` sets the paths.
- Android unit tests use **JUnit 4** asserts (`org.junit.Assert`), not kotlin.test. Pure logic goes in small
  testable objects (like `calls/CallPolicy.kt`); Android-only code stays thin.
- minSdk 26, target/compile 35. Features that need a newer API are switched on with a `values-vNN/bools.xml` flag
  (see how `ArgusCallScreeningService` is enabled only on API 29+), so lint stays clean.
- Every `/api/app/*` route takes the Supabase access token as `Authorization: Bearer`, builds a Supabase client with
  it (`appUser()` in `web/src/lib/app-auth.ts`), and so runs under row-level security. Daily per-account caps live in
  `web/src/lib/app-caps.ts`. The secret key (`SUPABASE_SECRET_KEY`) is used only server-side for things a user must
  not be able to steer (see `web/src/lib/phone-cache.ts`).

## Step 0: release Android 0.2.1 (call warnings, blocker, family circle)

1. In `android/app/build.gradle.kts` `versionCode = 3`, `versionName = "0.2.1"` (already set).
2. Build the signed APK (command above). Install it on a phone, turn on Settings → Calls → Call warnings, and call
   it from another phone with an unknown number. The owner chose to skip the emulator test for this release.
3. Commit, tag `android-v0.2.1`, and create a GitHub release on `gyanvadhel/ARGUS` with the APK attached as
   `argus-0.2.1.apk`. The download page (`askargus.app/app`) and the in-app update check read the latest release
   from GitHub, so nothing else changes. **Ask the owner before pushing the tag or publishing.**
4. In the spec's "Build phases" list, mark phase 2 as released.

Check that `SUPABASE_SECRET_KEY` is set on Vercel; without it call lookups still work but the shared 24-hour cache
is off and every call wakes the engine.

## Phase 3: scam-site blocker

**What the person gets:** a switch (and a Quick Settings tile) that stops known phishing and malware sites from
opening in any app on the phone. Works without an account. Nothing about browsing leaves the phone.

**How it works** (spec section "Scam-site blocker"):

1. **Engine `GET /blocklist`** (`api/argus_api/main.py`, protected with a token in an env var). Returns plain text,
   one host name per line, built from the feeds the engine already loads in `api/argus_api/intel/feeds.py`:
   Phishing.Database domains + OpenPhish hosts + URLhaus hosts (names only, no IP addresses).
   Remove: shared hosts (link shorteners, platform roots like `pages.dev`, `github.io`, the Tranco top 10k) and
   anything in the Tranco top 100k, so popular sites are never blocked. Platform subdomains such as
   `evil.pages.dev` stay as exact entries. pytest the filtering.
2. **Website `GET /api/blocklist`** (public): fetches the engine list with the token and returns it with
   `Cache-Control: public, s-maxage=21600, stale-while-revalidate=86400`, so Vercel's CDN serves it and the engine
   is rarely asked. Add it to the exclusions in `web/src/proxy.ts` if the proxy would otherwise touch it.
3. **On the phone, the list:** a WorkManager job downloads it daily (Wi-Fi, or any network if older than 3 days),
   stores it as a sorted `LongArray` of 64-bit hashes of each name, and looks names up with binary search. A name is
   blocked if it or any parent domain is on the list. Keep the old list if a download fails; after 7 days Settings
   says it's out of date.
4. **On the phone, the VPN:** `ArgusVpnService` (`VpnService`) creates a local interface that routes **only** a fake
   DNS server address (`10.111.222.53`, and `fd00:a7:5::53` for IPv6) into the app and sets it as the DNS server.
   Normal traffic never enters the app. For each DNS query: parse the name; blocked → answer `NXDOMAIN` and post a
   quiet grouped notification "Argus blocked evil.example (known phishing site)" with **Allow** (allowed names are
   remembered on the phone); otherwise forward the query to the network's own DNS servers (from the non-VPN
   network's `LinkProperties`) over a `protect()`ed socket, falling back to `1.1.1.1` only if there are none.
   Runs as a foreground service with an ongoing "Blocker running" notification; restarts on boot if it was on.
5. **UI:** Home card ("3 scam sites blocked today"), Settings switch with the honest limits, Activity rows for
   blocks (type `site`), a Quick Settings tile for the blocker, and the Home-screen widget (eye + status + Scan QR
   + Check copied link) if time allows. Move "A scam-site blocker for every app" out of the "Coming" lists on Home
   (`ui/home/HomeScreen.kt`) and on `web/src/app/app/page.tsx`.
6. **Honest limits, shown in Settings:** only blocks sites already on the lists; can't run alongside another VPN
   app; if the person set a custom Private DNS, Android sends lookups there and Argus can't see them (detect with
   `LinkProperties.getPrivateDnsServerName()` and warn); a browser's own secure DNS can't be detected (explain it).
   If the VPN is revoked (another VPN started), the switch turns off and a notification says why.
7. **Privacy page:** the blocker checks site names on the phone against a downloaded list and never sends browsing
   anywhere.

**Tests to write:** DNS packet parsing and building an NXDOMAIN reply (JVM unit tests with real captured packet
bytes); hashing and parent-domain matching (`evil.example` blocks `a.b.evil.example`, not `notevil.example`);
the engine's filtering (pytest); the website route's headers (vitest). On the emulator: turn the blocker on, open a
test domain that's on the list, confirm it doesn't load and the notification shows.

**Watch out for:** the list size (keep it a few MB; check how many names the feeds give after filtering); a
blocking DNS read loop on the main thread; IPv6-only networks; and Vercel bandwidth (the CDN cache is what keeps it
free).

## Phase 6: family circle

**What exists:** invites and links (`supabase/migrations/20260930120000_family_links.sql`;
`web/src/app/api/app/family/*`; `ui/family/` in the app); Telegram family alerts on the website
(`web/src/lib/family-alerts.ts`), which phase 2 already calls for high-risk calls.

**What the person gets:** on their family screen, each member's protection status (which protections are on, app
version, last seen), a push when a family member gets a high-risk warning, and a push when a member's protection
is switched off or their phone hasn't checked in for 48 hours.

**Owner's steps first (ask early):** create a free Firebase project, add the Android app `app.askargus`, put
`google-services.json` in `android/app/` (it is not secret but keep it out of public screenshots), and put the
service-account key JSON on Vercel as a Sensitive env var (e.g. `FIREBASE_SERVICE_ACCOUNT`).

**How:**

1. **Migration:** `app_devices(id, user_id, name, app_version, protections jsonb, fcm_token, last_seen_at,
   created_at)`. RLS: owners read/write only their own rows. Family members see each other's status through a
   security-definer `family_status()` that checks `family_links` and **never returns `fcm_token`**.
2. **`POST /api/app/device`** (bearer): the phone reports its protections, app version and FCM token on every change
   and once a day (WorkManager). Compare with the previous row: a protection that went from on to off triggers a
   push to the circle.
3. **Push:** FCM HTTP v1 from Vercel, signing a Google OAuth token with the service-account key. Read other members'
   tokens with the secret key on the server only. Add the push next to the Telegram send in `family-alerts.ts`, so
   every existing alert (calls, scans) also goes out as a push. Alerts say what happened and how risky, never a
   message's words, and never name a blocked site; calls may include the scammer's number.
4. **Cron:** a daily Vercel cron (`web/vercel.json` → `"crons"`; the Hobby plan allows daily) that finds phones not
   seen for 48 hours and tells their circle. Protect the route with `CRON_SECRET`.
5. **App:** Firebase Messaging dependency and a `FirebaseMessagingService` that shows a "Family" channel
   notification; a family screen showing each member's status; move "Family alerts on your phone" out of the
   "Coming" lists.
6. **Privacy page:** what family members see (protection status, last seen, alert types) and that push goes through
   Google's Firebase.

**Tests to write:** `family_status()` only returns linked members and never the token (SQL against the rules, or
vitest on the route with a fake client); the on→off change detection; the 48-hour selection; the push payload never
contains message text or a site name.

## Loose ends from phase 2 (small; fix if time allows)

- `ArgusCallScreeningService` reads the known-scam list JSON twice on every call; keep the parsed map in memory.
- `CallMemory.shouldWarn` reads then writes; two calls at once can both pass. Do it in one DataStore `edit {}`.
- Tapping **Scam** after an earlier **Not scam** still leaves the number ignored; Scam should remove it from the
  not-scam list.
- The privacy page doesn't say that call numbers may be checked with IPQualityScore and the FCC, or that the SIM
  country is sent. Add this before the submission.
- A slow lookup runs in the service's own scope; Android can kill the process after the call. An expedited
  WorkManager job would survive that.
- `api/argus_api/checkers/text.py` was committed with Windows line endings; convert it back to LF.
