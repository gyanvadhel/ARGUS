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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
