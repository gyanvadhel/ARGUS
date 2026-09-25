"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { Verdict } from "@/lib/types";

export type ScanResult = { ok: true; id: string; verdict: Verdict } | { ok: false; error: string };

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const PHONEISH = /^\+?[\d\s\-().]{7,20}$/;

async function communityReports(supabase: Awaited<ReturnType<typeof createClient>>, input: string): Promise<number> {
  if (!PHONEISH.test(input)) return 0;
  try {
    const { e164 } = await api.normalizePhone(input);
    if (!e164) return 0;
    const { count } = await supabase.from("phone_reports").select("id", { count: "exact", head: true }).eq("number", e164);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function runScan(formData: FormData): Promise<ScanResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };

  const file = formData.get("file");
  const input = String(formData.get("input") ?? "").trim();

  try {
    let verdict: Verdict;
    let preview: string;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Files up to 8 MB can be scanned in the web app." };
      verdict = await api.scanFile(file);
      preview = file.name;
    } else if (input) {
      verdict = await api.scan(input, await communityReports(supabase, input));
      preview = input;
    } else {
      return { ok: false, error: "Paste something or drop a file to scan." };
    }

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

    revalidatePath("/dashboard");
    revalidatePath("/history");
    return { ok: true, id: data.id, verdict };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Scan failed." };
  }
}

export type ReportResult = { ok: true } | { ok: false; error: string };
const CATEGORIES = ["Scam", "Spam", "Robocall", "Fraud", "Other"] as const;

export async function reportNumber(e164: string, category: string, note: string): Promise<ReportResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!/^\+[1-9]\d{6,14}$/.test(e164)) return { ok: false, error: "That number can't be reported." };
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) return { ok: false, error: "Pick a category." };
  const { error } = await supabase.from("phone_reports").insert({ number: e164, category, note: note.trim().slice(0, 280) || null });
  if (error) return { ok: false, error: error.code === "23505" ? "You've already reported this number." : error.message };
  return { ok: true };
}
