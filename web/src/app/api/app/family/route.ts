import { appUser, fail, unauthorized } from "@/lib/app-auth";

type Row = { link_id: string; member_id: string; member_name: string; joined_at: string };

export async function GET(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const { data, error } = await auth.supabase.rpc("my_family");
  if (error) return fail(502, "Couldn't load your family. Try again.");
  const members = ((data ?? []) as Row[]).map((m) => ({ linkId: m.link_id, name: m.member_name, joinedAt: m.joined_at }));
  return Response.json({ members });
}
