import "server-only";
import { api } from "@/lib/api";
import { shouldSave, type SaveMode } from "@/lib/app-scan";
import { communityFor, recordSightings } from "@/lib/community-data";
import { ALERT_AT, alertFamily } from "@/lib/family-alerts";
import { levelMeta } from "@/lib/format";
import type { createClient } from "@/lib/supabase/server";
import type { Community, Verdict } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type ScanWhat = { input: string } | { file: File };
export type CoreScanResult = { ok: true; id: string | null; verdict: Verdict; alerted: number } | { ok: false; error: string };

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // hosting limits a request to 4.5 MB
const PHONEISH = /^\+?[\d\s\-().]{7,20}$/;

async function phoneCommunity(supabase: Supabase, input: string): Promise<Community | undefined> {
  if (!PHONEISH.test(input)) return undefined;
  try {
    const { e164 } = await api.normalizePhone(input);
    return e164 ? (await communityFor(supabase, e164)).community : undefined;
  } catch {
    return undefined;
  }
}

/** The scan pipeline shared by the Scan page and the Android app: the engine's verdict, history, sightings and
 *  family alerts. `supabase` acts as the signed-in person, so everything is saved under their account. */
export async function performScan(supabase: Supabase, what: ScanWhat, mode: SaveMode = "always"): Promise<CoreScanResult> {
  try {
    let verdict: Verdict;
    let preview: string;
    if ("file" in what) {
      if (what.file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Files up to 4 MB can be scanned in the web app." };
      verdict = await api.scanFile(what.file);
      preview = what.file.name;
    } else {
      verdict = await api.scan(what.input, await phoneCommunity(supabase, what.input));
      preview = what.input;
    }

    let id: string | null = null;
    if (shouldSave(mode, verdict.score)) {
      const { data, error } = await supabase
        .from("scans")
        .insert({
          kind: verdict.kind,
          input_preview: preview.slice(0, 200),
          score: verdict.score,
          level: verdict.level,
          threat_type: verdict.threat_type,
          verdict,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: `Scanned, but couldn't save the result: ${error.message}` };
      id = data.id;
    }
    await recordSightings(supabase, verdict).catch(() => undefined);
    const alerted =
      verdict.score >= ALERT_AT
        ? await alertFamily(supabase, {
            kind: "scan",
            scanKind: verdict.kind,
            subject: verdict.subject,
            score: verdict.score,
            label: levelMeta(verdict.level, verdict.verified).label,
            threat: verdict.threat_type,
          }).catch(() => 0)
        : 0;
    return { ok: true, id, verdict, alerted };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Scan failed." };
  }
}
