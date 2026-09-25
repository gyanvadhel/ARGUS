# Argus: the watcher that never sleeps

An all-in-one security web app. Paste a link, email, text or phone number, or drop a file, and Argus checks it
against real threat intelligence (VirusTotal, URLhaus, MalwareBazaar, Google Safe Browsing, RDAP domain records)
plus its own ML model, then gives one plain-language verdict with the evidence behind it.

## Run it

1. **API keys (all free):** copy `.env.example` to `api/.env` and fill in what you have. Missing keys just show
   "Not configured"; everything else keeps working.
   - VirusTotal: virustotal.com, sign up, open "API key"
   - Google Safe Browsing: Google Cloud Console, enable the Safe Browsing API, create a key
   - abuse.ch (URLhaus + MalwareBazaar): auth.abuse.ch
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

1. **Landing page:** move your cursor and the eye follows it. Click **a phishing link** under the hero box for a
   no-account verdict, then scroll: the camera dives into the pupil. Hover the rows under "What it watches".
2. **Create free account**, then **Scan** sample **Phishing link**: the eye squints red, and the evidence explains why.
3. Sample **EICAR test file**: High risk. Every antivirus flags this harmless test file on purpose.
4. Sample **Spoofed email**: SPF and DMARC failures, a reply-to mismatch, and the link inside scanned too.
5. **Caller ID**: look up **Known scam line** (Likely scam), then **One-ring trap** and **Look-alike area code**
   (brand-new scam numbers that reputation-only apps miss). Press **Simulate a call from this number**, then
   **Block and report**, and look the number up again to see the community report.
6. Scan a scam text that contains a phone number, then look that number up in Caller ID: it's now "seen in a scam message".
7. **Overview**: the dashboard has counted everything.

## Layout

- `api/`: FastAPI scanner (stateless; reuses the original `risk_engine.py`)
- `web/`: Next.js app (Supabase auth + Postgres with row-level security)
- `supabase/migrations/`: database schema
- `ARGUS-main/`: the original Streamlit prototype, kept for reference
- `docs/superpowers/`: design spec and implementation plan
