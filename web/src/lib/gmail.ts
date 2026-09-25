import "server-only";

// Read-only Gmail access over Google's REST APIs: sign-in, token refresh, and reading recent inbox messages.

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GoogleCreds = { clientId: string; clientSecret: string; redirectUri: string };
export type MailMeta = { id: string; from: string; subject: string; date: string | null; snippet: string };
type Header = { name: string; value: string };
type Part = {
  mimeType?: string;
  filename?: string;
  headers?: Header[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: Part[];
};
type GmailMessage = { id: string; snippet?: string; internalDate?: string; payload?: Part };

/** Thrown when the user revoked access or the grant expired: the app should ask them to reconnect. */
export class GmailAccessRevoked extends Error {}

/** Everything needed to talk to Google, or null when this server hasn't been set up for Gmail. */
export function googleCreds(): GoogleCreds | null {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_TOKEN_KEY } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GMAIL_TOKEN_KEY) return null;
  const app = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, redirectUri: `${app}/api/gmail/callback` };
}

export function buildAuthUrl(creds: GoogleCreds, state: string): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline", // a refresh token, so Argus can check new mail later without another sign-in
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function tokenCall(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.error === "invalid_grant") throw new GmailAccessRevoked("Gmail access was revoked or expired");
  if (!res.ok) throw new Error(`Google sign-in failed (${String(body.error ?? res.status)})`);
  return body as { access_token: string; refresh_token?: string; expires_in: number };
}

export function exchangeCode(creds: GoogleCreds, code: string) {
  return tokenCall({
    code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: creds.redirectUri,
    grant_type: "authorization_code",
  });
}

export async function refreshAccessToken(creds: GoogleCreds, refreshToken: string): Promise<string> {
  const tokens = await tokenCall({
    refresh_token: refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "refresh_token",
  });
  return tokens.access_token;
}

export async function revoke(token: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST", cache: "no-store" }).catch(() => undefined);
}

async function gmail<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL}${path}`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (res.status === 401) throw new GmailAccessRevoked("Gmail access was revoked or expired");
  if (!res.ok) throw new Error(`Gmail didn't answer (${res.status})`);
  return res.json() as Promise<T>;
}

export async function profileEmail(accessToken: string): Promise<string> {
  return (await gmail<{ emailAddress: string }>(accessToken, "/profile")).emailAddress;
}

export type Folder = "inbox" | "spam";

export async function listRecent(accessToken: string, max = 10, folder: Folder = "inbox"): Promise<MailMeta[]> {
  const label = folder === "spam" ? "SPAM" : "INBOX";
  const list = await gmail<{ messages?: { id: string }[] }>(accessToken, `/messages?maxResults=${max}&labelIds=${label}`);
  const heads = "&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date";
  const messages = await Promise.all(
    (list.messages ?? []).map((m) => gmail<GmailMessage>(accessToken, `/messages/${m.id}?format=metadata${heads}`)),
  );
  return messages.map(toMeta);
}

export async function fullMessage(accessToken: string, id: string): Promise<GmailMessage> {
  return gmail<GmailMessage>(accessToken, `/messages/${encodeURIComponent(id)}?format=full`);
}

// --- turning Gmail's JSON into something the Argus engine reads --------------------------------------
function headerValue(headers: Header[], name: string): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function toMeta(m: GmailMessage): MailMeta {
  const headers = m.payload?.headers ?? [];
  return {
    id: m.id,
    from: headerValue(headers, "From") ?? "Unknown sender",
    subject: headerValue(headers, "Subject") || "(no subject)",
    date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
    snippet: decodeEntities(m.snippet ?? ""),
  };
}

export { senderName } from "./mail-format";

// Only the headers Argus judges a sender by; the Received chain alone can run to tens of kilobytes.
const KEEP = ["From", "To", "Reply-To", "Return-Path", "Subject", "Date", "Message-ID", "Authentication-Results", "Received-SPF"];
const BODY_LIMIT = 30_000;

/** A compact email: the judging headers plus the text and HTML bodies (with their links), never attachments. */
export function toRawEmail(m: GmailMessage): string {
  const payload = m.payload ?? {};
  const headers = (payload.headers ?? [])
    .filter((h) => KEEP.some((k) => k.toLowerCase() === h.name.toLowerCase()))
    .map((h) => `${h.name}: ${h.value.replace(/\r?\n/g, " ").slice(0, 2000)}`);
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (part: Part) => {
    if (part.filename) return; // an attachment
    if (part.body?.data && part.mimeType === "text/plain") plain.push(decodeBase64Url(part.body.data));
    else if (part.body?.data && part.mimeType === "text/html") html.push(decodeBase64Url(part.body.data));
    part.parts?.forEach(walk);
  };
  walk(payload);
  const boundary = "argus-part";
  const sections = (
    [
      ["text/plain", plain.join("\n")],
      ["text/html", html.join("\n")],
    ] as const
  ).filter(([, text]) => text);
  const body = sections
    .map(([type, text]) => `--${boundary}\r\nContent-Type: ${type}; charset=utf-8\r\n\r\n${text.slice(0, BODY_LIMIT)}\r\n`)
    .join("");
  return `${headers.join("\r\n")}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n${body}--${boundary}--\r\n`;
}
