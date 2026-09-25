import type { EmailOtpType } from "@supabase/supabase-js";

export type SignupOutcome =
  | { kind: "signed-in" }
  | { kind: "check-email"; email: string }
  | { kind: "already-registered" }
  | { kind: "error"; message: string };

/** What signing up led to. For an email that already has an account, Supabase answers with a look-alike
 *  success that has no identities while email confirmation is on, and with an error while it's off. */
export function signupOutcome(
  result: { session: unknown; identities: unknown[] | null | undefined; error: { message: string } | null },
  email: string,
): SignupOutcome {
  if (result.error) {
    return /already registered|already exists/i.test(result.error.message)
      ? { kind: "already-registered" }
      : { kind: "error", message: result.error.message };
  }
  if (Array.isArray(result.identities) && result.identities.length === 0) return { kind: "already-registered" };
  if (result.session) return { kind: "signed-in" };
  return { kind: "check-email", email };
}

export type ConfirmStep =
  | { kind: "verify-token"; tokenHash: string; type: EmailOtpType }
  | { kind: "exchange-code"; code: string }
  | { kind: "failed"; message: string }
  | { kind: "nothing" };

const EMAIL_TYPES = new Set<string>(["signup", "email", "invite", "magiclink", "recovery", "email_change"]);

/** How to finish an email link. Supabase's recommended link carries a token hash, its default
 *  link a one-time code, and a failed link an error description. */
export function confirmStep(params: URLSearchParams): ConfirmStep {
  const error = params.get("error_description");
  if (error) return { kind: "failed", message: error };
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (tokenHash && type && EMAIL_TYPES.has(type)) return { kind: "verify-token", tokenHash, type: type as EmailOtpType };
  const code = params.get("code");
  if (code) return { kind: "exchange-code", code };
  return { kind: "nothing" };
}

export type Notice = { tone: "info" | "error"; text: string };

const EXPIRED = /invalid or has expired|otp_expired|already been used/i;

/** The message the sign-in page shows after an email link sent someone there. */
export function loginNotice(params: URLSearchParams): Notice | null {
  if (params.get("confirmed") === "1") return { tone: "info", text: "Your email is confirmed. Sign in to continue." };
  const error = params.get("error")?.trim();
  if (!error) return null;
  if (EXPIRED.test(error)) {
    return {
      tone: "error",
      text: "That link has expired or was already used. If you confirmed your email already, just sign in; otherwise sign up again for a new link.",
    };
  }
  return { tone: "error", text: error.slice(0, 200) };
}
