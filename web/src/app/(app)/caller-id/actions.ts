"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { summarizeCommunity } from "@/lib/community";
import { communityFor } from "@/lib/community-data";
import { createClient } from "@/lib/supabase/server";
import type { Community, CommunityReport, Verdict } from "@/lib/types";

export type LookupResult =
  | { ok: true; id: string; verdict: Verdict; community: Community; recent: CommunityReport[]; reportable: boolean }
  | { ok: false; error: string };

const NUMBERISH = /^\+?[\d\s\-().]+$/;

/** Caller ID: validate the number, pull in what the community knows, score it, and keep it in history. */
export async function lookupNumber(raw: string): Promise<LookupResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };
  const input = raw.trim();
  if (!input) return { ok: false, error: "Type a phone number to look up." };
  if (!NUMBERISH.test(input) || (input.match(/\d/g)?.length ?? 0) < 3) {
    return { ok: false, error: "That doesn't look like a phone number. Use digits and the country code, like +91 or +1." };
  }
  try {
    const { e164 } = await api.normalizePhone(input);
    // A number that can't exist still gets a verdict: a caller ID showing one is spoofed or mistyped.
    const { community, recent } = e164 ? await communityFor(supabase, e164) : { community: summarizeCommunity([], 0), recent: [] };
    const verdict = await api.scan(e164 ?? input, community, "phone");
    const { data, error } = await supabase
      .from("scans")
      .insert({ kind: "phone", input_preview: (e164 ?? input).slice(0, 200), score: verdict.score, level: verdict.level, threat_type: verdict.threat_type, verdict })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Looked it up, but couldn't save it: ${error.message}` };
    revalidatePath("/dashboard");
    revalidatePath("/history");
    return { ok: true, id: data.id, verdict, community, recent, reportable: Boolean(e164) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The lookup didn't finish." };
  }
}
