"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { CallTurn, CallTurnResponse, Verdict } from "@/lib/types";

type Fail = { ok: false; error: string };

export async function screenCaller(callerId: string): Promise<{ ok: true; blocked: boolean; verdict: Verdict | null } | Fail> {
  const id = callerId.trim();
  if (!id) return { ok: true, blocked: false, verdict: null };
  try {
    const verdict = await api.scan(id);
    const blocked = verdict.kind === "phone" && verdict.signals.some((s) => s.source === "ARGUS blocklist" && s.status === "malicious");
    return { ok: true, blocked, verdict };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't check that number." };
  }
}

export async function callTurn(transcript: CallTurn[]): Promise<({ ok: true } & CallTurnResponse) | Fail> {
  try {
    return { ok: true, ...(await api.callTurn(transcript)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The call assistant is unavailable." };
  }
}

export async function saveCall(callerId: string, analysis: Verdict): Promise<{ ok: true; id: string } | Fail> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };
  const { data, error } = await supabase
    .from("scans")
    .insert({
      kind: "call",
      input_preview: `Call from ${callerId.trim() || "unknown caller"}`.slice(0, 200),
      score: analysis.score,
      level: analysis.level,
      threat_type: analysis.threat_type,
      verdict: { ...analysis, kind: "call", subject: callerId.trim() || "Unknown caller" },
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/history");
  return { ok: true, id: data.id };
}
