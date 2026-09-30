import { describe, expect, it } from "vitest";
import { hashInviteCode, inviteUrl, isInviteCode, newInviteCode } from "./family-invite";

describe("invite codes", () => {
  it("are long, random and link-safe", () => {
    const a = newInviteCode();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newInviteCode()).not.toBe(a);
    expect(isInviteCode(a)).toBe(true);
  });
  it("are stored only as a SHA-256 hash, the same way the database checks them", () => {
    expect(hashInviteCode("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("turn away anything that isn't a code", () => {
    expect(isInviteCode("short")).toBe(false);
    expect(isInviteCode("has spaces in it here!!")).toBe(false);
    expect(isInviteCode(42)).toBe(false);
    expect(isInviteCode("x".repeat(65))).toBe(false);
  });
  it("become a join link on the site", () => {
    expect(inviteUrl("https://askargus.app", "AbCdEfGhIjKlMnOpQrStUvWx")).toBe("https://askargus.app/app/join/AbCdEfGhIjKlMnOpQrStUvWx");
  });
});
