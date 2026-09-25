import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Gmail refresh tokens are sealed with AES-256-GCM before they touch the database,
// so a leaked table on its own can't read anyone's inbox.

function keyFrom(b64: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("GMAIL_TOKEN_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function sealToken(plain: string, keyB64 = process.env.GMAIL_TOKEN_KEY ?? ""): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keyB64), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function openToken(sealed: string, keyB64 = process.env.GMAIL_TOKEN_KEY ?? ""): string {
  const bytes = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyB64), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}
