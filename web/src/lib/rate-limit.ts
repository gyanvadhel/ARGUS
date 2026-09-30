import "server-only";
import { createHmac } from "node:crypto";

/** The visitor's address as the host passes it on: the first hop of x-forwarded-for. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** What a visitor's checks are counted under: a keyed hash, so the address itself is never stored. */
export function limitKey(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(`preview:${ip}`).digest("hex");
}

/** What an app user's checks are counted under: a keyed hash of what's counted and for whom, never the account ID. */
export function appLimitKey(purpose: string, userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`app:${purpose}:${userId}`).digest("hex");
}
