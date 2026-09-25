import { describe, expect, it } from "vitest";
import { openToken, sealToken } from "./token-box";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("token box", () => {
  it("round-trips a token", () => {
    expect(openToken(sealToken("1//refresh-abc", KEY), KEY)).toBe("1//refresh-abc");
  });
  it("never stores the token in plain text", () => {
    const sealed = sealToken("1//refresh-abc", KEY);
    expect(sealed).not.toContain("refresh-abc");
    expect(Buffer.from(sealed, "base64").toString("utf8")).not.toContain("refresh-abc");
  });
  it("uses a fresh nonce every time", () => {
    expect(sealToken("same", KEY)).not.toBe(sealToken("same", KEY));
  });
  it("refuses anything that was tampered with", () => {
    const bytes = Buffer.from(sealToken("1//refresh-abc", KEY), "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => openToken(bytes.toString("base64"), KEY)).toThrow();
  });
  it("refuses a key that isn't 32 bytes", () => {
    expect(() => sealToken("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});
