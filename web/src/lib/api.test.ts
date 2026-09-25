import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiOfflineError } from "./api";

afterEach(() => vi.unstubAllGlobals());

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
