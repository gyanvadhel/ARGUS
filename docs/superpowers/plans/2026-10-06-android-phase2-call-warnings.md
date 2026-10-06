# Android Phase 2: Call Warnings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an unknown number calls an Android 10+ phone with Argus, the person sees a warning ("Likely scam" / "Suspicious number") while it rings, can tap Scam or Not scam, and every warning is logged in Activity.

**Architecture:** An `ArgusCallScreeningService` (system-bound once the user grants the call-screening role) answers `allow` immediately and, in parallel, runs a `CallChecker`: first the on-phone memory (daily known-scam-numbers list, 7-day own verdicts, "Not scam" list), then `GET /api/app/phone` with a 3 s budget. The web route normalises the number, reads/writes the shared 24 h `phone_verdicts` cache (security-definer functions, no user ids), otherwise asks the engine with the Community data. The engine learns India's 140/1600 series and a bank-asks-you-to-call-a-mobile text rule. The pure decision logic lives in plain Kotlin classes so it is unit-tested on the JVM; the service, notifications and role request are thin Android glue tested on the emulator with `adb emu gsm call`.

**Tech Stack:** Kotlin/Compose, Room, DataStore, WorkManager, OkHttp, kotlinx.serialization (Android); Next.js route handlers + Supabase + vitest (web); FastAPI + libphonenumber + pytest (engine); Postgres SQL migration.

**Spec:** `docs/superpowers/specs/2026-09-30-android-app-design.md` (sections "Call warnings", "Endpoints", "Database", "Engine", "Error handling", "Testing"). Phases 4 and 5 are dropped; Phase 6 (family push) is out of scope here, so call alerts reach family only through the existing Telegram alert rules.

## Global Constraints

- Package `app.askargus`, minSdk 26. The call-screening role needs Android 10 (API 29): below that the switch is disabled with the text "Needs Android 10 or newer".
- `onScreenCall` must answer immediately; the network lookup never delays the call. Network budget about 3 s.
- Score >= 80 -> "Likely scam" (high importance heads-up). 60-79 -> "Suspicious number". Below 60 -> no notification, logged in Activity only.
- Hidden or withheld numbers: no lookup, nothing shown.
- A lookup answer arriving after the call ended is shown in the past tense: "That call from <number> was likely a scam."
- "Not scam": this phone never warns about that number again; nothing is sent. "Scam": report with category "Scam" and clear the shared cache entry.
- "Silence likely scam calls" only silences when the number is already known on the phone as high risk (>= 80), never from a live lookup.
- Shared verdict cache: 24 hours, no user ids, RLS on with no policies, access only through security-definer functions that validate `^\+[0-9]{8,15}$`, `set search_path = ''`, execute revoked from anon/public.
- `known_scam_numbers()` returns numbers and labels only (>= 3 Scam/Fraud reports or >= 3 sightings), never reporters.
- Daily cap per account for phone lookups: 200, via `take_check_slot` (`withinCap`). Over the cap -> a clear message, never a fake verdict.
- On-phone verdict memory is kept 7 days. Activity timeline stays on the phone; calls scoring >= 60 are saved to server history as kind `call`.
- Plain-English copy, no jargon, monochrome look. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Build/test commands: web `bash .superpowers/sdd/2026-09-30-android-phase1-foundation/web-test.sh`; engine `api/.venv/Scripts/python -m pytest` (from `api/`); Android `. .\tools\env.ps1` then `.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug` (or `bash .superpowers/sdd/2026-09-30-android-phase1-foundation/android-test.sh assembleDebug`).

## Review Focus

- A number with no `+` (national format from the dialer) must still resolve; the phone sends its SIM country and the server turns it into E.164 or says "couldn't read that number" (never a verdict for a guess).
- Engine asleep (502/503/timeout): no warning is invented; the on-phone list still works; the late answer is past-tense, and a failed lookup shows nothing (not "safe").
- The same number calling five times in a minute must warn once (dedupe) and cost one lookup (verdict memory), not five.
- Contact numbers never reach Argus (the system only binds the service for numbers not in contacts); the user later saying "Not scam" must stick across reboots.
- Signed-out user or revoked role: the service answers allow and does nothing; the switch turns itself off with a reason.
- A 140/1600 number must never be called "fake number", and an ordinary valid Indian mobile must not show a generic bank advisory.

## File Structure

Engine
- Modify `api/argus_api/checkers/phone.py`: `india_series`, `series_signal`, drop generic TRAI evidence.
- Modify `api/argus_api/checkers/text.py`: `bank_mobile_signal`.
- Modify `api/tests/test_phone.py`, `api/tests/test_text.py`.

Database
- Create `supabase/migrations/20261006000000_phone_verdict_cache.sql`.

Web
- Modify `web/src/lib/app-caps.ts`: `phone` cap.
- Create `web/src/lib/app-phone.ts` (+ `app-phone.test.ts`): number cleaning, level wording.
- Create `web/src/app/api/app/phone/route.ts`, `report/route.ts`, `scam-numbers/route.ts`.
- Modify `web/src/app/privacy/page.tsx` (or wherever the privacy page lives) and `web/src/app/app/page.tsx` copy.

Android (`android/app/src/main/java/app/askargus/`)
- Create `calls/CallPolicy.kt`: pure rules (hidden, level, wording, silence).
- Create `calls/CallMemory.kt`: known list, 7-day verdicts, not-scam list, dedupe (over a `KeyValueStore`).
- Create `calls/CallChecker.kt`: orchestration, returns `CallOutcome`.
- Create `calls/ArgusCallScreeningService.kt`, `calls/CallNotifications.kt`, `calls/CallActionReceiver.kt`, `calls/CallRole.kt`.
- Create `work/ScamListWorker.kt`.
- Modify `net/ArgusApi.kt` (phone, report, scamNumbers), `data/Prefs.kt` (call switch, silence switch, store), `AppContainer.kt`, `ArgusApp.kt`, `AndroidManifest.xml`, `ui/settings/SettingsScreen.kt`, `ui/home/HomeScreen.kt`.
- Tests under `android/app/src/test/java/app/askargus/calls/`.

---

### Task 1: Engine, India number series and bank-mobile text rule

**Files:**
- Modify: `api/argus_api/checkers/phone.py` (`validity_signal`, `_local_signals`)
- Modify: `api/argus_api/checkers/text.py` (`check_text`, new `bank_mobile_signal`)
- Test: `api/tests/test_phone.py`, `api/tests/test_text.py`

**Interfaces:**
- Produces: `india_series(raw: str) -> tuple[str, str] | None` returning `(prefix, label)`; `series_signal(raw) -> Signal | None`; `bank_mobile_signal(text: str) -> Signal | None`.

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/test_phone.py`:

```python
from argus_api.checkers.phone import india_series


def test_140_series_is_a_registered_telemarketer_not_a_fake_number():
    v = check_phone("+91 1409876543")
    assert not any("Not a real phone number" in s.summary for s in v.signals)
    s = next(s for s in v.signals if s.source == "India number series")
    assert s.summary == "Registered telemarketer (promotional call)"
    assert s.status == "clean"


def test_1600_series_is_a_registered_bank_line():
    v = check_phone("+91 1600123456")
    s = next(s for s in v.signals if s.source == "India number series")
    assert s.summary == "Registered bank/finance service line"


def test_ordinary_indian_mobile_is_not_a_series_and_has_no_generic_advisory():
    assert india_series("+91 98765 43210") is None
    v = check_phone("+91 98765 43210")
    validity = next(s for s in v.signals if s.source == "Number validation")
    assert "trai_advisory" not in validity.evidence


def test_us_number_starting_1600_is_not_an_indian_series():
    assert india_series("+1 600 555 0100") is None
```

Append to `api/tests/test_text.py`:

```python
from argus_api.checkers.text import bank_mobile_signal


def test_bank_asking_you_to_call_a_mobile_is_flagged():
    s = bank_mobile_signal("Dear customer your SBI account KYC is pending. Call 9876543210 now to avoid blocking.")
    assert s is not None and s.status == "suspicious"
    assert "personal mobile" in s.summary


def test_bank_text_with_a_1600_line_is_not_flagged():
    assert bank_mobile_signal("Your HDFC account statement is ready. Call 1600 202 6161 for help.") is None


def test_chat_with_a_mobile_number_is_not_flagged():
    assert bank_mobile_signal("Call me on 9876543210 when you reach") is None
```

- [ ] **Step 2: Run to verify they fail**

Run (from `api/`): `.venv/Scripts/python -m pytest tests/test_phone.py tests/test_text.py -q`
Expected: FAIL with `ImportError: cannot import name 'india_series'`.

- [ ] **Step 3: Implement**

In `phone.py` add (near `_parse`):

```python
_IN_SERIES = (
    (re.compile(r"140\d{7}"), "140", "Registered telemarketer (promotional call)"),
    (re.compile(r"1600\d{6}"), "1600", "Registered bank/finance service line"),
)


def india_series(raw: str) -> tuple[str, str] | None:
    """India's 140 (telemarketers) and 1600 (banks/finance) lines. libphonenumber may not know them, so they are
    recognised on the digits before the validity check. Without a +91 they only count when the default region is IN."""
    text = raw.strip()
    digits = re.sub(r"\D", "", text)
    if text.startswith("+") or digits.startswith("00"):
        digits = digits.removeprefix("00")
        if not digits.startswith("91"):
            return None
        digits = digits[2:]
    elif _region() == "IN":
        digits = digits.removeprefix("0").removeprefix("91") if len(digits) > 10 else digits
    else:
        return None
    for pattern, prefix, label in _IN_SERIES:
        if pattern.fullmatch(digits):
            return prefix, label
    return None


def series_signal(raw: str) -> Signal | None:
    hit = india_series(raw)
    if hit is None:
        return None
    prefix, label = hit
    return Signal(source="India number series", status="clean", score=0, weight=1.0, summary=label,
                  evidence={"series": prefix, "threat_type": "None"})
```

(`import re` at the top if missing.) In `_local_signals`, build `series = series_signal(raw)` and use `validity = series or validity_signal(parsed, reason)`; keep the other four signals. In `validity_signal` delete the whole `if parsed.country_code == 91 ...: evidence["trai_advisory"] = ...` block. In `text.py`:

```python
_BANKISH = re.compile(r"\b(kyc|your (?:bank )?account|a/c|sbi|hdfc|icici|axis bank|pnb|kotak|bank of baroda|rbi)\b", re.I)
_CALL_ASK = re.compile(r"\b(call|contact|dial|ring)\b", re.I)


def bank_mobile_signal(text: str) -> Signal | None:
    """A message that sounds like a bank and asks you to call an ordinary Indian mobile is a classic scam."""
    if not (_BANKISH.search(text) and _CALL_ASK.search(text)):
        return None
    for raw in extract_phones(text, limit=3):
        try:
            parsed = phonenumbers.parse(raw, "IN")
        except phonenumbers.NumberParseException:
            continue
        if parsed.country_code == 91 and phonenumbers.number_type(parsed) == phonenumbers.PhoneNumberType.MOBILE:
            return Signal(source="Bank call-back rule", status="suspicious", score=60, weight=1.0,
                          summary="Banks don't ask you to call a personal mobile number",
                          evidence={"threat_type": "Bank impersonation"})
    return None
```

In `check_text` after `signals = local_text_signals(text) + phones` add `if (bank := bank_mobile_signal(text)) is not None: signals.append(bank)`. Add `import phonenumbers` and `import re` if missing.

- [ ] **Step 4: Run to verify they pass**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all PASS (existing phone/text tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add api/argus_api/checkers/phone.py api/argus_api/checkers/text.py api/tests/test_phone.py api/tests/test_text.py
git commit -m "feat(engine): recognise India's 140 and 1600 series and flag banks asking you to call a mobile"
```

---

### Task 2: Database, shared verdict cache and known scam numbers

**Files:**
- Create: `supabase/migrations/20261006000000_phone_verdict_cache.sql`

**Interfaces:**
- Produces: `public.get_phone_verdict(p_number text) returns jsonb` (null when absent or older than 24 h), `public.put_phone_verdict(p_number text, p_verdict jsonb) returns void`, `public.forget_phone_verdict(p_number text) returns void`, `public.known_scam_numbers() returns table(number text, label text)`. All executable by `authenticated` only.

- [ ] **Step 1: Write the migration**

```sql
-- A shared 24-hour cache of phone verdicts. No user ids; nobody can list it.
create table public.phone_verdicts (
  number text primary key check (number ~ '^\+[0-9]{8,15}$'),
  verdict jsonb not null,
  checked_at timestamptz not null default now()
);
alter table public.phone_verdicts enable row level security; -- no policies on purpose

create function public.get_phone_verdict(p_number text) returns jsonb
language sql security definer set search_path = '' stable as $$
  select verdict from public.phone_verdicts
  where number = p_number and p_number ~ '^\+[0-9]{8,15}$' and checked_at > now() - interval '24 hours';
$$;

create function public.put_phone_verdict(p_number text, p_verdict jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_number !~ '^\+[0-9]{8,15}$' then raise exception 'bad number'; end if;
  insert into public.phone_verdicts (number, verdict, checked_at) values (p_number, p_verdict, now())
  on conflict (number) do update set verdict = excluded.verdict, checked_at = now();
end $$;

create function public.forget_phone_verdict(p_number text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_number !~ '^\+[0-9]{8,15}$' then raise exception 'bad number'; end if;
  delete from public.phone_verdicts where number = p_number;
end $$;

-- Numbers many people have reported or seen in scam messages. Numbers and labels only, never who reported.
create function public.known_scam_numbers() returns table(number text, label text)
language sql security definer set search_path = '' stable as $$
  select r.number, 'Reported as a scam by ' || r.n || ' Argus users'
  from (select number, count(*) n from public.phone_reports where category in ('Scam','Fraud') group by number having count(*) >= 3) r
  union
  select s.number, 'Seen in ' || s.n || ' scam messages'
  from (select number, count(*) n from public.phone_sightings group by number having count(*) >= 3) s
  where s.number not in (select number from public.phone_reports where category in ('Scam','Fraud') group by number having count(*) >= 3);
$$;

revoke all on function public.get_phone_verdict(text), public.put_phone_verdict(text, jsonb),
  public.forget_phone_verdict(text), public.known_scam_numbers() from public, anon;
grant execute on function public.get_phone_verdict(text), public.put_phone_verdict(text, jsonb),
  public.forget_phone_verdict(text), public.known_scam_numbers() to authenticated;
```

- [ ] **Step 2: Apply and check it (needs the user's Supabase access)**

The Supabase MCP needs authorisation in an interactive session, so ask the user to run the file in the Supabase SQL editor (project `yvcxqwrgizfmzgohnezj`), or run `npx supabase db push` if the project is linked. Then, in the SQL editor as the `authenticated` role, check:

```sql
select public.put_phone_verdict('+14155550100', '{"score":90}'::jsonb);
select public.get_phone_verdict('+14155550100');           -- {"score": 90}
select public.get_phone_verdict('not-a-number');            -- null
select public.forget_phone_verdict('+14155550100');
select public.get_phone_verdict('+14155550100');            -- null
select * from public.known_scam_numbers();                  -- runs, rows only for numbers meeting the threshold
```
and as `anon`: `select public.get_phone_verdict('+14155550100');` must fail with "permission denied".

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261006000000_phone_verdict_cache.sql
git commit -m "feat(db): shared 24-hour phone verdict cache and known scam numbers"
```

---

### Task 3: Website endpoints, phone lookup, report, scam numbers

**Files:**
- Modify: `web/src/lib/app-caps.ts`
- Create: `web/src/lib/app-phone.ts`, `web/src/lib/app-phone.test.ts`
- Create: `web/src/app/api/app/phone/route.ts`, `web/src/app/api/app/report/route.ts`, `web/src/app/api/app/scam-numbers/route.ts`

**Interfaces:**
- Produces `app-phone.ts`:
  - `cleanNumber(raw: string, country?: string): string | null` (E.164-looking `+digits` or null)
  - `parsePhoneQuery(url: URL): { number: string; call: boolean } | { error: string }`
  - `parseReportBody(body: unknown): { number: string } | { error: string }`
- Produces HTTP:
  - `GET /api/app/phone?number=&country=&call=1` -> `{ verdict, cached: boolean, id: string | null }`
  - `POST /api/app/report {number}` -> `{ ok: true }` (reports as Scam, clears the cache entry)
  - `GET /api/app/scam-numbers` -> `{ numbers: [{ number, label }] }`

- [ ] **Step 1: Write the failing tests** (`web/src/lib/app-phone.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { cleanNumber, parsePhoneQuery, parseReportBody } from "./app-phone";

describe("cleanNumber", () => {
  it("keeps international numbers", () => expect(cleanNumber("+91 98765-43210")).toBe("+919876543210"));
  it("adds the country code from the SIM for national numbers", () => {
    expect(cleanNumber("098765 43210", "IN")).toBe("+919876543210");
    expect(cleanNumber("9876543210", "IN")).toBe("+919876543210");
    expect(cleanNumber("(415) 555-0100", "US")).toBe("+14155550100");
  });
  it("refuses numbers it can't place", () => {
    expect(cleanNumber("9876543210")).toBeNull();
    expect(cleanNumber("12345", "IN")).toBeNull();
    expect(cleanNumber("")).toBeNull();
    expect(cleanNumber("unknown", "IN")).toBeNull();
  });
});

describe("parsePhoneQuery", () => {
  it("reads number, country and call", () => {
    const r = parsePhoneQuery(new URL("https://x/api/app/phone?number=%2B919876543210&call=1"));
    expect(r).toEqual({ number: "+919876543210", call: true });
  });
  it("errors on a bad number", () => {
    expect("error" in parsePhoneQuery(new URL("https://x/api/app/phone?number=abc"))).toBe(true);
  });
});

describe("parseReportBody", () => {
  it("needs a number", () => {
    expect("error" in parseReportBody({})).toBe(true);
    expect(parseReportBody({ number: "+919876543210" })).toEqual({ number: "+919876543210" });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bash .superpowers/sdd/2026-09-30-android-phase1-foundation/web-test.sh` (or `cd web && npx vitest run src/lib/app-phone.test.ts`)
Expected: FAIL, module `./app-phone` not found.

- [ ] **Step 3: Implement `web/src/lib/app-phone.ts`**

```ts
// The Android app's phone lookups: reading the number the dialer gave us.

const CALLING_CODES: Record<string, string> = { IN: "91", US: "1", CA: "1", GB: "44" };

/** "+digits" for a number the phone handed us, or null if we can't be sure which number it is. */
export function cleanNumber(raw: string, country?: string): string | null {
  const text = raw.trim();
  const digits = text.replace(/\D/g, "");
  let e164: string;
  if (text.startsWith("+")) {
    e164 = `+${digits}`;
  } else if (text.startsWith("00")) {
    e164 = `+${digits.slice(2)}`;
  } else {
    const code = CALLING_CODES[(country ?? "").toUpperCase()];
    if (!code) return null;
    const national = digits.replace(/^0+/, "");
    if (national.startsWith(code) && national.length > code.length + 7) e164 = `+${national}`;
    else e164 = `+${code}${national}`;
  }
  return /^\+[1-9][0-9]{7,14}$/.test(e164) ? e164 : null;
}

export function parsePhoneQuery(url: URL): { number: string; call: boolean } | { error: string } {
  const number = cleanNumber(url.searchParams.get("number") ?? "", url.searchParams.get("country") ?? undefined);
  if (!number) return { error: "That doesn't look like a phone number." };
  return { number, call: url.searchParams.get("call") === "1" };
}

export function parseReportBody(body: unknown): { number: string } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as { number?: unknown; country?: unknown };
  const number = typeof b.number === "string" ? cleanNumber(b.number, typeof b.country === "string" ? b.country : undefined) : null;
  return number ? { number } : { error: "That number can't be reported." };
}
```

Edit `app-caps.ts`: `APP_CAPS = { scan: 500, phone: 200, handoff: 20, invite: 20 }` and add `phone: "You've reached today's limit of 200 call lookups. Try again tomorrow."` to `CAP_MESSAGES`.

`phone/route.ts`:

```ts
import { api } from "@/lib/api";
import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { CAP_MESSAGES, withinCap } from "@/lib/app-caps";
import { parsePhoneQuery } from "@/lib/app-phone";
import { communityFor, recordSightings } from "@/lib/community-data";
import { ALERT_AT, alertFamily } from "@/lib/family-alerts";
import { levelMeta } from "@/lib/format";
import { SAVE_FLAGGED_AT } from "@/lib/app-scan";
import type { Verdict } from "@/lib/types";

export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const q = parsePhoneQuery(new URL(request.url));
  if ("error" in q) return fail(400, q.error);
  if (!(await withinCap(auth.supabase, "phone", auth.user.id))) return fail(429, CAP_MESSAGES.phone);

  const { data: hit } = await auth.supabase.rpc("get_phone_verdict", { p_number: q.number });
  let verdict = (hit as Verdict | null) ?? null;
  const cached = verdict !== null;
  if (!verdict) {
    try {
      const { community } = await communityFor(auth.supabase, q.number);
      verdict = await api.scan(q.number, community);
    } catch {
      return fail(502, "Argus's checker is waking up. Try again in a moment.");
    }
    await auth.supabase.rpc("put_phone_verdict", { p_number: q.number, p_verdict: verdict });
    await recordSightings(auth.supabase, verdict).catch(() => undefined);
  }

  let id: string | null = null;
  if (q.call && verdict.score >= SAVE_FLAGGED_AT) {
    const { data } = await auth.supabase
      .from("scans")
      .insert({ kind: "call", input_preview: q.number, score: verdict.score, level: verdict.level, threat_type: verdict.threat_type, verdict })
      .select("id")
      .single();
    id = data?.id ?? null;
    if (verdict.score >= ALERT_AT) {
      await alertFamily(auth.supabase, {
        kind: "call", number: q.number, score: verdict.score,
        label: levelMeta(verdict.level, verdict.verified).label, reason: verdict.threat_type,
      }).catch(() => 0);
    }
  }
  return Response.json({ verdict, cached, id });
}
```

(Before writing the `alertFamily` call, open `web/src/lib/family-alerts.ts` and `family-alerts.test.ts:25` and match the exact `kind: "call"` argument shape used there; the test shows `{ kind, number, score, label, reason, simulated }`. Also make sure `recordSightings` accepts a phone verdict; it is already called with any verdict in `performScan`.)

`report/route.ts`:

```ts
import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { parseReportBody } from "@/lib/app-phone";

export async function POST(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const body = parseReportBody(await request.json().catch(() => null));
  if ("error" in body) return fail(400, body.error);
  const { error } = await auth.supabase.from("phone_reports").insert({ number: body.number, category: "Scam" });
  if (error && error.code !== "23505") return fail(502, "Couldn't send your report. Try again.");
  await auth.supabase.rpc("forget_phone_verdict", { p_number: body.number });
  return Response.json({ ok: true });
}
```

`scam-numbers/route.ts`:

```ts
import { appUser, fail, unauthorized } from "@/lib/app-auth";

export async function GET(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const { data, error } = await auth.supabase.rpc("known_scam_numbers");
  if (error) return fail(502, "Couldn't load the list. Try again.");
  return Response.json({ numbers: data ?? [] });
}
```

- [ ] **Step 4: Run to verify they pass, plus the type check**

Run: web tests as in Step 2, then `cd web && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/app-caps.ts web/src/lib/app-phone.ts web/src/lib/app-phone.test.ts web/src/app/api/app/phone web/src/app/api/app/report web/src/app/api/app/scam-numbers
git commit -m "feat(web): phone lookup, report and scam-number endpoints for the Android app"
```

---

### Task 4: Android decision logic, memory, checker and API client

**Files:**
- Create: `calls/CallPolicy.kt`, `calls/CallMemory.kt`, `calls/CallChecker.kt`
- Modify: `net/ArgusApi.kt`
- Test: `android/app/src/test/java/app/askargus/calls/CallPolicyTest.kt`, `CallMemoryTest.kt`, `CallCheckerTest.kt`; extend `net/ArgusApiTest.kt`

**Interfaces:**
- `enum class CallLevel { LIKELY_SCAM, SUSPICIOUS, NONE }`
- `object CallPolicy { fun level(score: Int): CallLevel; fun isHidden(raw: String?): Boolean; fun title(level: CallLevel, late: Boolean, number: String): String; fun silences(level: CallLevel, known: Boolean, silenceOn: Boolean): Boolean }`
- `interface KeyValueStore { suspend fun get(key: String): String?; suspend fun put(key: String, value: String) }`
- `class CallMemory(store: KeyValueStore, now: () -> Long)`: `suspend fun knownScamLabel(number: String): String?`, `suspend fun setKnown(list: Map<String, String>)`, `suspend fun recentScore(number: String): Int?`, `suspend fun remember(number: String, score: Int)`, `suspend fun markNotScam(number: String)`, `suspend fun isNotScam(number: String): Boolean`, `suspend fun shouldWarn(number: String): Boolean` (dedupe, 2 min), `suspend fun knownAt(): Long?`
- `interface PhoneLookup { suspend fun phone(number: String, country: String?, call: Boolean): PhoneResponse }` (implemented by `ArgusApi`); `@Serializable data class PhoneResponse(val verdict: Verdict, val cached: Boolean = false, val id: String? = null)`
- `sealed interface CallOutcome { Skip; Warn(level, score, number, summary, late: Boolean = false); Quiet(score) }` and `class CallChecker(memory, lookup, budgetMs = 3000, ...)` with `suspend fun check(number: String, country: String?, callActive: () -> Boolean): CallOutcome`
- `ArgusApi.scamNumbers(): List<ScamNumber>` (`@Serializable data class ScamNumber(val number: String, val label: String)`), `ArgusApi.report(number: String, country: String?)`

- [ ] **Step 1: Write the failing tests**

`CallPolicyTest.kt`:

```kotlin
package app.askargus.calls

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CallPolicyTest {
    @Test fun levels() {
        assertEquals(CallLevel.LIKELY_SCAM, CallPolicy.level(80))
        assertEquals(CallLevel.SUSPICIOUS, CallPolicy.level(79))
        assertEquals(CallLevel.SUSPICIOUS, CallPolicy.level(60))
        assertEquals(CallLevel.NONE, CallPolicy.level(59))
    }
    @Test fun hiddenNumbers() {
        listOf(null, "", " ", "-1", "-2", "Unknown", "Private number").forEach { assertTrue(CallPolicy.isHidden(it), "$it") }
        assertFalse(CallPolicy.isHidden("+919876543210"))
    }
    @Test fun wording() {
        assertEquals("Likely scam call", CallPolicy.title(CallLevel.LIKELY_SCAM, late = false, number = "+91 98765 43210"))
        assertEquals("Suspicious number calling", CallPolicy.title(CallLevel.SUSPICIOUS, late = false, number = "+91 98765 43210"))
        assertEquals("That call from +91 98765 43210 was likely a scam", CallPolicy.title(CallLevel.LIKELY_SCAM, late = true, number = "+91 98765 43210"))
        assertEquals("That call from +91 98765 43210 looked suspicious", CallPolicy.title(CallLevel.SUSPICIOUS, late = true, number = "+91 98765 43210"))
    }
    @Test fun silenceOnlyWhenAlreadyKnownAsHighRisk() {
        assertTrue(CallPolicy.silences(CallLevel.LIKELY_SCAM, known = true, silenceOn = true))
        assertFalse(CallPolicy.silences(CallLevel.LIKELY_SCAM, known = false, silenceOn = true))
        assertFalse(CallPolicy.silences(CallLevel.SUSPICIOUS, known = true, silenceOn = true))
        assertFalse(CallPolicy.silences(CallLevel.LIKELY_SCAM, known = true, silenceOn = false))
    }
}
```

`CallMemoryTest.kt` (with `class MapStore : KeyValueStore` in the same file using a `mutableMapOf`):

```kotlin
package app.askargus.calls

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MapStore : KeyValueStore {
    val map = mutableMapOf<String, String>()
    override suspend fun get(key: String) = map[key]
    override suspend fun put(key: String, value: String) { map[key] = value }
}

class CallMemoryTest {
    private val day = 24L * 60 * 60 * 1000
    private var clock = 1_000_000_000L
    private val store = MapStore()
    private fun memory() = CallMemory(store) { clock }

    @Test fun knownListSurvivesANewInstance() = runTest {
        memory().setKnown(mapOf("+919876543210" to "Reported as a scam by 5 Argus users"))
        assertEquals("Reported as a scam by 5 Argus users", memory().knownScamLabel("+919876543210"))
        assertNull(memory().knownScamLabel("+919000000000"))
    }

    @Test fun verdictsAreKeptSevenDays() = runTest {
        memory().remember("+14155550100", 88)
        clock += 6 * day
        assertEquals(88, memory().recentScore("+14155550100"))
        clock += 2 * day
        assertNull(memory().recentScore("+14155550100"))
    }

    @Test fun notScamSticks() = runTest {
        memory().markNotScam("+14155550100")
        assertTrue(memory().isNotScam("+14155550100"))
        assertFalse(memory().isNotScam("+14155550101"))
    }

    @Test fun sameNumberWarnsOnceInTwoMinutes() = runTest {
        assertTrue(memory().shouldWarn("+14155550100"))
        clock += 60_000
        assertFalse(memory().shouldWarn("+14155550100"))
        clock += 90_000
        assertTrue(memory().shouldWarn("+14155550100"))
    }
}
```

`CallCheckerTest.kt`: a fake `PhoneLookup` returning a given score (or throwing `ApiException`, or delaying). Cases (write each as a test, full bodies):
1. known-list hit returns `Warn(LIKELY_SCAM, late=false)` and makes **no** lookup call.
2. `Not scam` number returns `Skip` with no lookup.
3. recent 7-day score 90 returns `Warn` with no lookup; recent 30 returns `Quiet`.
4. lookup score 85 while the call is active -> `Warn(LIKELY_SCAM, late=false)` and `remember` stored 85; score 65 -> `Warn(SUSPICIOUS)`; score 40 -> `Quiet(40)`.
5. lookup throws `ApiException("...", 502)` -> `Skip` (never a made-up verdict).
6. lookup answers but `callActive()` is false -> `Warn(... late = true)`.
7. lookup slower than the budget (fake delays 10 s, `budgetMs = 50`) with the call still active -> keeps waiting only until the call ends: assert it returns `Skip` when the lookup times out, and nothing is reported as safe.
8. hidden number -> `Skip` with no lookup.

Core of the first, as the pattern for the rest:

```kotlin
@Test fun knownScamNumberWarnsWithoutAnyLookup() = runTest {
    val memory = CallMemory(MapStore()) { 0L }.apply { setKnown(mapOf("+919876543210" to "Reported as a scam by 5 Argus users")) }
    val lookup = FakeLookup(score = 10)
    val out = CallChecker(memory, lookup).check("+919876543210", "IN") { true }
    assertEquals(CallLevel.LIKELY_SCAM, (out as CallOutcome.Warn).level)
    assertEquals(0, lookup.calls)
}
```

Extend `ArgusApiTest.kt` (follow its existing MockWebServer pattern): `phone("+919876543210", "IN", call = true)` sends `GET /api/app/phone?number=%2B919876543210&country=IN&call=1` with the bearer header and decodes `{verdict:…,cached:true}`; `scamNumbers()` decodes `{"numbers":[{"number":"+1…","label":"…"}]}`; `report(...)` sends `POST /api/app/report` with `{"number":…}`.

- [ ] **Step 2: Run to verify they fail**

Run: `. .\tools\env.ps1; .\gradlew.bat :app:testDebugUnitTest`
Expected: FAIL (unresolved references `CallPolicy`, `CallMemory`, `CallChecker`, `phone`, ...).

- [ ] **Step 3: Implement**

`CallPolicy.kt`:

```kotlin
package app.askargus.calls

enum class CallLevel { LIKELY_SCAM, SUSPICIOUS, NONE }

/** The rules for what a call result means for the person, with no Android in them. */
object CallPolicy {
    fun level(score: Int) = when {
        score >= 80 -> CallLevel.LIKELY_SCAM
        score >= 60 -> CallLevel.SUSPICIOUS
        else -> CallLevel.NONE
    }

    private val HIDDEN = setOf("", "-1", "-2", "unknown", "private number", "private", "withheld", "restricted")
    fun isHidden(raw: String?) = raw == null || raw.trim().lowercase() in HIDDEN

    fun title(level: CallLevel, late: Boolean, number: String): String = when {
        late && level == CallLevel.LIKELY_SCAM -> "That call from $number was likely a scam"
        late -> "That call from $number looked suspicious"
        level == CallLevel.LIKELY_SCAM -> "Likely scam call"
        else -> "Suspicious number calling"
    }

    fun silences(level: CallLevel, known: Boolean, silenceOn: Boolean) =
        silenceOn && known && level == CallLevel.LIKELY_SCAM
}
```

`CallMemory.kt`:

```kotlin
package app.askargus.calls

import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

interface KeyValueStore {
    suspend fun get(key: String): String?
    suspend fun put(key: String, value: String)
}

/** What this phone remembers about numbers: the daily scam list, its own recent verdicts (7 days), the numbers the
 *  person said are fine, and who it just warned about. All on the phone. */
class CallMemory(private val store: KeyValueStore, private val now: () -> Long = System::currentTimeMillis) {
    private val strings = MapSerializer(String.serializer(), String.serializer())
    private val longs = MapSerializer(String.serializer(), Long.serializer())

    private suspend fun stringsOf(key: String) = store.get(key)?.let { runCatching { Json.decodeFromString(strings, it) }.getOrNull() } ?: emptyMap()
    private suspend fun longsOf(key: String) = store.get(key)?.let { runCatching { Json.decodeFromString(longs, it) }.getOrNull() } ?: emptyMap()

    suspend fun setKnown(list: Map<String, String>) {
        store.put(KNOWN, Json.encodeToString(strings, list))
        store.put(KNOWN_AT, now().toString())
    }
    suspend fun knownScamLabel(number: String): String? = stringsOf(KNOWN)[number]
    suspend fun knownAt(): Long? = store.get(KNOWN_AT)?.toLongOrNull()

    suspend fun remember(number: String, score: Int) {
        val cutoff = now() - WEEK
        val kept = stringsOf(SEEN).filterValues { (it.substringBefore(':').toLongOrNull() ?: 0) >= cutoff }
        store.put(SEEN, Json.encodeToString(strings, kept + (number to "${now()}:$score")))
    }
    suspend fun recentScore(number: String): Int? {
        val (at, score) = stringsOf(SEEN)[number]?.split(':')?.takeIf { it.size == 2 } ?: return null
        return if (now() - (at.toLongOrNull() ?: return null) <= WEEK) score.toIntOrNull() else null
    }

    suspend fun markNotScam(number: String) {
        store.put(NOT_SCAM, Json.encodeToString(strings, stringsOf(NOT_SCAM) + (number to "1")))
    }
    suspend fun isNotScam(number: String) = number in stringsOf(NOT_SCAM)

    /** True the first time a number rings in two minutes; repeat rings don't warn or look up again. */
    suspend fun shouldWarn(number: String): Boolean {
        val recent = longsOf(WARNED).filterValues { now() - it < DEDUPE }
        if (number in recent) return false
        store.put(WARNED, Json.encodeToString(longs, recent + (number to now())))
        return true
    }

    private companion object {
        const val KNOWN = "calls.known"; const val KNOWN_AT = "calls.knownAt"; const val SEEN = "calls.seen"
        const val NOT_SCAM = "calls.notScam"; const val WARNED = "calls.warned"
        const val WEEK = 7L * 24 * 60 * 60 * 1000; const val DEDUPE = 2L * 60 * 1000
    }
}
```

`CallChecker.kt`:

```kotlin
package app.askargus.calls

import app.askargus.net.PhoneResponse
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.cancellation.CancellationException

interface PhoneLookup { suspend fun phone(number: String, country: String?, call: Boolean): PhoneResponse }

sealed interface CallOutcome {
    data object Skip : CallOutcome
    data class Quiet(val score: Int) : CallOutcome
    data class Warn(val level: CallLevel, val score: Int, val number: String, val summary: String, val late: Boolean = false, val known: Boolean = false) : CallOutcome
}

/** Decides what an incoming call deserves: the phone's own memory first, then one lookup within a short budget.
 *  A lookup that fails or runs out of time says nothing at all: never a made-up "safe". */
class CallChecker(private val memory: CallMemory, private val lookup: PhoneLookup, private val budgetMs: Long = 3_000) {
    suspend fun check(number: String, country: String?, callActive: () -> Boolean): CallOutcome {
        if (CallPolicy.isHidden(number)) return CallOutcome.Skip
        if (memory.isNotScam(number)) return CallOutcome.Skip
        memory.knownScamLabel(number)?.let { return CallOutcome.Warn(CallLevel.LIKELY_SCAM, 90, number, it, known = true) }
        memory.recentScore(number)?.let { return outcome(it, number, "Argus checked this number recently", late = false, known = it >= 80) }
        val answer = try {
            withTimeoutOrNull(budgetMs) { lookup.phone(number, country, call = true) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        } ?: return CallOutcome.Skip
        val score = answer.verdict.score
        memory.remember(number, score)
        return outcome(score, number, answer.verdict.threat_type.takeIf { it != "None" } ?: answer.verdict.level, late = !callActive(), known = false)
    }

    private fun outcome(score: Int, number: String, summary: String, late: Boolean, known: Boolean): CallOutcome {
        val level = CallPolicy.level(score)
        return if (level == CallLevel.NONE) CallOutcome.Quiet(score) else CallOutcome.Warn(level, score, number, summary, late, known)
    }
}
```

(Check `Verdict`'s field names in `core/Verdict.kt`: use its real `score`, `level`, and threat property; adjust `threat_type` to the real Kotlin name.)

`ArgusApi.kt` additions: `@Serializable data class PhoneResponse(val verdict: Verdict, val cached: Boolean = false, val id: String? = null)` and `@Serializable data class ScamNumber(val number: String, val label: String)` and `@Serializable data class ScamNumbers(val numbers: List<ScamNumber> = emptyList())`; make `ArgusApi` implement `PhoneLookup`:

```kotlin
override suspend fun phone(number: String, country: String?, call: Boolean): PhoneResponse =
    authed("GET", "/api/app/phone?number=${enc(number)}" + (country?.let { "&country=${enc(it)}" } ?: "") + if (call) "&call=1" else "", null, PhoneResponse.serializer())

suspend fun scamNumbers(): List<ScamNumber> =
    authed("GET", "/api/app/scam-numbers", null, ScamNumbers.serializer()).numbers

suspend fun report(number: String, country: String?) {
    authed("POST", "/api/app/report", buildJsonObject { put("number", number); country?.let { put("country", it) } }, JsonObject.serializer())
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `. .\tools\env.ps1; .\gradlew.bat :app:testDebugUnitTest`
Expected: PASS (new and existing tests).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/askargus/calls android/app/src/main/java/app/askargus/net/ArgusApi.kt android/app/src/test/java/app/askargus/calls android/app/src/test/java/app/askargus/net/ArgusApiTest.kt
git commit -m "feat(android): call decision rules, on-phone memory, checker and phone API calls"
```

---

### Task 5: The call-screening service, notifications and Scam / Not scam buttons

**Files:**
- Create: `calls/ArgusCallScreeningService.kt`, `calls/CallNotifications.kt`, `calls/CallActionReceiver.kt`
- Modify: `AndroidManifest.xml`, `AppContainer.kt`, `data/Prefs.kt`, `work/Notifications.kt` (new channel)
- Test: `calls/CallNotificationsTextTest.kt` (the wording builder only; the rest is emulator-tested in Task 8)

**Interfaces:**
- Consumes: `CallChecker`, `CallMemory`, `CallPolicy`, `ArgusApi.report`, `ActivityDao.add`.
- Produces: `Prefs.callWarnings: Flow<Boolean>` + `setCallWarnings(Boolean)`, `Prefs.silenceCalls: Flow<Boolean>` + `setSilenceCalls(Boolean)`, `Prefs.store: KeyValueStore`; `AppContainer.callMemory`, `AppContainer.callChecker`; `CallNotifications.show(context, warn: CallOutcome.Warn)`; channels `calls_high` (HIGH importance) and `calls_quiet` (DEFAULT).

- [ ] **Step 1: Prefs and container**

In `Prefs.kt` add keys `callWarnings` and `silenceCalls` (boolean) with `val callWarnings: Flow<Boolean> = data.map { it[K.callWarnings] ?: false }`, `suspend fun setCallWarnings(on: Boolean)`, same for `silenceCalls`, and a `KeyValueStore`:

```kotlin
val store: app.askargus.calls.KeyValueStore = object : app.askargus.calls.KeyValueStore {
    override suspend fun get(key: String) = data.first()[stringPreferencesKey(key)]
    override suspend fun put(key: String, value: String) { context.argusPrefs.edit { it[stringPreferencesKey(key)] = value } }
}
```

In `AppContainer.kt`: `val callMemory = CallMemory(prefs.store)` and `val callChecker = CallChecker(callMemory, api)`.

- [ ] **Step 2: Write the failing test for the wording**

`CallNotificationsTextTest.kt` asserts `CallNotifications.body(warn)` returns "Reported as a scam by 5 Argus users" for a known hit, "Argus checked this number recently" for a remembered one, and that a late warning's body ends with "Tap Scam to report it." (pure function, no Context). Run the test; expected FAIL, then implement.

- [ ] **Step 3: Implement the notifications**

`CallNotifications.kt`:

```kotlin
object CallNotifications {
    const val HIGH = "calls_high"
    const val QUIET = "calls_quiet"
    const val EXTRA_NUMBER = "number"
    const val ACTION_SCAM = "app.askargus.action.CALL_SCAM"
    const val ACTION_NOT_SCAM = "app.askargus.action.CALL_NOT_SCAM"

    fun createChannels(context: Context) {
        val m = context.getSystemService(NotificationManager::class.java)
        m.createNotificationChannel(NotificationChannel(HIGH, "Scam call warnings", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Shown while a likely scam call is ringing"
        })
        m.createNotificationChannel(NotificationChannel(QUIET, "Suspicious call notes", NotificationManager.IMPORTANCE_DEFAULT))
    }

    fun body(w: CallOutcome.Warn): String =
        if (w.late) "${w.summary}. Tap Scam to report it." else w.summary

    @SuppressLint("MissingPermission") // checked just below
    fun show(context: Context, w: CallOutcome.Warn) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val id = w.number.hashCode()
        fun action(name: String, label: String, req: Int) = NotificationCompat.Action.Builder(
            0, label,
            PendingIntent.getBroadcast(
                context, id + req,
                Intent(name).setPackage(context.packageName).putExtra(EXTRA_NUMBER, w.number).putExtra("id", id),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            ),
        ).build()
        val high = w.level == CallLevel.LIKELY_SCAM
        val n = NotificationCompat.Builder(context, if (high) HIGH else QUIET)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(CallPolicy.title(w.level, w.late, w.number))
            .setContentText(body(w))
            .setPriority(if (high) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .addAction(action(ACTION_SCAM, "Scam", 1))
            .addAction(action(ACTION_NOT_SCAM, "Not scam", 2))
            .build()
        NotificationManagerCompat.from(context).notify(id, n)
    }
}
```

`CallActionReceiver.kt` (non-exported receiver; `goAsync` with a coroutine):

```kotlin
class CallActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val number = intent.getStringExtra(CallNotifications.EXTRA_NUMBER) ?: return
        val id = intent.getIntExtra("id", 0)
        val container = (context.applicationContext as ArgusApp).container
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                when (intent.action) {
                    CallNotifications.ACTION_NOT_SCAM -> container.callMemory.markNotScam(number)
                    CallNotifications.ACTION_SCAM -> {
                        container.callMemory.remember(number, 100)
                        runCatching { container.api.report(number, null) }
                    }
                }
            } finally {
                NotificationManagerCompat.from(context).cancel(id)
                pending.finish()
            }
        }
    }
}
```

(`report` sends the number exactly as the service captured it, which Task 5 normalises where possible; the SIM country goes with it from the service: store it in the intent as `"country"` and pass it through.)

`ArgusCallScreeningService.kt`:

```kotlin
@RequiresApi(Build.VERSION_CODES.Q)
class ArgusCallScreeningService : CallScreeningService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onScreenCall(details: Call.Details) {
        val app = applicationContext as ArgusApp
        val container = app.container
        val number = details.handle?.schemeSpecificPart
        val silenceNow = runBlocking { silenceKnown(container, number) }  // reads only the phone's own list, so it's instant
        respondToCall(details, CallResponse.Builder().setDisallowCall(false).setSilenceCall(silenceNow).build())
        if (CallPolicy.isHidden(number) || details.callDirection != Call.Details.DIRECTION_INCOMING) return
        scope.launch { run(container, number!!) }
    }

    private suspend fun silenceKnown(c: AppContainer, number: String?): Boolean {
        if (CallPolicy.isHidden(number)) return false
        val on = c.prefs.silenceCalls.first()
        val known = c.callMemory.knownScamLabel(number!!) != null && !c.callMemory.isNotScam(number)
        return CallPolicy.silences(CallLevel.LIKELY_SCAM, known, on)
    }

    private suspend fun run(c: AppContainer, number: String) {
        if (!c.prefs.callWarnings.first() || !c.account.isSignedIn()) return
        if (!c.callMemory.shouldWarn(number)) return
        val country = getSystemService(TelephonyManager::class.java)?.simCountryIso?.uppercase()?.ifBlank { null }
        val started = System.currentTimeMillis()
        // The call is "active" while it has not been hung up; the service can't see hang-up, so a lookup that takes
        // longer than 20 s is reported in the past tense.
        val outcome = c.callChecker.check(number, country) { System.currentTimeMillis() - started < 20_000 }
        when (outcome) {
            is CallOutcome.Warn -> {
                CallNotifications.show(this, outcome)
                log(c, number, outcome.score, outcome)
            }
            is CallOutcome.Quiet -> log(c, number, outcome.score, null)
            CallOutcome.Skip -> Unit
        }
    }

    private suspend fun log(c: AppContainer, number: String, score: Int, w: CallOutcome.Warn?) {
        c.activity.add(ActivityEvent(at = System.currentTimeMillis(), type = "call", kind = "call", subject = number,
            score = score, level = w?.level?.name, source = "call"))
    }
}
```

(`Account` has no `isSignedIn()` yet: use `container.account.session.value != null`, the existing `session` StateFlow. The 3 s lookup budget plus the 20 s window keeps a slow-engine answer past-tense. If Activity's UI maps `type`/`kind` through a `when`, add the `call` case; check `ui/activity/` for how `scan` events render and add "Call" with the same row layout.)

Manifest additions inside `<application>`:

```xml
<service
    android:name=".calls.ArgusCallScreeningService"
    android:exported="true"
    android:permission="android.permission.BIND_SCREENING_SERVICE">
    <intent-filter>
        <action android:name="android.telecom.CallScreeningService" />
    </intent-filter>
</service>
<receiver android:name=".calls.CallActionReceiver" android:exported="false" />
```

In `ArgusApp.onCreate`: `CallNotifications.createChannels(this)`.

- [ ] **Step 4: Run to verify the build and tests pass**

Run: `. .\tools\env.ps1; .\gradlew.bat :app:testDebugUnitTest :app:assembleDebug`
Expected: PASS and a debug APK built. (Call it `minSdk 26`-safe: the service class is `@RequiresApi(29)`; the manifest entry is harmless on 26-28.)

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main
git commit -m "feat(android): call-screening service with Scam and Not scam notification buttons"
```

---

### Task 6: The switch, the role request and the daily scam list

**Files:**
- Create: `calls/CallRole.kt`, `work/ScamListWorker.kt`
- Modify: `ui/settings/SettingsScreen.kt`, `ui/home/HomeScreen.kt`, `ArgusApp.kt`, `MainActivity.kt` (role check on start)
- Test: `calls/CallRoleTest.kt` (pure decision function only)

**Interfaces:**
- `object CallRole { enum class State { NEEDS_SIGN_IN, UNSUPPORTED, OFF, ON }; fun state(sdk: Int, signedIn: Boolean, switchOn: Boolean, holdsRole: Boolean): State; fun requestIntent(context: Context): Intent?; fun holds(context: Context): Boolean }`
- `ScamListWorker.schedule(context)`, a daily WorkManager job (network required) that calls `api.scamNumbers()` and `callMemory.setKnown(...)`; it keeps the old list on failure.

- [ ] **Step 1: Write the failing test**

```kotlin
class CallRoleTest {
    @Test fun oldAndroidIsUnsupported() = assertEquals(CallRole.State.UNSUPPORTED, CallRole.state(28, true, true, false))
    @Test fun signedOutNeedsSignIn() = assertEquals(CallRole.State.NEEDS_SIGN_IN, CallRole.state(34, false, false, false))
    @Test fun switchOnButRoleLostIsOff() = assertEquals(CallRole.State.OFF, CallRole.state(34, true, true, false))
    @Test fun switchOnWithRoleIsOn() = assertEquals(CallRole.State.ON, CallRole.state(34, true, true, true))
}
```

Run `.\gradlew.bat :app:testDebugUnitTest`; expected FAIL (`CallRole` missing).

- [ ] **Step 2: Implement `CallRole.kt`**

```kotlin
object CallRole {
    enum class State { NEEDS_SIGN_IN, UNSUPPORTED, OFF, ON }

    fun state(sdk: Int, signedIn: Boolean, switchOn: Boolean, holdsRole: Boolean) = when {
        sdk < 29 -> State.UNSUPPORTED
        !signedIn -> State.NEEDS_SIGN_IN
        switchOn && holdsRole -> State.ON
        else -> State.OFF
    }

    fun holds(context: Context): Boolean = Build.VERSION.SDK_INT >= 29 &&
        context.getSystemService(RoleManager::class.java).isRoleHeld(RoleManager.ROLE_CALL_SCREENING)

    fun requestIntent(context: Context): Intent? = if (Build.VERSION.SDK_INT >= 29)
        context.getSystemService(RoleManager::class.java).createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING) else null
}
```

- [ ] **Step 3: The worker**

```kotlin
class ScamListWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val c = (applicationContext as ArgusApp).container
        if (c.account.session.value == null) return Result.success()
        return try {
            c.callMemory.setKnown(c.api.scamNumbers().associate { it.number to it.label })
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    companion object {
        fun schedule(context: Context) = WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "scam-list", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<ScamListWorker>(1, TimeUnit.DAYS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES).build(),
        )
    }
}
```

Call `ScamListWorker.schedule(this)` in `ArgusApp.onCreate` beside `UpdateCheckWorker.schedule(this)`; copy the exact WorkManager imports from `UpdateCheckWorker.kt`.

- [ ] **Step 4: Settings and Home switch**

In `SettingsScreen.kt` add a section above "Family" (follow the existing `Section(...) { ... }` style):

- `rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult())`. When the result returns, re-read `CallRole.holds(context)`; if held, `prefs.setCallWarnings(true)` and kick `ScamListWorker` once (`OneTimeWorkRequestBuilder<ScamListWorker>()`); if not, leave it off and show "Android didn't give Argus the call-screening role, so warnings stay off."
- `val state = CallRole.state(Build.VERSION.SDK_INT, session != null, switchOn, CallRole.holds(context))`.
- Copy per state: `NEEDS_SIGN_IN` -> "Sign in to turn on call warnings." (switch disabled); `UNSUPPORTED` -> "Needs Android 10 or newer." (disabled); `OFF` -> "Warns you while a scam number is calling. Only numbers that aren't in your contacts are checked." with a Switch that launches `CallRole.requestIntent`; `ON` -> same text, switch on, turning it off calls `prefs.setCallWarnings(false)` and explains that the Android role can be removed in Settings > Apps > Default apps > Caller ID & spam.
- A second switch "Silence likely scam calls" (only enabled when call warnings are on) with the line "Only silences numbers Argus already knows are scams. The call still shows in your recents."
- On app start (`MainActivity.onStart` or the `ArgusApp` process start) and from the daily worker: if `prefs.callWarnings` is true but `!CallRole.holds(...)`, call `prefs.setCallWarnings(false)` and show a quiet notification "Call warnings turned off: Argus no longer has the call-screening role."

`HomeScreen.kt`: add a compact "Call warnings" card showing "On" / "Off, tap to turn on" that navigates to Settings (`Routes.SETTINGS`; reuse the existing route constant) and remove "Warnings while a scam call rings" from the COMING list.

- [ ] **Step 5: Build, test, commit**

Run: `. .\tools\env.ps1; .\gradlew.bat :app:testDebugUnitTest :app:assembleDebug`
Expected: PASS and APK built.

```bash
git add android/app/src
git commit -m "feat(android): call warnings switch, role request and daily scam list"
```

---

### Task 7: Website copy, privacy and docs

**Files:**
- Modify: `web/src/app/app/page.tsx`, the privacy page (find it with `grep -ril "privacy" web/src/app`), `docs/superpowers/specs/2026-09-30-android-app-design.md` (mark Phase 2 done at release), `AI_HANDOFF.md` if present.

- [ ] **Step 1:** On the download page, move "Warnings while a scam call rings" from "Coming next" to a "What it does" line: "Warns you while an unknown number is calling (Android 10 or newer)." Leave the other two coming items.
- [ ] **Step 2:** On the privacy page add, in the Android app section: the app sees the number of incoming calls from people **not** in your contacts only after you switch call warnings on; the number is sent to Argus to be checked and the answer is shared for 24 hours with no account attached; nothing is recorded or heard; "Not scam" stays on your phone; "Scam" sends only the number as a report from your account.
- [ ] **Step 3:** `cd web && npx tsc --noEmit && npx vitest run`, then commit:

```bash
git add web docs AI_HANDOFF.md
git commit -m "docs(web): describe call warnings and what they send"
```

---

### Task 8: Emulator end to end, then the 0.2.0 release steps

**Files:**
- Create: `.superpowers/e2e/android_calls.py` (git-ignored helper, like the other e2e scripts)

- [ ] **Step 1: Deploy the backend pieces first (needs the user)** Ask the user to (a) apply the Task 2 migration in Supabase, (b) push to `main` so Vercel deploys the web routes and Render redeploys the engine. Wait for them to confirm; do not push on their behalf without the go-ahead. Then wake the engine with `u.wake_engine()`.
- [ ] **Step 2: Write the e2e script** using the `adbui.py` helpers: `u.sign_in_fresh()`, open Settings, tap the call-warnings switch, accept the role dialog (`u.tap("Argus", exact=True)` then the "Set as default" button, whichever text the dialog shows; take a screenshot to confirm), then:
  1. `adb emu gsm call +18775569255` (a number on the blocklist/community known to score high, verify with the Check screen first); `u.wait_for("scam", timeout=20)` on the heads-up; screenshot `call-warning.png`; `adb emu gsm cancel +18775569255`.
  2. Tap **Not scam**; call again; assert no second notification (`find("Likely scam call") is None`).
  3. Open Activity and assert a `+1877…` row exists.
  4. Hidden number: `adb emu gsm call 0` and assert no notification.
  5. Past-tense: with Wi-Fi/data off (`adb shell svc data disable`) nothing must appear and nothing be shown as safe; re-enable.
- [ ] **Step 3: Run it.** `api/.venv/Scripts/python .superpowers/e2e/android_calls.py`. Expected: all PASS. Read the screenshots to confirm the look.
- [ ] **Step 4: Release.** Bump `versionCode = 2`, `versionName = "0.2.0"` in `android/app/build.gradle.kts`, build the signed release (same steps as 0.1.0: `.\gradlew.bat :app:assembleRelease`, tag `android-v0.2.0`, GitHub release with the APK). Re-run the e2e on the release APK, then update the spec's phase table and commit.

---

## Self-Review

- **Spec coverage:** call-screening role and immediate answer (Tasks 5, 6); on-phone known list + 7-day memory + Not scam (Task 4); 3 s parallel lookup with late past-tense warning (Tasks 4, 5); thresholds 80/60 (Task 4); Scam report and cache clear (Task 3, 5); save >= 60 as kind `call` and family alerts (Task 3); hidden numbers (Task 4); silence option (Tasks 4, 6); Android < 10 fallback and role-removed detection (Task 6); `/api/app/phone`, `/report`, `/scam-numbers`, cache functions and `known_scam_numbers()` (Tasks 2, 3); 200 lookups cap (Task 3); 140/1600 series and bank-mobile text rule (Task 1); Activity logging (Task 5); privacy and download page (Task 7); emulator test with `adb emu gsm call` (Task 8). The engine's TRAI advisory shown on every valid Indian number is removed (Task 1).
- **Placeholders:** the "match the exact shape" notes in Tasks 3 and 5 name the files to read for the real signatures (`family-alerts.ts`, `core/Verdict.kt`, `Account.session`); everything else has code.
- **Type consistency:** `CallOutcome.Warn(level, score, number, summary, late, known)` is used the same in Tasks 4 and 5; `PhoneLookup.phone(number, country, call)` is implemented by `ArgusApi.phone`; `KeyValueStore` is implemented by `Prefs.store` and `MapStore`.
- **Review Focus:** national-format numbers (Task 3 `cleanNumber` tests), asleep engine (Task 4 case 5 and 7), repeat rings (Task 4 `shouldWarn`), Not scam persistence (Task 4 `notScamSticks`, DataStore-backed), role lost (Task 6 `CallRoleTest`), series and advisory (Task 1 tests).
