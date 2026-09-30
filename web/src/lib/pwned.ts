// Has a password turned up in a data breach? Asked of Have I Been Pwned without the password leaving the device:
// only the first 5 characters of its SHA-1 fingerprint are sent, and the service answers with every breached
// fingerprint that starts that way (padded with decoys), which are compared here.

export const PWNED_RANGE_URL = "https://api.pwnedpasswords.com/range/";

export async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** How many breaches a fingerprint's last 35 characters appear in, from a range answer. Padding lines count 0. */
export function countFor(rangeBody: string, suffix: string): number {
  const wanted = suffix.toUpperCase();
  for (const line of rangeBody.split(/\r?\n/)) {
    const [ending, count] = line.trim().split(":");
    if (ending === wanted) return Number(count) || 0;
  }
  return 0;
}

export async function pwnedCount(password: string, fetcher: typeof fetch = fetch): Promise<number> {
  const hash = await sha1Hex(password);
  const res = await fetcher(`${PWNED_RANGE_URL}${hash.slice(0, 5)}`, { headers: { "Add-Padding": "true" } });
  if (!res.ok) throw new Error(`Have I Been Pwned answered ${res.status}`);
  return countFor(await res.text(), hash.slice(5));
}
