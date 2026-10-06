import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAppUser = vi.fn();
vi.mock("@/lib/app-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/app-auth")>();
  return {
    ...orig,
    appUser: (...args: unknown[]) => mockAppUser(...args),
  };
});

import { POST } from "./route";

beforeEach(() => {
  mockAppUser.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/app/device", () => {
  it("rejects unauthenticated requests", async () => {
    mockAppUser.mockResolvedValue(null);
    const req = new Request("http://localhost/api/app/device", {
      method: "POST",
      body: JSON.stringify({ deviceId: "d1", appVersion: "0.2.0" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("validates missing deviceId or appVersion", async () => {
    mockAppUser.mockResolvedValue({
      user: { id: "u1", user_metadata: { full_name: "Gyan" } },
      supabase: { from: vi.fn() },
    });

    const req = new Request("http://localhost/api/app/device", {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
