// Only follow ?next= targets that stay on this site. Browsers treat "\" like "/", so "/\evil.com" is off-site.
export function safeNext(value: FormDataEntryValue | string | null | undefined): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/dashboard";
  return next;
}
