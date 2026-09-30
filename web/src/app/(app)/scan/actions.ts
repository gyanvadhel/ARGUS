"use server";

import { revalidatePath } from "next/cache";
import { performScan } from "@/lib/scan-core";
import { createClient } from "@/lib/supabase/server";
import type { Verdict } from "@/lib/types";

export type ScanResult = { ok: true; id: string; verdict: Verdict; alerted: number } | { ok: false; error: string };

export async function runScan(formData: FormData): Promise<ScanResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };

  const file = formData.get("file");
  const input = String(formData.get("input") ?? "").trim();
  const what = file instanceof File && file.size > 0 ? { file } : input ? { input } : null;
  if (!what) return { ok: false, error: "Paste something or drop a file to scan." };

  const result = await performScan(supabase, what);
  if (!result.ok) return result;
  revalidatePath("/dashboard");
  revalidatePath("/history");
  return { ok: true, id: result.id!, verdict: result.verdict, alerted: result.alerted };
}

export type ReportResult = { ok: true } | { ok: false; error: string };
const CATEGORIES = ["Scam", "Spam", "Robocall", "Fraud", "Other"] as const;

export async function reportNumber(e164: string, category: string, note: string, nameTag = ""): Promise<ReportResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!/^\+[1-9]\d{6,14}$/.test(e164)) return { ok: false, error: "That number can't be reported." };
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) return { ok: false, error: "Pick a category." };
  const { error } = await supabase.from("phone_reports").insert({
    number: e164,
    category,
    note: note.trim().slice(0, 280) || null,
    name_tag: nameTag.trim().slice(0, 60) || null,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "You've already reported this number." : error.message };
  return { ok: true };
}
