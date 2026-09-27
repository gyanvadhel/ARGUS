"use server";

import { headers } from "next/headers";
import { api } from "@/lib/api";
import { clientIp, limitKey } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { RiskLevel, ScanKind } from "@/lib/types";

export type PreviewResult =
  | { ok: true; score: number; level: RiskLevel; verified: boolean; threat: string; kind: ScanKind; flags: string[] }
  | { ok: false; error: string };

// The free check needs no account, so it's limited: per visitor, and a daily total that leaves most of
// VirusTotal's 500 free lookups a day for people who signed in.
const PER_VISITOR = { limit: 10, seconds: 60 };
const PER_DAY = { limit: 300, seconds: 86_400 };
const SECRET = process.env.RATE_LIMIT_SECRET || process.env.GMAIL_TOKEN_KEY || "argus-preview";

async function overLimit(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const take = async (key: string, { limit, seconds }: { limit: number; seconds: number }) => {
      const { data, error } = await supabase.rpc("take_check_slot", { p_key: key, p_limit: limit, p_window_seconds: seconds });
      return error ? true : data !== false; // if counting fails, let the check through rather than break the page
    };
    if (!(await take(limitKey(clientIp(await headers()), SECRET), PER_VISITOR))) {
      return "That's a lot of checks in a row. Wait a minute, or create a free account to keep going.";
    }
    if (!(await take(limitKey("@daily", SECRET), PER_DAY))) {
      return "Today's free checks are used up. Create a free account to keep checking.";
    }
    return null;
  } catch {
    return null;
  }
}

/** A quick verdict for visitors on the landing page. Nothing is saved; the full evidence needs an account. */
export async function previewScan(input: string): Promise<PreviewResult> {
  const text = input.trim();
  if (!text) return { ok: false, error: "Paste something to check first." };
  if (text.length > 5000) return { ok: false, error: "That's too long for a quick check. Create an account to scan it in full." };
  const limited = await overLimit();
  if (limited) return { ok: false, error: limited };
  try {
    const v = await api.scan(text);
    const flags = v.signals
      .filter((s) => s.status === "malicious" || s.status === "suspicious")
      .slice(0, 3)
      .map((s) => s.summary);
    return { ok: true, score: v.score, level: v.level, verified: v.verified === true, threat: v.threat_type, kind: v.kind, flags };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The check didn't finish." };
  }
}
