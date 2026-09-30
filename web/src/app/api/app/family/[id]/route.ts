import { appUser, fail, unauthorized } from "@/lib/app-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, "That family link isn't valid.");
  const { error } = await auth.supabase.from("family_links").delete().eq("id", id);
  if (error) return fail(502, "Couldn't leave that family. Try again.");
  return Response.json({ left: true });
}
