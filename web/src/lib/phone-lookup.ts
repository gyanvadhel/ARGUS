import "server-only";
import { api } from "@/lib/api";
import type { ServerSupabase } from "@/lib/app-auth";
import { SAVE_FLAGGED_AT } from "@/lib/app-scan";
import { communityFor } from "@/lib/community-data";
import { ALERT_AT, alertFamily } from "@/lib/family-alerts";
import { levelMeta } from "@/lib/format";
import { phoneCache, type PhoneCache } from "@/lib/phone-cache";
import type { Community, Verdict } from "@/lib/types";

export type LookupDeps = {
  community: (supabase: ServerSupabase, e164: string) => Promise<Community>;
  scan: (number: string, community: Community) => Promise<Verdict>;
  alert: typeof alertFamily;
  cache: PhoneCache;
};

const LIVE: LookupDeps = {
  community: async (supabase, e164) => (await communityFor(supabase, e164)).community,
  scan: (number, community) => api.scan(number, community),
  alert: alertFamily,
  cache: phoneCache,
};

export type LookupResult = { ok: true; verdict: Verdict; cached: boolean; id: string | null } | { ok: false; error: string };

/** A call's verdict: the shared 24-hour cache first, otherwise the engine with what the community knows. A call
 *  that looks risky is saved to the person's history as kind "call", and family hear about high-risk ones. */
export async function lookupPhone(
  supabase: ServerSupabase,
  q: { number: string; call: boolean },
  deps: LookupDeps = LIVE,
): Promise<LookupResult> {
  let verdict = await deps.cache.get(q.number).catch(() => null);
  const cached = verdict !== null;
  if (!verdict) {
    try {
      verdict = await deps.scan(q.number, await deps.community(supabase, q.number));
    } catch {
      return { ok: false, error: "Argus's checker is waking up. Try again in a moment." };
    }
    await deps.cache.put(q.number, verdict).catch(() => undefined);
  }

  let id: string | null = null;
  if (q.call && verdict.score >= SAVE_FLAGGED_AT) {
    const { data } = await supabase
      .from("scans")
      .insert({
        kind: "call",
        input_preview: q.number,
        score: verdict.score,
        level: verdict.level,
        threat_type: verdict.threat_type,
        verdict,
      })
      .select("id")
      .single();
    id = data?.id ?? null;
    if (verdict.score >= ALERT_AT) {
      await deps
        .alert(supabase, {
          kind: "call",
          number: q.number,
          score: verdict.score,
          label: levelMeta(verdict.level, verdict.verified).label,
          reason: verdict.threat_type,
          simulated: false,
        })
        .catch(() => 0);
    }
  }
  return { ok: true, verdict, cached, id };
}
