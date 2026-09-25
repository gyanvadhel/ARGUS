import "server-only";
import { summarizeCommunity } from "./community";
import type { createClient } from "./supabase/server";
import type { Community, CommunityReport, Verdict } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Everything ARGUS users have reported about a number, plus how often it appeared in scam messages. */
export async function communityFor(supabase: Supabase, e164: string): Promise<{ community: Community; recent: CommunityReport[] }> {
  const [{ data: reports }, { count }] = await Promise.all([
    supabase
      .from("phone_reports")
      .select("category,name_tag,note,created_at")
      .eq("number", e164)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("phone_sightings").select("id", { count: "exact", head: true }).eq("number", e164),
  ]);
  const rows = (reports ?? []) as CommunityReport[];
  return { community: summarizeCommunity(rows, count ?? 0), recent: rows.slice(0, 5) };
}

/** A high-risk text or email that contains phone numbers marks each of them as seen in a scam. */
export async function recordSightings(supabase: Supabase, verdict: Verdict): Promise<void> {
  if ((verdict.kind !== "text" && verdict.kind !== "email") || verdict.score < 60) return;
  const numbers = verdict.signals.filter((s) => s.source.startsWith("Phone: +")).map((s) => s.source.slice("Phone: ".length));
  if (!numbers.length) return;
  await supabase
    .from("phone_sightings")
    .upsert(numbers.map((number) => ({ number, channel: verdict.kind, score: verdict.score })), {
      onConflict: "user_id,number,channel",
      ignoreDuplicates: true,
    });
}
