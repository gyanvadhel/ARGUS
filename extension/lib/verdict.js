// How the extension reads an Argus verdict. No browser APIs here, so it's testable with `node --test`.

export const WARN_AT = 60; // Suspicious or worse

const LEVELS = {
  SAFE: { label: "Safe", color: "#5ed3b0", badge: "✓" },
  CLEAR: { label: "No red flags", color: "#9cb8b0", badge: "" },
  "LOW/MODERATE": { label: "Low risk", color: "#f5c451", badge: "!" },
  SUSPICIOUS: { label: "Suspicious", color: "#ff9f4d", badge: "!" },
  "HIGH RISK": { label: "High risk", color: "#ff5d6c", badge: "!" },
  UNVERIFIED: { label: "Unverified", color: "#8f8b93", badge: "" },
};

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\])$/i;

/** Only real web pages get checked: never browser pages, files, or your own network. */
export function isCheckable(url) {
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && !PRIVATE_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

/** "Safe" only when positive evidence verified it; otherwise a clean result is just "No red flags". */
export function levelOf(verdict) {
  if (verdict.level === "SAFE") return verdict.verified ? LEVELS.SAFE : LEVELS.CLEAR;
  return LEVELS[verdict.level] ?? LEVELS.UNVERIFIED;
}

export function shouldWarn(verdict) {
  return verdict.score >= WARN_AT;
}

export function topReasons(verdict, count = 3) {
  return verdict.signals
    .filter((s) => s.status === "malicious" || s.status === "suspicious")
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((s) => s.summary);
}

export function vouchers(verdict) {
  return verdict.signals.filter((s) => s.status === "clean" && (s.trust ?? 0) > 0).map((s) => s.summary);
}
