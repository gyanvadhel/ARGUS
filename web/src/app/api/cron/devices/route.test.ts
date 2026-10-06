import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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
});
