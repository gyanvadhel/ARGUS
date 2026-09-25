import { type NextRequest, NextResponse } from "next/server";
import { confirmStep } from "@/lib/auth-flow";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

// Where confirmation emails land: turns the link's one-time token or code into a signed-in session, then
// continues to the dashboard. The token never stays in the address bar.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const go = (path: string, query: Record<string, string> = {}) => {
    const url = new URL(path, request.nextUrl.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return NextResponse.redirect(url);
  };

  const step = confirmStep(params);
  if (step.kind === "failed") return go("/login", { error: step.message });
  if (step.kind === "nothing") return go("/login");

  const supabase = await createClient();
  const { error } =
    step.kind === "verify-token"
      ? await supabase.auth.verifyOtp({ type: step.type, token_hash: step.tokenHash })
      : await supabase.auth.exchangeCodeForSession(step.code);
  if (!error) return go(safeNext(params.get("next")));
  // A code only works in the browser that signed up, but Supabase confirmed the email before handing it out.
  return step.kind === "exchange-code" ? go("/login", { confirmed: "1" }) : go("/login", { error: error.message });
}
