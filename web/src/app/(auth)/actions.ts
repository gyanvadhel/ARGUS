"use server";

import { redirect } from "next/navigation";
import { signupOutcome } from "@/lib/auth-flow";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string } | undefined;

const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !email) return { error: "Enter your name and email." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // The confirmation link comes back to /auth/confirm, which signs the person in.
    options: { data: { full_name: name }, emailRedirectTo: `${APP_URL}/auth/confirm` },
  });
  const outcome = signupOutcome({ session: data.session, identities: data.user?.identities, error }, email);
  if (outcome.kind === "error") return { error: outcome.message };
  if (outcome.kind === "already-registered") return { error: "There's already an account with this email. Sign in instead." };
  if (outcome.kind === "check-email") {
    return { notice: `We sent a confirmation link to ${outcome.email}. Open it to finish creating your account.` };
  }
  redirect("/dashboard");
}

/** Hands you to Google; you come back through /auth/confirm, which signs you in. */
export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${APP_URL}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(error?.message ?? "Google sign-in isn't available right now.")}`);
  redirect(data.url);
}

export async function requestPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter the email you signed up with." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}/auth/confirm?next=/reset-password` });
  if (error && /not authorized/i.test(error.message)) {
    return { error: "Argus can't email that address yet: its free email service only reaches approved addresses." };
  }
  if (error && !/not found/i.test(error.message)) return { error: error.message };
  // The same answer whether or not the account exists, so strangers can't probe which emails have one.
  return { notice: `If ${email} has an Argus account, a reset link is on its way. Open it in this browser.` };
}

export async function updatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
