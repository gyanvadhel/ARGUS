import { describe, expect, it } from "vitest";
import { appLimitKey, clientIp, limitKey } from "./rate-limit";

describe("clientIp", () => {
  it("takes the visitor's address from the first forwarded hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "49.36.70.169, 76.76.21.21" }))).toBe("49.36.70.169");
  });

  it("falls back to x-real-ip, then to a shared bucket", () => {
    expect(clientIp(new Headers({ "x-real-ip": "10.0.0.7" }))).toBe("10.0.0.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("limitKey", () => {
  it("never stores the address itself, and can't be guessed without the server's secret", () => {
    const key = limitKey("49.36.70.169", "secret-a");
    expect(key).not.toContain("49.36");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(limitKey("49.36.70.169", "secret-a")).toBe(key);
    expect(limitKey("49.36.70.169", "secret-b")).not.toBe(key);
  });
});

describe("appLimitKey", () => {
  it("counts per account and purpose without storing the account ID", () => {
    const key = appLimitKey("scan", "5b0c0f8e-1111-2222-3333-444455556666", "secret-a");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("5b0c0f8e");
    expect(appLimitKey("handoff", "5b0c0f8e-1111-2222-3333-444455556666", "secret-a")).not.toBe(key);
    expect(appLimitKey("scan", "another-user", "secret-a")).not.toBe(key);
  });
});
