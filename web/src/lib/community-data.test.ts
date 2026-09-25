import { describe, expect, it, vi } from "vitest";
import { recordSightings } from "./community-data";
import type { Verdict } from "./types";

function fakeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return { client: { from: vi.fn(() => ({ upsert })) } as never, upsert };
}

const signal = (source: string) => ({ source, status: "malicious" as const, score: 90, weight: 1, summary: "", authoritative: false, evidence: {} });

describe("recordSightings", () => {
  it("records each number in a scam message once, even when it has several evidence lines", async () => {
    const { client, upsert } = fakeSupabase();
    const verdict = {
      kind: "text",
      score: 90,
      signals: [signal("Phone: +12135550187"), signal("Phone: +12135550187 (FCC)"), signal("Link: evil.xyz")],
    } as unknown as Verdict;
    await recordSightings(client, verdict);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toEqual([{ number: "+12135550187", channel: "text", score: 90 }]);
  });
  it("ignores messages that aren't risky", async () => {
    const { client, upsert } = fakeSupabase();
    await recordSightings(client, { kind: "text", score: 20, signals: [signal("Phone: +12135550187")] } as unknown as Verdict);
    expect(upsert).not.toHaveBeenCalled();
  });
});
