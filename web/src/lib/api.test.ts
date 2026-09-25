import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiOfflineError } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("api client auth", () => {
  it("sends the engine's access token when one is set", async () => {
    vi.stubEnv("ARGUS_API_TOKEN", "s3cret-token");
    const fetch = vi.fn().mockResolvedValue(Response.json({ kind: "text" }));
    vi.stubGlobal("fetch", fetch);
    await api.scan("hello");
    expect(new Headers(fetch.mock.calls[0][1].headers).get("authorization")).toBe("Bearer s3cret-token");
  });
  it("sends no token to a local engine without one", async () => {
    vi.stubEnv("ARGUS_API_TOKEN", "");
    const fetch = vi.fn().mockResolvedValue(Response.json({ kind: "text" }));
    vi.stubGlobal("fetch", fetch);
    await api.scan("hello");
    expect(new Headers(fetch.mock.calls[0][1].headers).get("authorization")).toBeNull();
  });
});

describe("a hosted engine", () => {
  it("explains a slow first answer as the engine waking up, not as offline", async () => {
    vi.stubEnv("ARGUS_API_URL", "https://argus-api.onrender.com");
    vi.resetModules();
    const hosted = await import("./api");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    await expect(hosted.api.scan("hello")).rejects.toThrow(/waking up/);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(hosted.api.scan("hello")).rejects.toThrow(/waking up/);
  });
});

describe("api client errors", () => {
  it("reports a slow engine as slow, not offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    await expect(api.scan("hello")).rejects.toThrow(/took too long/);
  });
  it("reports a refused connection as offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(api.scan("hello")).rejects.toBeInstanceOf(ApiOfflineError);
  });
});
