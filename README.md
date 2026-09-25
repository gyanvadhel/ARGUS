# Argus: the watcher that never sleeps

An all-in-one security app. Paste a link, email, text or phone number, drop a file, connect your Gmail inbox, or let
the browser extension watch the pages you open. Argus checks each one against real threat intelligence and gives one
plain-language verdict, with the evidence behind it.

## What it checks

- **Links:**
  - live phishing and malware feeds: URLhaus, OpenPhish and Phishing.Database, downloaded free and refreshed every 6 hours
  - look-alikes of the 10,000 most visited sites (Tranco)
  - a safe visit to the site itself: DNS, certificate, redirects, and what the page asks you for
  - domain age
- **Phone numbers:**
  - whether the number can exist at all, and what kind of line it is
  - one-ring callback traps
  - complaints filed with the FCC (US and Canadian numbers)
  - reports from Argus users, and numbers seen in scam messages
- **Emails:** sender authentication (SPF, DKIM, DMARC), spoofed names, reply-to tricks, and every link and number inside.
- **Texts:** the Argus scam model and scam-phrase rules, plus every link and number inside.
- **Files:** inspection for disguised programs and macros, plus 70+ antivirus engines via VirusTotal.

Warning signs add up instead of cancelling out. Argus only says **Safe** when something positive vouches for it, like
one of the world's most visited sites, an authenticated email from a well-known sender, or a file VirusTotal has known
clean for a month. Otherwise the best it will say is **No red flags**.

## Run it

1. **Install once:**
   ```powershell
   python -m venv api/.venv; api/.venv/Scripts/python -m pip install -r api/requirements.txt
   cd web; npm install; cd ..
   ```
2. **Web env:** copy `web/.env.example` to `web/.env.local` and add your Supabase URL and publishable key.
3. **Optional keys:** copy `api/.env.example` to `api/.env`. Everything above works without keys. A free VirusTotal
   key adds 70+ antivirus engines; Google Safe Browsing and abuse.ch keys add those services too.
4. **Start:** `./dev.ps1`, then open http://localhost:3000. On first start the engine downloads about 20 MB of threat
   feeds in the background.

## Connect Gmail (optional)

The Inbox page reads your latest emails (read-only) and checks each one. It needs a Google sign-in app that belongs
to whoever runs the server. Setting it up takes about ten minutes:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (for example "Argus").
2. **APIs & Services → Library:** find **Gmail API** and click **Enable**.
3. **Google Auth Platform** (older consoles call it **OAuth consent screen**) → **Get started:**
   - name the app Argus and choose your email as the support email
   - pick **External** as the audience
   - finish the wizard
4. **Audience → Test users → Add users:** add the Gmail address you'll connect. While the app is in testing, only test
   users can connect, and Google asks them to reconnect every 7 days.
5. **Data access → Add or remove scopes:** add `https://www.googleapis.com/auth/gmail.readonly`.
6. **Clients → Create client:**
   - choose **Web application** as the type
   - add `http://localhost:3000/api/gmail/callback` under authorized redirect URIs
   - click **Create**
7. Put the client ID and secret in `web/.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The file also
   needs `GMAIL_TOKEN_KEY` (32 random bytes, base64; there's a command to generate one in `web/.env.example`). Argus
   uses it to encrypt Gmail tokens before storing them.
8. Restart the web app, open **Inbox** and click **Connect Gmail**. Google will warn that it hasn't verified the app.
   That's expected for your own app: choose **Continue**.

## Family alerts on Telegram (optional)

Trusted contacts who connect on Telegram get a message the moment something high-risk reaches you: a scan, an
inbox email or a call. Alerts say what kind of thing it was and how risky. They never include what your messages
or emails said, and links are written so they can't be clicked. To set it up:

1. In Telegram, open **@BotFather**, send `/newbot`, and give the bot a name and a username ending in `bot`.
2. Put the token BotFather gives you in `web/.env.local` as `TELEGRAM_BOT_TOKEN`, then restart the web app.
3. In **Family**, add a contact and click **Connect Telegram**. They scan the QR code (or open the link) and press
   **Start**; Argus confirms within a few seconds and sends them a welcome message.

## Browser extension

`extension/` is a Chrome and Edge extension. It warns you before dangerous pages open, shows a verdict for the page
you're on, and checks any link from the right-click menu. To install it, open `chrome://extensions` (or
`edge://extensions`), turn on **Developer mode**, click **Load unpacked** and pick the `extension` folder. More in
[extension/README.md](extension/README.md).

## Tests

```powershell
cd api; .venv/Scripts/python -m pytest -q
cd ../web; npm test; npm run build
cd ../extension; npm test
```

## Demo script

1. **Landing page:** move your cursor and the eye follows it. Try **a phishing link** under the search line for a
   no-account verdict, then scroll: the camera dives into the pupil. Hover the rows under "What it watches".
2. **Create a free account**, then **Scan** the **Phishing link** sample: the eye squints red and the evidence says why.
   Then scan `https://www.google.com`: **Safe**, with positive evidence behind it.
3. **Spoofed email** and **EICAR test file** samples: SPF and DMARC failures; a harmless file every antivirus flags on purpose.
4. **Caller ID:**
   - **Reported robocaller** is a real number with FCC complaints about robocalls.
   - **Faked caller ID** is a number that can't exist, so the caller ID was forged.
   - **One-ring trap** and **Look-alike area code** are brand-new scam numbers that reputation-only apps miss.
   - Press **Simulate a call from this number** to see the incoming-call screen.
5. **Inbox:** connect Gmail and watch your latest emails get checked one by one. Open **Spam** to see what Gmail
   caught, with Argus's reasons.
6. **Family:** connect someone on Telegram (they scan the QR code), then simulate a call from the reported
   robocaller: their phone gets the alert while it rings.
7. **Extension:** load it, then open `http://paypal-security-alert.net/verify`: Argus stops the page before you can use it.
8. **Overview:** the dashboard has counted everything and shows the live threat feeds.

## Layout

- `api/`: FastAPI scanning engine (threat feeds, link, phone, email, text and file checks)
- `web/`: Next.js app (Supabase auth + Postgres with row-level security)
- `extension/`: the Chrome and Edge extension
- `supabase/migrations/`: database schema
- `ARGUS-main/`: the original Streamlit prototype, kept for reference
- `docs/superpowers/`: design spec and implementation plan
