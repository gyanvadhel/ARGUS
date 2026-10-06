import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAppUser = vi.fn();
vi.mock("@/lib/app-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/app-auth")>();
  return {
    ...orig,
    appUser: (...args: unknown[]) => mockAppUser(...args),
  };
});

import { GET } from "./route";

beforeEach(() => {
  mockAppUser.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/app/family/status", () => {
  it("rejects unauthenticated requests", async () => {
    mockAppUser.mockResolvedValue(null);
    const req = new Request("http://localhost/api/app/family/status");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns linked members' protection status and never leaks fcm_token", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [
        {
          member_id: "m-123",
          member_name: "Mom",
          device_id: "dev-456",
          device_name: "Pixel 7",
          app_version: "0.2.0",
          protections: { calls: true, blocker: true },
          last_seen_at: "2026-10-06T12:00:00Z",
        },
      ],
      error: null,
    });

    mockAppUser.mockResolvedValue({
      user: { id: "user-me" },
      supabase: { rpc: mockRpc },
    });

    const req = new Request("http://localhost/api/app/family/status", {
      headers: { authorization: "Bearer valid-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { members: Array<Record<string, unknown>> };
    expect(body.members).toHaveLength(1);
    const mom = body.members[0];
    expect(mom.memberName).toBe("Mom");
    expect(mom.deviceName).toBe("Pixel 7");
    expect(mom.appVersion).toBe("0.2.0");
    expect(mom.protections).toEqual({ calls: true, blocker: true });

    // CRITICAL SECURITY CONSTRAINT: verify fcm_token is never leaked in response
    expect("fcm_token" in mom).toBe(false);
    expect("fcmToken" in mom).toBe(false);
  });
});
