"use server";

import { api } from "@/lib/api";
import type { RiskLevel, ScanKind } from "@/lib/types";

export type PreviewResult =
  | { ok: true; score: number; level: RiskLevel; threat: string; kind: ScanKind; flags: string[] }
  | { ok: false; error: string };

/** A quick verdict for visitors on the landing page. Nothing is saved; the full evidence needs an account. */
export async function previewScan(input: string): Promise<PreviewResult> {
  const text = input.trim();
  if (!text) return { ok: false, error: "Paste something to check first." };
  if (text.length > 5000) return { ok: false, error: "That's too long for a quick check. Create an account to scan it in full." };
  try {
    const v = await api.scan(text);
    const flags = v.signals
      .filter((s) => s.status === "malicious" || s.status === "suspicious")
      .slice(0, 3)
      .map((s) => s.summary);
    return { ok: true, score: v.score, level: v.level, threat: v.threat_type, kind: v.kind, flags };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The check didn't finish." };
  }
}
