import { createClient } from "@supabase/supabase-js";
import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { CAP_MESSAGES, withinCap } from "@/lib/app-caps";
import { APP_URL } from "@/lib/app-url";
import { handoffUrl } from "@/lib/handoff";

// Opens website pages (History, Family, Caller ID…) signed in from the app, without a second sign-in. The secret key
// only ever creates a one-time link for the person the access token belongs to.
export async function POST(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return fail(503, "Opening the website signed in isn't set up yet. You can sign in on the website instead.");
  const email = auth.user.email;
  if (!email) return fail(400, "This account has no email address to sign in with.");
  if (!(await withinCap(auth.supabase, "handoff", auth.user.id))) return fail(429, CAP_MESSAGES.handoff);

  const body = (await request.json().catch(() => ({}))) as { next?: unknown };
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return fail(502, "Couldn't open the website signed in. Try again.");
  return Response.json({ url: handoffUrl(APP_URL, tokenHash, typeof body.next === "string" ? body.next : "/dashboard") });
}
