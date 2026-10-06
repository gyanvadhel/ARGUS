import { describe, expect, it, vi } from "vitest";
import { lookupPhone, type LookupDeps } from "./phone-lookup";
import type { Verdict } from "./types";

const verdict = (score: number) =>
  ({ kind: "phone", subject: "+919876543210", score, level: score >= 80 ? "HIGH RISK" : "SAFE", threat_type: "Possible scam call", verified: false, signals: [] }) as unknown as Verdict;

function fakeSupabase() {
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  const single = vi.fn().mockResolvedValue({ data: { id: "scan-1" }, error: null });
  const insert = vi.fn(() => ({ select: () => ({ single }) }));
  return { client: { rpc, from: vi.fn(() => ({ insert })) } as never, rpc, insert };
}

function deps(
  score: number | Error,
  cached: Verdict | null = null,
): LookupDeps & { scan: ReturnType<typeof vi.fn>; alert: ReturnType<typeof vi.fn>; cache: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; forget: ReturnType<typeof vi.fn> } } {
  return {
    cache: { get: vi.fn().mockResolvedValue(cached), put: vi.fn().mockResolvedValue(undefined), forget: vi.fn().mockResolvedValue(undefined) },
    community: vi.fn().mockResolvedValue({ reports: 2 }),
    scan: vi.fn(async () => {
      if (score instanceof Error) throw score;
      return verdict(score);
    }),
    alert: vi.fn().mockResolvedValue(1),
  };
}

describe("lookupPhone", () => {
  it("answers from the shared cache without asking the engine", async () => {
    const sb = fakeSupabase();
    const d = deps(99, verdict(30));
    const r = await lookupPhone(sb.client, { number: "+919876543210", call: false }, d);
    expect(r).toMatchObject({ ok: true, cached: true, verdict: { score: 30 } });
    expect(d.scan).not.toHaveBeenCalled();
  });

  it("asks the engine with the community data on a miss, and caches the answer", async () => {
    const sb = fakeSupabase();
    const d = deps(30);
    const r = await lookupPhone(sb.client, { number: "+919876543210", call: false }, d);
    expect(r).toMatchObject({ ok: true, cached: false, verdict: { score: 30 }, id: null });
    expect(d.scan).toHaveBeenCalledWith("+919876543210", { reports: 2 });
    expect(d.cache.put).toHaveBeenCalledWith("+919876543210", verdict(30));
  });

  it("saves a risky call to history as kind call and tells family at high risk", async () => {
    const sb = fakeSupabase();
    const d = deps(90);
    const r = await lookupPhone(sb.client, { number: "+919876543210", call: true }, d);
    expect(r).toMatchObject({ ok: true, id: "scan-1" });
    expect(sb.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: "call", input_preview: "+919876543210", score: 90 }));
    expect(d.alert).toHaveBeenCalledWith(sb.client, expect.objectContaining({ kind: "call", number: "+919876543210", score: 90, simulated: false }));
  });

  it("saves a suspicious call without alerting family", async () => {
    const sb = fakeSupabase();
    const d = deps(65);
    await lookupPhone(sb.client, { number: "+919876543210", call: true }, d);
    expect(sb.insert).toHaveBeenCalled();
    expect(d.alert).not.toHaveBeenCalled();
  });

  it("keeps calm calls and plain lookups out of history", async () => {
    const sb = fakeSupabase();
    await lookupPhone(sb.client, { number: "+919876543210", call: true }, deps(40));
    await lookupPhone(sb.client, { number: "+919876543210", call: false }, deps(95));
    expect(sb.insert).not.toHaveBeenCalled();
  });

  it("says it couldn't check when the engine fails, and caches nothing", async () => {
    const sb = fakeSupabase();
    const d = deps(new Error("asleep"));
    const r = await lookupPhone(sb.client, { number: "+919876543210", call: true }, d);
    expect(r.ok).toBe(false);
    expect(d.cache.put).not.toHaveBeenCalled();
  });

  it("never touches the shared cache with the person's own session", async () => {
    const sb = fakeSupabase();
    await lookupPhone(sb.client, { number: "+919876543210", call: true }, deps(90));
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});
