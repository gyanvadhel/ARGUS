// The Android app's phone lookups: reading the number the phone's dialer handed over.

// Countries whose national numbers the app may send without a "+": calling code and national number length.
const COUNTRIES: Record<string, { code: string; length: number }> = {
  IN: { code: "91", length: 10 },
  US: { code: "1", length: 10 },
  CA: { code: "1", length: 10 },
  GB: { code: "44", length: 10 },
};

/** "+digits" for a number the phone handed over, or null when we can't be sure which number it is. */
export function cleanNumber(raw: string, country?: string): string | null {
  const text = raw.trim();
  const digits = text.replace(/\D/g, "");
  let e164: string;
  if (text.startsWith("+")) {
    e164 = `+${digits}`;
  } else if (digits.startsWith("00")) {
    e164 = `+${digits.slice(2)}`;
  } else {
    const home = COUNTRIES[(country ?? "").toUpperCase()];
    if (!home) return null;
    const national = digits.replace(/^0+/, "");
    const withCode = national.length === home.code.length + home.length && national.startsWith(home.code);
    e164 = withCode ? `+${national}` : `+${home.code}${national}`;
  }
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

export function parsePhoneQuery(url: URL): { number: string; call: boolean } | { error: string } {
  const number = cleanNumber(url.searchParams.get("number") ?? "", url.searchParams.get("country") ?? undefined);
  if (!number) return { error: "That doesn't look like a phone number." };
  return { number, call: url.searchParams.get("call") === "1" };
}

export function parseReportBody(body: unknown): { number: string } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as { number?: unknown; country?: unknown };
  const country = typeof b.country === "string" ? b.country : undefined;
  const number = typeof b.number === "string" ? cleanNumber(b.number, country) : null;
  return number ? { number } : { error: "That number can't be reported." };
}
