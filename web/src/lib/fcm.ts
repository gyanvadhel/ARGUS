import "server-only";
import crypto from "node:crypto";
import type { ScanKind } from "./types";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedServiceAccount: ServiceAccount | null | undefined;
let cachedToken: { token: string; expiresAt: number } | null = null;

function parseServiceAccount(): ServiceAccount | null {
  if (cachedServiceAccount !== undefined) return cachedServiceAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    cachedServiceAccount = null;
    return null;
  }
  try {
    let jsonStr = raw.trim();
    if (!jsonStr.startsWith("{")) {
      jsonStr = Buffer.from(jsonStr, "base64").toString("utf8");
    }
    const parsed = JSON.parse(jsonStr);
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
      cachedServiceAccount = null;
      return null;
    }
    cachedServiceAccount = {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      project_id: parsed.project_id,
    };
    return cachedServiceAccount;
  } catch {
    cachedServiceAccount = null;
    return null;
  }
}

function base64Url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64Url(JSON.stringify(header));
  const payloadB64 = base64Url(JSON.stringify(payload));
  const signInput = `${headerB64}.${payloadB64}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signInput);
  const signature = base64Url(signer.sign(sa.private_key));
  const jwt = `${signInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google OAuth exchange failed: ${res.status} ${errorText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600),
  };
  return cachedToken.token;
}

export type PushAlertPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type PushAlertEvent =
  | { kind: "scan"; scanKind: ScanKind; subject: string; score: number; label: string; threat: string }
  | { kind: "call"; number: string; score: number; label: string; reason: string; simulated?: boolean }
  | { kind: "protection_disabled"; protection: string }
  | { kind: "device_offline"; deviceName?: string }
  | { kind: "test" };

const SCAN_KIND_LABEL: Record<ScanKind, string> = {
  url: "a link",
  email: "an email",
  text: "a message",
  phone: "a phone number",
  file: "a file",
  call: "a call",
};

/** "http://evil.com/path" -> "evil[.]com": non-clickable, defanged hostname only. */
function defangHost(url: string): string {
  const host = url.replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0];
  return host.replace(/\./g, "[.]");
}

/**
 * Composes a push alert payload strictly respecting privacy:
 * - Alerts say what happened and how risky.
 * - Never includes a message's words or email content.
 * - Never names a blocked scam site (only defanged host for scanned links).
 * - Calls may include the caller's number.
 */
export function composePushAlert(event: PushAlertEvent, person: string): PushAlertPayload {
  const title = `⚠️ Argus alert for ${person}`;
  switch (event.kind) {
    case "test":
      return {
        title: "Argus test alert",
        body: `You're set up to look out for ${person}. You'll receive alerts here if something high-risk reaches them.`,
      };
    case "call":
      return {
        title,
        body: `They're getting a call from ${event.number} rated ${event.label} (${event.score}/100): ${event.reason}. Check in with them.`,
        data: { kind: "call", number: event.number },
      };
    case "scan": {
      // Privacy rule: NEVER include message text or email words.
      const detail = event.scanKind === "url" ? `: ${defangHost(event.subject)}` : "";
      return {
        title,
        body: `They came across ${SCAN_KIND_LABEL[event.scanKind]} rated ${event.label} (${event.score}/100)${detail}. ${event.threat}`,
        data: { kind: "scan", scanKind: event.scanKind },
      };
    }
    case "protection_disabled":
      return {
        title,
        body: `${event.protection} was turned off on their phone. Check in to ensure their protections stay on.`,
        data: { kind: "protection_disabled", protection: event.protection },
      };
    case "device_offline": {
      const dev = event.deviceName ? ` (${event.deviceName})` : "";
      return {
        title,
        body: `Their phone${dev} hasn't checked in with Argus for 48 hours. Check in with them to make sure everything is okay.`,
        data: { kind: "device_offline" },
      };
    }
  }
}

/**
 * Sends an FCM push notification to one or more tokens using FCM HTTP v1.
 * Skips gracefully if FIREBASE_SERVICE_ACCOUNT is not configured.
 */
export async function sendFcmPush(
  tokens: string[],
  alert: PushAlertPayload,
): Promise<{ sent: number; failed: number; skipped?: boolean }> {
  const sa = parseServiceAccount();
  if (!sa || tokens.length === 0) {
    return { sent: 0, failed: 0, skipped: true };
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(sa);
  } catch (err) {
    console.error("Failed to acquire FCM OAuth token:", err);
    return { sent: 0, failed: tokens.length, skipped: false };
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const results = await Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: {
                title: alert.title,
                body: alert.body,
              },
              data: alert.data,
              android: {
                priority: "HIGH",
                notification: {
                  channel_id: "family",
                  notification_priority: "PRIORITY_HIGH",
                },
              },
            },
          }),
        });
        return res.ok;
      } catch {
        return false;
      }
    }),
  );

  const sent = results.filter(Boolean).length;
  return { sent, failed: tokens.length - sent };
}
