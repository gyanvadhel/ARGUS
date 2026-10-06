import { appUser, fail, unauthorized } from "@/lib/app-auth";

type FamilyStatusRow = {
  member_id: string;
  member_name: string;
  device_id: string | null;
  device_name: string | null;
  app_version: string | null;
  protections: Record<string, boolean> | null;
  last_seen_at: string | null;
};

export async function GET(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();

  const { data, error } = await auth.supabase.rpc("family_status");
  if (error) {
    return fail(502, "Couldn't load family device status.");
  }

  const rows = (data ?? []) as FamilyStatusRow[];
  const members = rows.map((r) => ({
    memberId: r.member_id,
    memberName: r.member_name,
    deviceId: r.device_id,
    deviceName: r.device_name,
    appVersion: r.app_version,
    protections: r.protections ?? {},
    lastSeenAt: r.last_seen_at,
  }));

  return Response.json({ members });
}
