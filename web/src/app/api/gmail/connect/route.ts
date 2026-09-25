import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl, googleCreds } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";

// Starts "Connect Gmail": a one-time state value in a short-lived cookie, then Google's consent screen.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/inbox", request.url));
  const creds = googleCreds();
  if (!creds) return NextResponse.redirect(new URL("/inbox?error=not-configured", request.url));

  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(buildAuthUrl(creds, state));
  response.cookies.set("argus_gmail_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/api/gmail",
    maxAge: 600,
  });
  return response;
}
