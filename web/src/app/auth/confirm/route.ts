import { type NextRequest, NextResponse } from "next/server";
import { afterFailedCode, confirmStep } from "@/lib/auth-flow";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

// Where email links and Google sign-in land: turns the link's one-time token or code into a signed-in session,
// then continues (to the dashboard, or to choosing a new password). The token never stays in the address bar.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = params.get("next");
  const go = (path: string, query: Record<string, string> = {}) => {
    const url = new URL(path, request.nextUrl.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return NextResponse.redirect(url);
  };
  const failed = (message: string) => go(next === "/reset-password" ? "/forgot" : "/login", { error: message });

  const step = confirmStep(params);
  if (step.kind === "failed") return failed(step.message);
  if (step.kind === "nothing") return go("/login");

  const supabase = await createClient();
  const { error } =
    step.kind === "verify-token"
      ? await supabase.auth.verifyOtp({ type: step.type, token_hash: step.tokenHash })
      : await supabase.auth.exchangeCodeForSession(step.code);
  if (!error) return go(safeNext(next));
  if (step.kind === "exchange-code") {
    const to = afterFailedCode(next);
    return go(to.path, to.query);
  }
  return failed(error.message);
}
