import { describe, expect, it, vi } from "vitest";
import { countFor, PWNED_RANGE_URL, pwnedCount, sha1Hex } from "./pwned";

describe("sha1Hex", () => {
  it("fingerprints a password the way Have I Been Pwned does (uppercase SHA-1)", async () => {
    expect(await sha1Hex("password")).toBe("5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8");
  });
});

describe("countFor", () => {
  const body = "1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:0\r\n011053FD0102E94D6AE2F8B83D76FAF94F6:2";
  it("finds how many breaches a fingerprint's ending appears in", () => {
    expect(countFor(body, "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(9659365);
    expect(countFor(body, "011053fd0102e94d6ae2f8b83d76faf94f6")).toBe(2);
  });
  it("counts padding lines and missing endings as never breached", () => {
    expect(countFor(body, "00D4F6E8FA6EECAD2A3AA415EEC418D38EC")).toBe(0);
    expect(countFor(body, "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")).toBe(0);
  });
});

describe("pwnedCount", () => {
  it("sends only the first five characters of the fingerprint, with padding", async () => {
    const fetcher = vi.fn(async () => new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:42\r\n"));
    expect(await pwnedCount("password", fetcher)).toBe(42);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${PWNED_RANGE_URL}5BAA6`); // nothing else about the password goes out
    expect((init.headers as Record<string, string>)["Add-Padding"]).toBe("true");
  });
  it("fails loudly when the service can't answer, rather than saying it's fine", async () => {
    const fetcher = vi.fn(async () => new Response("busy", { status: 503 }));
    await expect(pwnedCount("password", fetcher)).rejects.toThrow();
  });
});
