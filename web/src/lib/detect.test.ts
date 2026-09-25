import { describe, expect, it } from "vitest";
import { detectKind } from "./detect";

describe("detectKind mirrors the engine's routing", () => {
  it("reads links with or without a scheme", () => {
    expect(detectKind("https://paypal-security-alert.net/verify")).toBe("url");
    expect(detectKind("bit.ly/3xyz")).toBe("url");
    expect(detectKind("http://185.12.4.9/login")).toBe("url");
  });
  it("reads anything number-shaped as a phone number, even impossible ones", () => {
    expect(detectKind("+91 98765 43210")).toBe("phone");
    expect(detectKind("1-800-555-0142")).toBe("phone");
    expect(detectKind("12345678901234567890")).toBe("phone");
  });
  it("reads raw emails by their headers", () => {
    expect(detectKind("From: a@b.com\nSubject: hi\n\nbody")).toBe("email");
  });
  it("reads everything else as a message", () => {
    expect(detectKind("URGENT: your account is suspended, verify now")).toBe("text");
    expect(detectKind("")).toBe(null);
  });
});
