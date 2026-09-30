import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { CAP_MESSAGES, withinCap } from "@/lib/app-caps";
import { parseScanBody } from "@/lib/app-scan";
import { performScan } from "@/lib/scan-core";

// Scans visit sites and ask several sources, so give them time on serverless hosting.
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const body = parseScanBody(await request.json().catch(() => null));
  if ("error" in body) return fail(400, body.error);
  if (!(await withinCap(auth.supabase, "scan", auth.user.id))) return fail(429, CAP_MESSAGES.scan);
  const result = await performScan(auth.supabase, { input: body.input }, body.save);
  if (!result.ok) return fail(502, result.error);
  return Response.json({ id: result.id, verdict: result.verdict, alerted: result.alerted });
}
