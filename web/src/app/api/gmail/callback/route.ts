import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, googleCreds, profileEmail } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";
import { sealToken } from "@/lib/token-box";

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Google sends the user back here. Check the state, trade the code for tokens, and store the sealed refresh token.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const back = (query: string) => {
    const response = NextResponse.redirect(new URL(`/inbox?${query}`, request.url));
    response.cookies.delete({ name: "argus_gmail_state", path: "/api/gmail" });
    return response;
  };

  if (params.get("error")) return back("error=denied");
  const code = params.get("code");
  const expected = request.cookies.get("argus_gmail_state")?.value ?? "";
  if (!code || !expected || !sameState(params.get("state") ?? "", expected)) return back("error=state");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/inbox", request.url));
  const creds = googleCreds();
  if (!creds) return back("error=not-configured");

  try {
    const tokens = await exchangeCode(creds, code);
    if (!tokens.refresh_token) return back("error=save");
    const email = await profileEmail(tokens.access_token);
    const { error } = await supabase
      .from("mail_connections")
      .upsert({ user_id: user.id, provider: "gmail", email, refresh_token: sealToken(tokens.refresh_token) });
    return back(error ? "error=save" : "connected=1");
  } catch {
    return back("error=google");
  }
}
