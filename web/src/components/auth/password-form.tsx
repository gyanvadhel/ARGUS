"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "@/app/(auth)/actions";

type Props = {
  /** "request" asks for the account's email; "update" sets the new password after the reset link. */
  mode: "request" | "update";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
};

export function PasswordForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const request = mode === "request";
  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor={request ? "email" : "password"}>{request ? "Email" : "New password"}</Label>
        {request ? (
          <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="h-10" />
        ) : (
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="h-10" />
        )}
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
        {pending ? "One moment…" : request ? "Send reset link" : "Save new password"}
      </Button>
      {request && (
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      )}
    </form>
  );
}
