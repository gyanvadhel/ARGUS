import { adminClient } from "@/lib/supabase/admin";
import { alertDeviceOffline } from "@/lib/family-alerts";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("Cron not configured.", { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = adminClient();
  if (!admin) {
    return new Response("Supabase admin client not available.", { status: 500 });
  }

  // Phones that went quiet between 48 and 72 hours ago. The cron runs once a day, so each silent phone falls in this
  // window exactly once: the circle hears about it once, not every day until the app is reinstalled.
  const HOUR = 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - 48 * HOUR).toISOString();
  const since = new Date(Date.now() - 72 * HOUR).toISOString();
  const { data: offlineDevices, error } = await admin
    .from("app_devices")
    .select("id, user_id, name, last_seen_at")
    .lt("last_seen_at", cutoff)
    .gte("last_seen_at", since);

  if (error || !offlineDevices) {
    return new Response(JSON.stringify({ error: error?.message ?? "Query failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let alerted = 0;
  for (const dev of offlineDevices) {
    try {
      const { data: userData } = await admin.auth.admin.getUserById(dev.user_id);
      const person =
        String(userData?.user?.user_metadata?.full_name ?? "").split(" ")[0] || "your family member";
      await alertDeviceOffline(dev.user_id, person, dev.name ?? undefined);
      alerted++;
    } catch (e) {
      console.error(`Failed to alert for offline device ${dev.id}:`, e);
    }
  }

  return Response.json({
    ok: true,
    checked: offlineDevices.length,
    alerted,
    cutoff,
  });
}
