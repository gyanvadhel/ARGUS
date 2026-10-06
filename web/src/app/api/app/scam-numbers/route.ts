import { appUser, fail, unauthorized } from "@/lib/app-auth";

// Numbers many people have flagged, for instant warnings on the phone. Numbers and labels only.
export async function GET(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const { data, error } = await auth.supabase.rpc("known_scam_numbers");
  if (error) return fail(502, "Couldn't load the list. Try again.");
  return Response.json({ numbers: data ?? [] });
}
