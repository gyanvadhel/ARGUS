import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAppUser = vi.fn();
vi.mock("@/lib/app-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/app-auth")>();
  return {
    ...orig,
    appUser: (...args: unknown[]) => mockAppUser(...args),
  };
});

const mockAfter = vi.fn();
vi.mock("next/server", () => ({ after: (fn: () => unknown) => mockAfter(fn) }));
const mockAlert = vi.fn();
vi.mock("@/lib/family-alerts", () => ({ alertProtectionDisabled: (...a: unknown[]) => mockAlert(...a) }));
const mockAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => mockAdmin() }));

import { DELETE, POST } from "./route";

/** The person's own client: their previous row for this phone, and a record of what was written or deleted. */
function userClient(previous: object | null) {
  const writes: { upsert?: unknown; deleted?: string } = {};
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: previous }) }) }),
      upsert: async (row: unknown) => ((writes.upsert = row), { error: null }),
      delete: () => ({ eq: async (_c: string, id: string) => ((writes.deleted = id), { error: null }) }),
    }),
  };
  return { client, writes };
}

function post(body: object) {
  return new Request("http://localhost/api/app/device", {
    method: "POST",
    headers: { authorization: "Bearer t" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockAppUser.mockReset();
  mockAfter.mockReset();
  mockAlert.mockReset();
  mockAdmin.mockReset();
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

  it("sends the protection-off alert after the reply, so the function isn't stopped before it goes out", async () => {
    const { client } = userClient({ protections: { calls: true, blocker: true }, name: "Pixel" });
    mockAppUser.mockResolvedValue({ user: { id: "u1", user_metadata: { full_name: "Asha Rao" } }, supabase: client });
    const res = await POST(post({ deviceId: "d1", appVersion: "0.2.1", protections: { calls: false, blocker: true } }));
    expect(res.status).toBe(200);
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockAlert).not.toHaveBeenCalled();
    await mockAfter.mock.calls[0][0]();
    expect(mockAlert).toHaveBeenCalledWith("u1", "Asha", "Call warnings", "Pixel");
  });

  it("takes this phone's push token off every other device row, so an old account stops getting its alerts", async () => {
    const { client } = userClient(null);
    mockAppUser.mockResolvedValue({ user: { id: "u2", user_metadata: {} }, supabase: client });
    const cleared: Array<[string, unknown]> = [];
    const chain = {
      eq: (c: string, v: unknown) => (cleared.push([c, v]), chain),
      neq: async (c: string, v: unknown) => (cleared.push([`not ${c}`, v]), { error: null }),
    };
    const update = vi.fn(() => chain);
    mockAdmin.mockReturnValue({ from: () => ({ update }) });
    await POST(post({ deviceId: "d2", appVersion: "0.2.1", fcmToken: "tok-1" }));
    expect(update).toHaveBeenCalledWith({ fcm_token: null });
    expect(cleared).toEqual([["fcm_token", "tok-1"], ["not id", "d2"]]);
  });
});

describe("DELETE /api/app/device", () => {
  it("forgets this phone when the person signs out", async () => {
    const { client, writes } = userClient(null);
    mockAppUser.mockResolvedValue({ user: { id: "u1", user_metadata: {} }, supabase: client });
    const res = await DELETE(
      new Request("http://localhost/api/app/device", { method: "DELETE", headers: { authorization: "Bearer t" }, body: JSON.stringify({ deviceId: "d1" }) }),
    );
    expect(res.status).toBe(200);
    expect(writes.deleted).toBe("d1");
  });
});
