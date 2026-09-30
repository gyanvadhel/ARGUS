import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { isInviteCode } from "@/lib/family-invite";

export async function POST(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  if (!isInviteCode(body.code)) return fail(400, "That invite link isn't valid.");
  const { data, error } = await auth.supabase.rpc("accept_family_invite", { p_code: body.code });
  if (error) return fail(400, error.message);
  const row = (data as { link_id: string; inviter_name: string }[] | null)?.[0];
  return Response.json({ name: row?.inviter_name ?? "your family member" });
}
