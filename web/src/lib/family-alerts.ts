import "server-only";
import { sendMessage, telegramToken } from "./telegram";
import type { createClient } from "./supabase/server";
import type { ScanKind } from "./types";

// Telling trusted contacts when something high-risk reaches someone. Privacy first: an alert says what kind of
// thing it was and how risky, never what their messages or emails said, and links are written so they can't be clicked.

export const ALERT_AT = 80; // High risk
const REPEAT_WINDOW_MS = 10 * 60 * 1000;

export type AlertEvent =
  | { kind: "scan"; scanKind: ScanKind; subject: string; score: number; label: string; threat: string }
  | { kind: "call"; number: string; score: number; label: string; reason: string; simulated: boolean }
  | { kind: "test" };

type ContactRow = { id: string; notify_high_risk: boolean; telegram_chat_id: number | null };
type RecentAlert = { subject: string; created_at: string };

const WHAT: Record<ScanKind, string> = {
  url: "a link",
  email: "an email",
  text: "a message",
  phone: "a phone number",
  file: "a file",
  call: "a call",
};

/** "http://paypal-security-alert.net/verify" becomes "paypal-security-alert[.]net": readable, never clickable. */
function defang(url: string): string {
  const host = url.replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0];
  return host.replace(/\./g, "[.]");
}

export function composeAlert(event: AlertEvent, person: string): string {
  if (event.kind === "test") {
    return `Argus test alert. You're a trusted contact for ${person}, so you'll hear from me here if something high-risk reaches them.`;
  }
  if (event.kind === "call") {
    return [
      `⚠️ Argus alert for ${person}`,
      `They're getting a call from ${event.number} right now. Argus rates it ${event.label} (${event.score}/100): ${event.reason}.`,
      "If you can, check in with them before they share any codes or money.",
      ...(event.simulated ? ["(This was a simulated call in the Argus demo.)"] : []),
    ].join("\n");
  }
  const detail = event.scanKind === "url" ? `: ${defang(event.subject)}` : event.scanKind === "phone" ? `: ${event.subject}` : "";
  return [
    `⚠️ Argus alert for ${person}`,
    `They just came across ${WHAT[event.scanKind]} Argus rates ${event.label} (${event.score}/100)${detail}.`,
    `What it looks like: ${event.threat}.`,
    "Worth a quick call to make sure they haven't clicked, paid or shared anything.",
  ].join("\n");
}

/** Who to tell: contacts connected on Telegram with alerts on, unless this same alert went out in the last 10 minutes. */
export function planAlerts(contacts: ContactRow[], recent: RecentAlert[], subject: string, now = new Date()) {
  const repeat = recent.some((r) => r.subject === subject && now.getTime() - Date.parse(r.created_at) < REPEAT_WINDOW_MS);
  if (repeat) return [];
  return contacts
    .filter((c) => c.notify_high_risk && c.telegram_chat_id != null)
    .map((c) => ({ contactId: c.id, chatId: c.telegram_chat_id as number }));
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

function subjectOf(event: AlertEvent): string {
  return event.kind === "call" ? event.number : event.kind === "scan" ? event.subject.slice(0, 300) : "test";
}

/** Send the alert to everyone who should get it and log each one. Returns how many contacts were told. */
export async function alertFamily(supabase: Supabase, event: AlertEvent, onlyContact?: string): Promise<number> {
  const token = telegramToken();
  if (!token) return 0;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const person = String(user.user_metadata?.full_name ?? "").split(" ")[0] || "your family member";
  let query = supabase.from("trusted_contacts").select("id, notify_high_risk, telegram_chat_id");
  if (onlyContact) query = query.eq("id", onlyContact);
  const [{ data: contacts }, { data: recent }] = await Promise.all([
    query,
    supabase
      .from("family_alerts")
      .select("subject, created_at")
      .gte("created_at", new Date(Date.now() - REPEAT_WINDOW_MS).toISOString()),
  ]);
  const subject = subjectOf(event);
  const targets =
    event.kind === "test"
      ? ((contacts ?? []) as ContactRow[]).filter((c) => c.telegram_chat_id != null).map((c) => ({ contactId: c.id, chatId: c.telegram_chat_id as number }))
      : planAlerts((contacts ?? []) as ContactRow[], (recent ?? []) as RecentAlert[], subject);
  if (!targets.length) return 0;
  const text = composeAlert(event, person);
  const results = await Promise.all(targets.map((t) => sendMessage(token, t.chatId, text)));
  await supabase.from("family_alerts").insert(
    targets.map((t, i) => ({
      contact_id: t.contactId,
      kind: event.kind,
      subject,
      score: event.kind === "test" ? 0 : event.score,
      status: results[i] ? "sent" : "failed",
    })),
  );
  return results.filter(Boolean).length;
}
