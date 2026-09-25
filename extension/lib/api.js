// Talking to the Argus scanning engine, and the extension's settings.

export const DEFAULTS = {
  api: "http://127.0.0.1:8000", // the Argus scanning engine
  app: "http://localhost:3000", // the Argus web app, for "See the full evidence"
  protect: true, // warn before dangerous pages open
};

export async function getSettings() {
  return { ...DEFAULTS, ...(await chrome.storage.sync.get(Object.keys(DEFAULTS))) };
}

async function post(path, body, timeoutMs) {
  const { api } = await getSettings();
  let res;
  try {
    res = await fetch(api.replace(/\/$/, "") + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new Error(e?.name === "TimeoutError" ? "Argus took too long to answer." : "Argus's scanning engine isn't running.");
  }
  if (!res.ok) throw new Error(`Argus couldn't check this (${res.status}).`);
  return res.json();
}

/** Instant: the address, the live feeds and site reputation. Fast enough to run as a page starts loading. */
export const quickCheck = (url) => post("/scan/quick", { input: url }, 2500);

/** Complete: also visits the site safely (DNS, certificate, redirects, what the page asks for). */
export const fullCheck = (url) => post("/scan", { input: url, kind: "url" }, 30000);

export async function evidenceUrl(url) {
  const { app } = await getSettings();
  return `${app.replace(/\/$/, "")}/scan?input=${encodeURIComponent(url)}`;
}
