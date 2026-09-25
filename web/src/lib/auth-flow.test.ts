import { describe, expect, it } from "vitest";
import { confirmStep, loginNotice, signupOutcome } from "./auth-flow";

describe("signupOutcome", () => {
  it("signs straight in when Supabase returns a session", () => {
    expect(signupOutcome({ session: {}, identities: [{}], error: null }, "a@b.co")).toEqual({ kind: "signed-in" });
  });

  it("asks to check the inbox when confirmation is needed", () => {
    expect(signupOutcome({ session: null, identities: [{}], error: null }, "a@b.co")).toEqual({ kind: "check-email", email: "a@b.co" });
  });

  it("spots an email that already has an account (Supabase answers with no identities)", () => {
    expect(signupOutcome({ session: null, identities: [], error: null }, "a@b.co")).toEqual({ kind: "already-registered" });
  });

  it("passes errors through", () => {
    expect(signupOutcome({ session: null, identities: null, error: { message: "Password is too weak" } }, "a@b.co")).toEqual({
      kind: "error",
      message: "Password is too weak",
    });
  });
});

describe("confirmStep", () => {
  const step = (query: string) => confirmStep(new URLSearchParams(query));

  it("verifies a token hash from the recommended email link", () => {
    expect(step("token_hash=abc&type=email")).toEqual({ kind: "verify-token", tokenHash: "abc", type: "email" });
  });

  it("exchanges a code from the default email link", () => {
    expect(step("code=xyz")).toEqual({ kind: "exchange-code", code: "xyz" });
  });

  it("reports an error Supabase sent back", () => {
    expect(step("error=access_denied&error_description=Email+link+is+invalid+or+has+expired")).toEqual({
      kind: "failed",
      message: "Email link is invalid or has expired",
    });
  });

  it("ignores unknown token types and empty links", () => {
    expect(step("token_hash=abc&type=nonsense")).toEqual({ kind: "nothing" });
    expect(step("")).toEqual({ kind: "nothing" });
  });
});

describe("loginNotice", () => {
  const notice = (query: string) => loginNotice(new URLSearchParams(query));

  it("confirms the email when the link was opened elsewhere", () => {
    expect(notice("confirmed=1")).toEqual({ tone: "info", text: "Your email is confirmed. Sign in to continue." });
  });

  it("explains an expired or used link in plain words", () => {
    const n = notice("error=Email link is invalid or has expired");
    expect(n?.tone).toBe("error");
    expect(n?.text).toMatch(/expired or was already used/);
    expect(n?.text).toMatch(/sign in/i);
  });

  it("shows other errors as they are, but never an overlong one", () => {
    expect(notice("error=Something odd")).toEqual({ tone: "error", text: "Something odd" });
    expect(notice(`error=${"x".repeat(500)}`)?.text.length).toBeLessThanOrEqual(200);
  });

  it("says nothing on a normal visit", () => {
    expect(notice("next=/scan")).toBeNull();
  });
});
