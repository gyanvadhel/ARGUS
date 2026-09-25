import type { ScanKind } from "./types";

type Row = { kind: ScanKind | string; score: number; created_at: string };

export interface DashboardStats {
  total: number;
  threats: number;
  highRisk: number;
  safe: number;
  series: { key: string; label: string; scans: number; threats: number }[];
  byKind: { kind: ScanKind; count: number; threats: number }[];
}

const KINDS: ScanKind[] = ["url", "file", "email", "phone", "text", "call"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function summarize(rows: Row[], days = 14, now = new Date()): DashboardStats {
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1 - i));
    return { key: dayKey(d), label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), scans: 0, threats: 0 };
  });
  const index = new Map(series.map((p, i) => [p.key, i]));
  const byKind = new Map(KINDS.map((k) => [k, { kind: k, count: 0, threats: 0 }]));

  for (const r of rows) {
    const threat = r.score >= 60;
    const i = index.get(dayKey(new Date(r.created_at)));
    if (i !== undefined) {
      series[i].scans += 1;
      if (threat) series[i].threats += 1;
    }
    const k = byKind.get(r.kind as ScanKind);
    if (k) {
      k.count += 1;
      if (threat) k.threats += 1;
    }
  }

  return {
    total: rows.length,
    threats: rows.filter((r) => r.score >= 60).length,
    highRisk: rows.filter((r) => r.score >= 80).length,
    safe: rows.filter((r) => r.score < 30).length,
    series,
    byKind: [...byKind.values()],
  };
}
