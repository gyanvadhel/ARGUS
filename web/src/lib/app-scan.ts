// The Android app's scan requests: what to check and whether to keep it in history.

export type SaveMode = "always" | "flagged";
export const SAVE_FLAGGED_AT = 60;
export const MAX_APP_INPUT = 20_000;

/** Checks people start are always saved (like the Scan page); automatic ones only when they're flagged. */
export function shouldSave(mode: SaveMode, score: number): boolean {
  return mode === "always" || score >= SAVE_FLAGGED_AT;
}

export function parseScanBody(body: unknown): { input: string; save: SaveMode } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as { input?: unknown; save?: unknown };
  const input = typeof b.input === "string" ? b.input.trim() : "";
  if (!input) return { error: "Nothing to check. Paste or share something first." };
  if (input.length > MAX_APP_INPUT) return { error: "That's too long to check. Share a shorter part of it." };
  return { input, save: b.save === "flagged" ? "flagged" : "always" };
}
