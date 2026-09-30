import { createHash, randomBytes } from "node:crypto";

// Family invite links: 144 random bits, link-safe, stored only as a SHA-256 hash (the database hashes the same way).
export const INVITE_CODE = /^[A-Za-z0-9_-]{16,64}$/;

export function newInviteCode(): string {
  return randomBytes(18).toString("base64url");
}

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function isInviteCode(code: unknown): code is string {
  return typeof code === "string" && INVITE_CODE.test(code);
}

export function inviteUrl(appUrl: string, code: string): string {
  return new URL(`/app/join/${code}`, appUrl).toString();
}
