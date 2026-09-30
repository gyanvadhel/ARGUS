// What a QR code holds, sorted by where it should go: UPI codes get their own warning (Argus's engine has no
// UPI check), links go to a link check, numbers to Caller ID, and anything else to a text check.

export type QrPayload =
  | { kind: "upi"; mandate: boolean; payee: string; name: string | null; amount: string | null; note: string | null }
  | { kind: "url"; url: string }
  | { kind: "phone"; number: string }
  | { kind: "text"; text: string };

function upi(raw: string): QrPayload | null {
  const match = /^upi:\/\/(pay|mandate)\b[^?]*\?(.*)$/i.exec(raw);
  if (!match) return null;
  const params = new URLSearchParams(match[2]);
  const payee = params.get("pa")?.trim();
  if (!payee) return null;
  const field = (name: string) => params.get(name)?.trim() || null;
  return { kind: "upi", mandate: match[1].toLowerCase() === "mandate", payee, name: field("pn"), amount: field("am"), note: field("tn") };
}

export function parseQr(value: string): QrPayload {
  const raw = value.trim();
  const payment = upi(raw);
  if (payment) return payment;
  if (/^https?:\/\//i.test(raw)) return { kind: "url", url: raw };
  if (/^www\.\S+$/i.test(raw)) return { kind: "url", url: `https://${raw}` };
  const tel = /^tel:([+\d][\d\s()-]*)$/i.exec(raw);
  if (tel) return { kind: "phone", number: tel[1].replace(/[\s()-]/g, "") };
  const sms = /^smsto:([^:]*):([\s\S]*)$/i.exec(raw);
  if (sms) return { kind: "text", text: [sms[2].trim(), sms[1].trim()].filter(Boolean).join("\n") };
  return { kind: "text", text: raw };
}
