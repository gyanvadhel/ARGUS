import { describe, expect, it } from "vitest";
import { summarize } from "./stats";

const now = new Date("2026-09-25T12:00:00");
const row = (kind: string, score: number, daysAgo: number) => ({
  kind,
  score,
  created_at: new Date(now.getTime() - daysAgo * 864e5).toISOString(),
});

describe("summarize", () => {
  it("counts totals by risk band", () => {
    const s = summarize([row("url", 90, 0), row("text", 65, 1), row("file", 10, 2)], 14, now);
    expect(s).toMatchObject({ total: 3, threats: 2, highRisk: 1, safe: 1 });
  });
  it("builds a zero-filled daily series ending today", () => {
    const s = summarize([row("url", 90, 0), row("url", 5, 0), row("email", 70, 3)], 7, now);
    expect(s.series).toHaveLength(7);
    expect(s.series[6]).toMatchObject({ scans: 2, threats: 1 });
    expect(s.series[3]).toMatchObject({ scans: 1, threats: 1 });
    expect(s.series[0]).toMatchObject({ scans: 0, threats: 0 });
  });
  it("ignores rows older than the window in the series but not totals", () => {
    const s = summarize([row("url", 90, 30)], 14, now);
    expect(s.total).toBe(1);
    expect(s.series.every((p) => p.scans === 0)).toBe(true);
  });
  it("breaks down by kind", () => {
    const s = summarize([row("url", 90, 0), row("url", 5, 0), row("phone", 85, 0)], 14, now);
    expect(s.byKind.find((k) => k.kind === "url")).toMatchObject({ count: 2, threats: 1 });
  });
});
