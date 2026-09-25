# Argus browser extension

Warns you before phishing and malware pages open, and checks any link in one click. Works in Chrome and Edge.

## What it does

- **Warns before a dangerous page opens.** As a page starts loading, its address is checked against Argus's live
  phishing and malware feeds, look-alike detection and site reputation. That's an instant check, done in milliseconds.
  Anything Suspicious or worse is replaced by a warning page. "Continue anyway" lets you through for the rest of the
  browser session.
- **Toolbar popup.** Shows the verdict for the page you're on, then runs the full check. The full check visits the
  site safely: DNS, certificate, redirects, and what the page asks for. You can also paste any link to check it.
- **Right-click any link or page** and choose "Check this link with Argus".
- **Badge.** A "!" on risky pages and a tick on verified-safe ones.

If the Argus engine isn't running, the extension never blocks browsing. It just can't give a verdict.

## Install (developer mode)

1. Start Argus (`dev.ps1` from the repo root) so the engine is running on `http://127.0.0.1:8000`.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick this `extension` folder.
4. Pin Argus to the toolbar.

Settings (right-click the icon, then **Options**) let you point it at a different engine or web app address.

## Tests

```
npm test    # node's built-in test runner, no dependencies
```

## Credits

The typeface is Archivo by Omnibus-Type, used under the SIL Open Font License 1.1 (see `fonts/FONT-LICENSE.txt`).
