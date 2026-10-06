import { afterEach, describe, expect, it, vi } from "vitest";

const mockAdmin = vi.fn();
const mockOffline = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => mockAdmin() }));
vi.mock("@/lib/family-alerts", () => ({ alertDeviceOffline: (...a: unknown[]) => mockOffline(...a) }));

import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mockAdmin.mockReset();
  mockOffline.mockReset();
});

const HOUR = 60 * 60 * 1000;

/** A fake admin client whose app_devices query really applies the lt/gte filters to these rows. */
function adminWith(rows: Array<{ id: string; user_id: string; name: string; last_seen_at: string }>) {
  const filters: Array<(r: (typeof rows)[number]) => boolean> = [];
  const query = {
    select: () => query,
    lt: (_c: string, v: string) => (filters.push((r) => r.last_seen_at < v), query),
    gte: (_c: string, v: string) => (filters.push((r) => r.last_seen_at >= v), query),
    then: (ok: (x: unknown) => unknown) => ok({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
  };
  return {
    from: () => query,
    auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: { full_name: "Asha Rao" } } } }) } },
  };
}

describe("GET /api/cron/devices", () => {
  it("rejects without valid CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret");
    const req = new Request("http://localhost/api/cron/devices");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const req = new Request("http://localhost/api/cron/devices");
    const res = await GET(req);
    expect(res.status).toBe(503);
  });

  it("tells the circle about a silent phone once, not every day after", async () => {
    vi.stubEnv("CRON_SECRET", "s");
    const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
    mockAdmin.mockReturnValue(
      adminWith([
        { id: "fresh", user_id: "u1", name: "Pixel", last_seen_at: ago(10) },
        { id: "just-silent", user_id: "u2", name: "Galaxy", last_seen_at: ago(50) },
        { id: "long-gone", user_id: "u3", name: "Redmi", last_seen_at: ago(24 * 9) },
      ]),
    );
    const res = await GET(new Request("http://localhost/api/cron/devices", { headers: { authorization: "Bearer s" } }));
    expect(res.status).toBe(200);
    expect(mockOffline).toHaveBeenCalledTimes(1);
    expect(mockOffline).toHaveBeenCalledWith("u2", "Asha", "Galaxy");
  });
});
