import type { ScanKind } from "./types";

// Mirrors api/argus_api/detect.py so the page can say what it's reading before anything is sent.
const HEADER = /^(from|to|subject|received|return-path|message-id|date|reply-to|authentication-results):/gim;
const URL = /^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(:\d{2,5})?([/?#]\S*)?$/i;
const IP_URL = /^(https?:\/\/)?\d{1,3}(\.\d{1,3}){3}(:\d{2,5})?([/?#]\S*)?$/;
const SCHEME = /^https?:\/\/\S+$/i;
const PHONE = /^\+?[\d\s\-().]+$/;

export function detectKind(raw: string): ScanKind | null {
  const text = raw.trim();
  if (!text) return null;
  if ((text.match(HEADER) ?? []).length >= 2) return "email";
  if (IP_URL.test(text)) return "url";
  if (PHONE.test(text) && (text.match(/\d/g) ?? []).length >= 7) return "phone";
  if (SCHEME.test(text) || URL.test(text)) return "url";
  return "text";
}
