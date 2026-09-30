import { NextResponse, type NextRequest } from "next/server";
import { APP_URL } from "@/lib/app-url";
import { FLOW_COOKIE, FLOW_PATH, sameValue, unpackFlow } from "@/lib/google-signin";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

// Google posts the signed-in result here. Supabase checks the ID token (signature, audience and the nonce),
// creates the account on first sign-in, and sets the session cookies.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const flow = unpackFlow(request.cookies.get(FLOW_COOKIE)?.value);
  const go = (path: string, query: Record<string, string> = {}) => {
    const url = new URL(path, APP_URL);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = NextResponse.redirect(url, 303); // back to an ordinary page load after Google's post
    response.cookies.set(FLOW_COOKIE, "", { path: FLOW_PATH, maxAge: 0, secure: true, sameSite: "none" });
    return response;
  };

  if (form.get("error")) return go("/login", { error: "Google sign-in was cancelled, so you weren't signed in." });
  const token = String(form.get("id_token") ?? "");
  if (!flow || !token || !sameValue(String(form.get("state") ?? ""), flow.state)) {
    return go("/login", { error: "That Google sign-in expired or didn't start here. Try again." });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token, nonce: flow.nonce });
  if (error) return go("/login", { error: error.message });
  return go(safeNext(flow.next));
}
