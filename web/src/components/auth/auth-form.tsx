"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithGoogle, type AuthState } from "@/app/(auth)/actions";

type Props = {
  mode: "login" | "signup";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
  /** Shown only once Google sign-in is switched on in Supabase (NEXT_PUBLIC_GOOGLE_SIGNIN=1). */
  google?: boolean;
};

export function AuthForm({ mode, action, next, google = false }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const signup = mode === "signup";
  return (
    <div className="space-y-5">
      {google && (
        <>
          <form action={signInWithGoogle}>
            {next && <input type="hidden" name="next" value={next} />}
            <Button type="submit" variant="outline" className="h-11 w-full rounded-full text-sm">
              Continue with Google
            </Button>
          </form>
          <p className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
            or with email
          </p>
        </>
      )}
      <form action={formAction} className="space-y-5">
        {next && <input type="hidden" name="next" value={next} />}
        {signup && (
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required autoComplete="name" placeholder="Priya Shah" className="h-10" />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="h-10" />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            {!signup && (
              <Link href="/forgot" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Forgot password?
              </Link>
            )}
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={signup ? 8 : undefined}
            autoComplete={signup ? "new-password" : "current-password"}
            className="h-10"
          />
        </div>
        {state?.error && (
          <p role="alert" className="rounded-lg border border-risk-high/30 bg-risk-high/10 px-3 py-2 text-sm text-risk-high">
            {state.error}
          </p>
        )}
        {state?.notice && (
          <p role="status" className="rounded-lg border border-border bg-white/4 px-3 py-2 text-sm text-foreground">
            {state.notice}
          </p>
        )}
        <Button type="submit" className="h-11 w-full rounded-full text-sm" disabled={pending}>
          {pending ? "One moment…" : signup ? "Create account" : "Sign in"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {signup ? "Already have an account? " : "New to Argus? "}
          <Link href={signup ? "/login" : "/signup"} className="text-foreground underline-offset-4 hover:underline">
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </form>
    </div>
  );
}
