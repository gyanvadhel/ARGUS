// "Share to Argus": what another app shares (Android puts links in `text` or `url`, and a page title in `title`)
// becomes one thing to scan.

const MAX_INPUT = 2000;

export function sharedInput({ title, text, url }: { title?: string | null; text?: string | null; url?: string | null }): string {
  const message = text?.trim() ?? "";
  const link = url?.trim() ?? "";
  const combined = link && !message.includes(link) ? [message, link].filter(Boolean).join("\n") : message;
  return (combined || title?.trim() || "").slice(0, MAX_INPUT);
}

export function scanPathFor(input: string): string {
  return input ? `/scan?${new URLSearchParams({ input, run: "1" })}` : "/scan";
}
