import { describe, expect, it } from "vitest";
import { summarizeCommunity } from "./community";

const now = new Date("2026-09-25T12:00:00Z").getTime();
const at = (daysAgo: number) => new Date(now - daysAgo * 864e5).toISOString();

describe("summarizeCommunity", () => {
  it("knows nothing about an unreported number", () => {
    expect(summarizeCommunity([], 0, now)).toEqual({
      reports: 0, categories: {}, name: null, name_votes: 0, last_report_days: null, sightings: 0,
    });
  });
  it("counts categories, the freshest report and sightings", () => {
    const s = summarizeCommunity(
      [
        { category: "Scam", name_tag: null, created_at: at(2) },
        { category: "Scam", name_tag: null, created_at: at(9) },
        { category: "Spam", name_tag: null, created_at: at(30) },
      ],
      4,
      now,
    );
    expect(s.categories).toEqual({ Scam: 2, Spam: 1 });
    expect(s.reports).toBe(3);
    expect(s.last_report_days).toBeCloseTo(2);
    expect(s.sightings).toBe(4);
  });
  it("picks the most suggested name, ignoring case and spacing", () => {
    const s = summarizeCommunity(
      [
        { category: "Scam", name_tag: "Fake SBI agent", created_at: at(1) },
        { category: "Scam", name_tag: " fake sbi agent ", created_at: at(3) },
        { category: "Fraud", name_tag: "Loan app", created_at: at(4) },
      ],
      0,
      now,
    );
    expect(s.name).toBe("Fake SBI agent");
    expect(s.name_votes).toBe(2);
  });
});
