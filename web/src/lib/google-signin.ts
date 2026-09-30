import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// "Continue with Google" handled on Argus's own address, so Google's screen names this site rather than the
// Supabase project: Google posts a signed ID token back here, and Supabase checks it (signInWithIdToken).
// The one-time state and nonce live in a short-lived cookie that Google's cross-site post must be able to carry.
export const FLOW_COOKIE = "argus_google_signin";
export const FLOW_PATH = "/api/auth/google";

export type Flow = { state: string; nonce: string; next: string };

/** The Google client for sign-in (a separate, published Google project); unset means use Supabase's hosted flow. */
export function signInClientId(): string | null {
  return process.env.GOOGLE_SIGNIN_CLIENT_ID || null;
}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sameValue(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Google gets the nonce's hash; Supabase later gets the raw nonce and checks the hash inside the token matches. */
export function googleSignInUrl({ clientId, redirectUri, state, nonce }: { clientId: string; redirectUri: string; state: string; nonce: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "id_token",
    response_mode: "form_post",
    scope: "openid email profile",
    state,
    nonce: sha256Hex(nonce),
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export function packFlow(flow: Flow): string {
  return Buffer.from(JSON.stringify(flow)).toString("base64url");
}

export function unpackFlow(value: string | undefined): Flow | null {
  if (!value) return null;
  try {
    const flow = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return typeof flow?.state === "string" && typeof flow?.nonce === "string" && typeof flow?.next === "string" ? flow : null;
  } catch {
    return null;
  }
}
