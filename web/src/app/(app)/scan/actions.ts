"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { Verdict } from "@/lib/types";

export type ScanResult = { ok: true; id: string; verdict: Verdict } | { ok: false; error: string };

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

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
      verdict = await api.scan(input);
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
