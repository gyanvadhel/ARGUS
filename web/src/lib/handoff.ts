import { safeNext } from "@/lib/safe-next";

/** The one-time link that signs the app's user in on the website and then lands on `next` (on-site paths only). */
export function handoffUrl(appUrl: string, tokenHash: string, next: string): string {
  const url = new URL("/auth/confirm", appUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", safeNext(next));
  return url.toString();
}
