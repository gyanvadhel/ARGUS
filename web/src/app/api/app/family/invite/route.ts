import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { CAP_MESSAGES, withinCap } from "@/lib/app-caps";
import { APP_URL } from "@/lib/app-url";
import { hashInviteCode, inviteUrl, newInviteCode } from "@/lib/family-invite";

export async function POST(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  if (!(await withinCap(auth.supabase, "invite", auth.user.id))) return fail(429, CAP_MESSAGES.invite);
  const code = newInviteCode();
  const { data, error } = await auth.supabase
    .from("family_invites")
    .insert({ code_hash: hashInviteCode(code) })
    .select("expires_at")
    .single();
  if (error) return fail(502, "Couldn't create an invite. Try again.");
  return Response.json({ url: inviteUrl(APP_URL, code), expiresAt: data.expires_at });
}
