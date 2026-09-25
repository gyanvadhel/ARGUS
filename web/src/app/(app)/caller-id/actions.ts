"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { communityFor } from "@/lib/community-data";
import { createClient } from "@/lib/supabase/server";
import type { Community, CommunityReport, Verdict } from "@/lib/types";

export type LookupResult =
  | { ok: true; id: string; verdict: Verdict; community: Community; recent: CommunityReport[] }
  | { ok: false; error: string };

/** Caller ID: validate the number, pull in what the community knows, score it, and keep it in history. */
export async function lookupNumber(raw: string): Promise<LookupResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };
  const input = raw.trim();
  if (!input) return { ok: false, error: "Type a phone number to look up." };
  try {
    const { e164 } = await api.normalizePhone(input);
    if (!e164) return { ok: false, error: "That doesn't look like a phone number. Include the country code, like +91 or +1." };
    const { community, recent } = await communityFor(supabase, e164);
    const verdict = await api.scan(e164, community, "phone");
    const { data, error } = await supabase
      .from("scans")
      .insert({ kind: "phone", input_preview: e164, score: verdict.score, level: verdict.level, threat_type: verdict.threat_type, verdict })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Looked it up, but couldn't save it: ${error.message}` };
    revalidatePath("/dashboard");
    revalidatePath("/history");
    return { ok: true, id: data.id, verdict, community, recent };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The lookup didn't finish." };
  }
}
