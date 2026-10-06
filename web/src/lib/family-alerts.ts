import "server-only";
import { sendMessage, telegramToken } from "./telegram";
import { sendFcmPush, composePushAlert, type PushAlertEvent } from "./fcm";
import { adminClient } from "./supabase/admin";
import type { createClient } from "./supabase/server";
import type { ScanKind } from "./types";

// Telling trusted contacts and family circle when something high-risk reaches someone.
// Privacy first: an alert says what kind of thing it was and how risky, never what their
// messages or emails said, and links are written so they can't be clicked. Blocked site names
// are never shared.

export const ALERT_AT = 80; // High risk
const REPEAT_WINDOW_MS = 10 * 60 * 1000;

export type AlertEvent =
  | { kind: "scan"; scanKind: ScanKind; subject: string; score: number; label: string; threat: string }
  | { kind: "call"; number: string; score: number; label: string; reason: string; simulated: boolean }
  | { kind: "protection_disabled"; protection: string; deviceName?: string }
  | { kind: "device_offline"; deviceName?: string }
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
  if (event.kind === "protection_disabled") {
    const dev = event.deviceName ? ` on their ${event.deviceName}` : " on their phone";
    return [
      `⚠️ Argus alert for ${person}`,
      `${event.protection} was turned off${dev}.`,
      "Check in with them to make sure their phone stays protected against scams.",
    ].join("\n");
  }
  if (event.kind === "device_offline") {
    const dev = event.deviceName ? ` (${event.deviceName})` : "";
    return [
      `⚠️ Argus alert for ${person}`,
      `Their phone${dev} hasn't checked in with Argus for 48 hours.`,
      "Check in with them to make sure everything is okay.",
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

/** Who to tell on Telegram: contacts connected on Telegram with alerts on, unless this same alert went out recently. */
export function planAlerts(contacts: ContactRow[], recent: RecentAlert[], subject: string, now = new Date()) {
  const repeat = recent.some((r) => r.subject === subject && now.getTime() - Date.parse(r.created_at) < REPEAT_WINDOW_MS);
  if (repeat) return [];
  return contacts
    .filter((c) => c.notify_high_risk && c.telegram_chat_id != null)
    .map((c) => ({ contactId: c.id, chatId: c.telegram_chat_id as number }));
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

function subjectOf(event: AlertEvent): string {
  if (event.kind === "call") return event.number;
  if (event.kind === "scan") return event.subject.slice(0, 300);
  if (event.kind === "protection_disabled") return `prot_${event.protection}`;
  if (event.kind === "device_offline") return `offline_${event.deviceName ?? "phone"}`;
  return "test";
}

/**
 * Dispatches FCM push notifications to all devices owned by members of the user's family circle.
 * Only the server (via adminClient) can read tokens from app_devices.
 */
async function pushToFamilyCircle(userId: string, event: AlertEvent, person: string): Promise<number> {
  const admin = adminClient();
  if (!admin) return 0;

  try {
    const { data: links } = await admin
      .from("family_links")
      .select("user_a, user_b")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`);

    if (!links || links.length === 0) return 0;

    const memberIds = Array.from(
      new Set(links.map((l: { user_a: string; user_b: string }) => (l.user_a === userId ? l.user_b : l.user_a))),
    );

    const { data: devices } = await admin
      .from("app_devices")
      .select("fcm_token")
      .in("user_id", memberIds)
      .not("fcm_token", "is", null);

    const tokens = ((devices ?? []) as Array<{ fcm_token: string | null }>)
      .map((d) => d.fcm_token)
      .filter((t): t is string => Boolean(t));

    if (tokens.length === 0) return 0;

    const pushPayload = composePushAlert(event as PushAlertEvent, person);
    const result = await sendFcmPush(tokens, pushPayload);
    return result.sent;
  } catch (err) {
    console.error("Failed to push to family circle:", err);
    return 0;
  }
}

/**
 * Send the alert to everyone who should get it (Telegram + Android FCM push) and log each Telegram send.
 * Returns how many notifications were delivered.
 */
export async function alertFamily(supabase: Supabase, event: AlertEvent, onlyContact?: string): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const person = String(user.user_metadata?.full_name ?? "").split(" ")[0] || "your family member";

  // 1. Dispatch push notifications to the user's family circle (Android app devices)
  const pushCount = await pushToFamilyCircle(user.id, event, person);

  // 2. Dispatch Telegram alerts to configured trusted contacts
  const token = telegramToken();
  if (!token) return pushCount;

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

  if (!targets.length) return pushCount;

  const text = composeAlert(event, person);
  const results = await Promise.all(targets.map((t) => sendMessage(token, t.chatId, text)));

  await supabase.from("family_alerts").insert(
    targets.map((t, i) => ({
      contact_id: t.contactId,
      kind: event.kind,
      subject,
      score: "score" in event ? event.score : 0,
      status: results[i] ? "sent" : "failed",
    })),
  );

  return pushCount + results.filter(Boolean).length;
}

/**
 * Triggers an alert when a device's protection is turned off.
 */
export async function alertProtectionDisabled(
  userId: string,
  person: string,
  protection: string,
  deviceName?: string,
): Promise<number> {
  const event: AlertEvent = { kind: "protection_disabled", protection, deviceName };
  return pushToFamilyCircle(userId, event, person);
}

/**
 * Triggers an alert when a family member's phone hasn't checked in for 48 hours.
 */
export async function alertDeviceOffline(
  userId: string,
  person: string,
  deviceName?: string,
): Promise<number> {
  const event: AlertEvent = { kind: "device_offline", deviceName };
  return pushToFamilyCircle(userId, event, person);
}
