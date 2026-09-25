import "server-only";
import type { Community, ScanKind, Verdict } from "./types";

const BASE = process.env.ARGUS_API_URL ?? "http://127.0.0.1:8000";

export class ApiOfflineError extends Error {}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 25000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error("The scan took too long to finish. Please try again.");
    }
    throw new ApiOfflineError("The ARGUS scanning engine is offline. Start it with dev.ps1.");
  }
  if (!res.ok) {
    const body = await res.text();
    let detail: unknown = body;
    try { detail = JSON.parse(body).detail ?? body; } catch { /* plain text */ }
    const message = typeof detail === "string" ? detail : JSON.stringify(detail);
    throw new Error(`Scan failed (${res.status}): ${message.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  scan: (input: string, community?: Community, kind?: ScanKind) =>
    call<Verdict>("/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input, community, kind }),
    }),
  scanFile: (file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return call<Verdict>("/scan/file", { method: "POST", body: form });
  },
  normalizePhone: (number: string) =>
    call<{ e164: string | null }>(`/phone/normalize?number=${encodeURIComponent(number)}`, undefined, 5000),
  health: () => call<{ status: string; sources: Record<string, boolean> }>("/health", undefined, 3000),
};
