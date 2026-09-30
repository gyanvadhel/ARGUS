/** The site's own address (https://askargus.app live), used for links that must come back here. */
export const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Where a request that arrived on another address should go: the same page on the real address, or null to serve
 * it where it is. Only the live site's own *.vercel.app addresses are forwarded; previews keep theirs.
 */
export function canonicalRedirect(requestUrl: URL, appUrl: string, vercelEnv: string | undefined): string | null {
  if (vercelEnv !== "production") return null;
  const target = new URL(appUrl);
  if (requestUrl.host === target.host || !requestUrl.hostname.endsWith(".vercel.app")) return null;
  return new URL(`${requestUrl.pathname}${requestUrl.search}`, target).toString();
}
