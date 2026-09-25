"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { alertFamily } from "@/lib/family-alerts";
import { createClient } from "@/lib/supabase/server";
import { botUsername, confirmUpdates, fetchUpdates, findStart, newLinkCode, sendMessage, startLink, telegramToken } from "@/lib/telegram";

export type ContactState = { error?: string; ok?: boolean } | undefined;

export async function addContact(_: ContactState, formData: FormData): Promise<ContactState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  if (!name) return { error: "Add a name." };
  if (name.length > 100 || (email && email.length > 254) || (phone && phone.length > 32)) return { error: "That's a bit long." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please sign in again." };
  const { error } = await supabase.from("trusted_contacts").insert({ name, email, phone });
  if (error) return { error: error.message };
  revalidatePath("/family");
  return { ok: true };
}

export async function deleteContact(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("trusted_contacts").delete().eq("id", String(formData.get("id")));
  revalidatePath("/family");
}

export async function toggleAlerts(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("trusted_contacts")
    .update({ notify_high_risk: formData.get("value") === "true" })
    .eq("id", String(formData.get("id")));
  revalidatePath("/family");
}

// --- Telegram --------------------------------------------------------------------------------------------
export type LinkResult = { ok: true; link: string; qr: string; bot: string } | { ok: false; error: string };

/** A one-time link (and QR code) that connects this contact's Telegram to Argus when they press Start. */
export async function telegramLink(contactId: string): Promise<LinkResult> {
  const token = telegramToken();
  if (!token) return { ok: false, error: "Telegram isn't set up on this server yet." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };
  try {
    const bot = await botUsername(token);
    const code = newLinkCode();
    const { data, error } = await supabase.from("trusted_contacts").update({ telegram_code: code }).eq("id", contactId).select("id").maybeSingle();
    if (error || !data) return { ok: false, error: "Couldn't find that contact." };
    const link = startLink(bot, code);
    const qr = await QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#ece6dc", light: "#00000000" } });
    return { ok: true, link, qr, bot };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Telegram didn't answer." };
  }
}

export type CheckResult = { linked: true; name: string } | { linked: false; error?: string };

/** Has the contact pressed Start yet? If so, remember their chat and say hello. */
export async function checkTelegram(contactId: string): Promise<CheckResult> {
  const token = telegramToken();
  if (!token) return { linked: false, error: "Telegram isn't set up on this server yet." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { linked: false, error: "Your session expired. Please sign in again." };
  const { data: contact } = await supabase.from("trusted_contacts").select("telegram_code, telegram_name, telegram_chat_id").eq("id", contactId).maybeSingle();
  if (!contact) return { linked: false, error: "Couldn't find that contact." };
  if (contact.telegram_chat_id) return { linked: true, name: contact.telegram_name ?? "Telegram" };
  if (!contact.telegram_code) return { linked: false };
  const found = findStart(await fetchUpdates(token), contact.telegram_code);
  if (!found) return { linked: false };
  await supabase
    .from("trusted_contacts")
    .update({ telegram_chat_id: found.chatId, telegram_name: found.name.slice(0, 80), telegram_code: null })
    .eq("id", contactId);
  await confirmUpdates(token, found.updateId);
  const person = String(user.user_metadata?.full_name ?? "").split(" ")[0] || "someone";
  await sendMessage(
    token,
    found.chatId,
    `You're now a trusted contact for ${person} on Argus. If something high-risk reaches them, like a scam call or a phishing link, you'll hear about it here.`,
  );
  revalidatePath("/family");
  return { linked: true, name: found.name };
}

export async function sendTestAlert(contactId: string): Promise<{ sent: boolean }> {
  const supabase = await createClient();
  const sent = await alertFamily(supabase, { kind: "test" }, contactId);
  revalidatePath("/family");
  return { sent: sent > 0 };
}

export async function disconnectTelegram(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("trusted_contacts")
    .update({ telegram_chat_id: null, telegram_name: null, telegram_code: null })
    .eq("id", String(formData.get("id")));
  revalidatePath("/family");
}

/** Called by the incoming-call screen when a high-risk number rings. */
export async function alertFamilyAboutCall(input: { number: string; score: number; label: string; reason: string }): Promise<number> {
  const score = Math.max(0, Math.min(100, Math.round(Number(input.score) || 0)));
  if (score < 80) return 0;
  const supabase = await createClient();
  return alertFamily(supabase, {
    kind: "call",
    simulated: true,
    number: String(input.number).slice(0, 32),
    score,
    label: String(input.label).slice(0, 40),
    reason: String(input.reason).slice(0, 200),
  });
}
