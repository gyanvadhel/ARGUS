import { after } from "next/server";
import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { alertProtectionDisabled } from "@/lib/family-alerts";
import { adminClient } from "@/lib/supabase/admin";

type DeviceRequestBody = {
  deviceId?: unknown;
  name?: unknown;
  appVersion?: unknown;
  protections?: unknown;
  fcmToken?: unknown;
};

export async function POST(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();

  let body: DeviceRequestBody;
  try {
    body = (await request.json()) as DeviceRequestBody;
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  const appVersion = typeof body.appVersion === "string" ? body.appVersion.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : null;
  const fcmToken = typeof body.fcmToken === "string" && body.fcmToken.trim() ? body.fcmToken.trim() : null;

  if (!deviceId || deviceId.length > 120) {
    return fail(400, "Invalid or missing deviceId.");
  }
  if (!appVersion || appVersion.length > 40) {
    return fail(400, "Invalid or missing appVersion.");
  }

  const protections =
    typeof body.protections === "object" && body.protections !== null && !Array.isArray(body.protections)
      ? (body.protections as Record<string, boolean>)
      : {};

  // Check previous row to detect any protections toggled from ON to OFF
  const { data: previous } = await auth.supabase
    .from("app_devices")
    .select("protections, name")
    .eq("id", deviceId)
    .maybeSingle();

  if (previous && previous.protections && typeof previous.protections === "object") {
    const prev = previous.protections as Record<string, unknown>;
    const person =
      String(auth.user.user_metadata?.full_name ?? "").split(" ")[0] || "your family member";
    const devName = name || (typeof previous.name === "string" ? previous.name : undefined);

    for (const [key, prevVal] of Object.entries(prev)) {
      if (prevVal === true && protections[key] === false) {
        const label =
          key === "blocker"
            ? "Scam-site blocker"
            : key === "calls"
              ? "Call warnings"
              : key;
        // Sent after the reply; a bare promise could be cut off when the function finishes.
        after(() => alertProtectionDisabled(auth.user.id, person, label, devName));
      }
    }
  }

  const { error } = await auth.supabase.from("app_devices").upsert({
    id: deviceId,
    user_id: auth.user.id,
    name,
    app_version: appVersion,
    protections,
    fcm_token: fcmToken,
    last_seen_at: new Date().toISOString(),
  });

  if (error) {
    return fail(500, "Couldn't record device status.");
  }

  // A push token belongs to one phone. If this phone was signed in to another account before (and its sign-out never
  // reached us), that old row still holds the token and would keep getting the old circle's alerts.
  if (fcmToken) {
    await adminClient()
      ?.from("app_devices")
      .update({ fcm_token: null })
      .eq("fcm_token", fcmToken)
      .neq("id", deviceId);
  }

  return Response.json({ ok: true });
}

/** Signing out: forget this phone, so its circle stops seeing it and stops pushing to it. */
export async function DELETE(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();

  let deviceId = "";
  try {
    const body = (await request.json()) as { deviceId?: unknown };
    deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  } catch {
    return fail(400, "Invalid JSON body.");
  }
  if (!deviceId || deviceId.length > 120) return fail(400, "Invalid or missing deviceId.");

  const { error } = await auth.supabase.from("app_devices").delete().eq("id", deviceId);
  if (error) return fail(500, "Couldn't forget this device.");
  return Response.json({ ok: true });
}
