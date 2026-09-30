// Only follow ?next= targets that stay on this site. Browsers treat "\" like "/", so "/\evil.com" is off-site.
export function safeNext(value: FormDataEntryValue | string | null | undefined): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/dashboard";
  return next;
}

const MAX_NEXT = 2500;

/** Where sign-in should return you: the page you were opening, with its query (a shared link, say) if it fits. */
export function loginNext(path: string, search: string): string {
  const full = `${path}${search}`;
  return full.length <= MAX_NEXT ? full : path;
}
