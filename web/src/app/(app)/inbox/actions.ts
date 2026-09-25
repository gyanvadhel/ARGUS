"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { recordSightings } from "@/lib/community-data";
import {
  fullMessage,
  GmailAccessRevoked,
  googleCreds,
  listRecent,
  refreshAccessToken,
  revoke,
  senderName,
  toMeta,
  toRawEmail,
  type Folder,
  type MailMeta,
} from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";
import { openToken } from "@/lib/token-box";
import type { RiskLevel } from "@/lib/types";

export type MailVerdict = { scanId: string; level: RiskLevel; score: number; verified: boolean; threat: string };
export type InboxItem = MailMeta & { verdict: MailVerdict | null };
type Failure = { ok: false; error: string; reconnect?: boolean };

const LATEST = 12;
const REVOKED = "Gmail access was removed or has expired. Connect again to keep checking your inbox.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Access tokens last an hour: keep them in memory so checking a dozen emails isn't a dozen token refreshes.
const accessTokens = new Map<string, { token: string; until: number }>();

async function accessToken(supabase: Supabase, userId: string): Promise<string> {
  const cached = accessTokens.get(userId);
  if (cached && cached.until > Date.now()) return cached.token;
  const creds = googleCreds();
  if (!creds) throw new Error("Gmail isn't set up on this server.");
  const { data } = await supabase.from("mail_connections").select("refresh_token").eq("user_id", userId).maybeSingle();
  if (!data) throw new GmailAccessRevoked("Not connected");
  const token = await refreshAccessToken(creds, openToken(data.refresh_token));
  accessTokens.set(userId, { token, until: Date.now() + 50 * 60 * 1000 });
  return token;
}

async function forget(supabase: Supabase, userId: string) {
  accessTokens.delete(userId);
  await supabase.from("mail_connections").delete().eq("user_id", userId);
}

async function failure(supabase: Supabase, userId: string, e: unknown): Promise<Failure> {
  if (e instanceof GmailAccessRevoked) {
    await forget(supabase, userId);
    return { ok: false, error: REVOKED, reconnect: true };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Couldn't read your inbox." };
}

type ScanRow = { id: string; level: RiskLevel; score: number; threat_type: string; verified: boolean | null };

/** The latest messages in the inbox (or what Gmail filed as spam), with the verdict for any Argus already checked. */
export async function listInbox(folder: Folder = "inbox"): Promise<{ ok: true; items: InboxItem[] } | Failure> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };
  try {
    const messages = await listRecent(await accessToken(supabase, user.id), LATEST, folder === "spam" ? "spam" : "inbox");
    const ids = messages.map((m) => m.id);
    const { data } = ids.length
      ? await supabase
          .from("mail_scans")
          .select("message_id, scans(id, level, score, threat_type, verified:verdict->verified)")
          .in("message_id", ids)
      : { data: [] };
    const checked = new Map(
      ((data ?? []) as unknown as { message_id: string; scans: ScanRow | null }[]).map((row) => [row.message_id, row.scans]),
    );
    return {
      ok: true,
      items: messages.map((m) => {
        const s = checked.get(m.id);
        return {
          ...m,
          verdict: s ? { scanId: s.id, level: s.level, score: s.score, verified: s.verified === true, threat: s.threat_type } : null,
        };
      }),
    };
  } catch (e) {
    return failure(supabase, user.id, e);
  }
}

/** Check one email: fetch it from Gmail, run it through Argus, and keep the verdict in history.
 * Argus fetched it on its own, so its links are only opened when that's safe (never for spam). */
export async function scanMessage(messageId: string, folder: Folder = "inbox"): Promise<{ ok: true; verdict: MailVerdict } | Failure> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };
  try {
    const message = await fullMessage(await accessToken(supabase, user.id), messageId);
    const verdict = await api.scan(toRawEmail(message), undefined, "email", folder === "spam" ? "spam" : "inbox");
    const meta = toMeta(message);
    const { data, error } = await supabase
      .from("scans")
      .insert({
        kind: "email",
        input_preview: `${meta.subject} (from ${senderName(meta.from)})`.slice(0, 200),
        score: verdict.score,
        level: verdict.level,
        threat_type: verdict.threat_type,
        verdict,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Checked, but couldn't save it: ${error.message}` };
    await supabase.from("mail_scans").upsert({ user_id: user.id, message_id: messageId, scan_id: data.id });
    await recordSightings(supabase, verdict).catch(() => undefined);
    revalidatePath("/dashboard");
    revalidatePath("/history");
    return {
      ok: true,
      verdict: { scanId: data.id, level: verdict.level, score: verdict.score, verified: verdict.verified === true, threat: verdict.threat_type },
    };
  } catch (e) {
    return failure(supabase, user.id, e);
  }
}

/** Revoke Argus's access at Google and forget the connection. Past verdicts stay in history. */
export async function disconnectGmail(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data } = await supabase.from("mail_connections").select("refresh_token").eq("user_id", user.id).maybeSingle();
  if (data) {
    try {
      await revoke(openToken(data.refresh_token));
    } catch {
      // the token can't be opened (for example after a key change): forgetting it is still right
    }
  }
  await forget(supabase, user.id);
  revalidatePath("/inbox");
}
