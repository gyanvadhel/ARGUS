import { NextResponse, type NextRequest } from "next/server";
import { APP_URL } from "@/lib/app-url";
import { FLOW_COOKIE, FLOW_PATH, googleSignInUrl, newToken, packFlow, signInClientId } from "@/lib/google-signin";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

// Starts "Continue with Google" (see lib/google-signin.ts).
export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  // The state cookie must live on the address Google posts back to, so start there.
  if (request.nextUrl.origin !== new URL(APP_URL).origin) {
    return NextResponse.redirect(`${APP_URL}${FLOW_PATH}?next=${encodeURIComponent(next)}`);
  }

  const clientId = signInClientId();
  if (!clientId) {
    // Not set up for Argus's own flow yet: Supabase's hosted flow (its screen names the Supabase project).
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${APP_URL}/auth/confirm?next=${encodeURIComponent(next)}` },
    });
    if (error || !data.url) {
      return NextResponse.redirect(`${APP_URL}/login?error=${encodeURIComponent(error?.message ?? "Google sign-in isn't available right now.")}`);
    }
    return NextResponse.redirect(data.url);
  }

  const state = newToken();
  const nonce = newToken();
  const response = NextResponse.redirect(googleSignInUrl({ clientId, redirectUri: `${APP_URL}${FLOW_PATH}/callback`, state, nonce }));
  // SameSite=None: Google's answer arrives as a cross-site form post, which drops Lax cookies.
  response.cookies.set(FLOW_COOKIE, packFlow({ state, nonce, next }), {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: FLOW_PATH,
    maxAge: 600,
  });
  return response;
}
