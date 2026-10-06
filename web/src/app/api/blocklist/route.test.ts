import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/blocklist", () => {
  it("proxies the blocklist with long CDN cache headers", async () => {
    vi.stubEnv("ARGUS_API_TOKEN", "test-token");
    const mockText = "evil.example\nphish.net\n";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(mockText, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=21600, stale-while-revalidate=86400");
    expect(res.headers.get("Content-Type")).toContain("text/plain");

    const body = await res.text();
    expect(body).toBe(mockText);

    // Verify engine auth header
    expect(fetchMock).toHaveBeenCalled();
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("authorization")).toBe("Bearer test-token");
  });

  it("returns 502 no-cache when the engine returns an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("Internal error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET();
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("returns 502 no-cache when fetch fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network down"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET();
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });
});
