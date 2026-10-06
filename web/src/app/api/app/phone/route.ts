import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { CAP_MESSAGES, withinCap } from "@/lib/app-caps";
import { parsePhoneQuery } from "@/lib/app-phone";
import { lookupPhone } from "@/lib/phone-lookup";

// The engine may be waking up on its free plan, so give it time on serverless hosting.
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const q = parsePhoneQuery(new URL(request.url));
  if ("error" in q) return fail(400, q.error);
  if (!(await withinCap(auth.supabase, "phone", auth.user.id))) return fail(429, CAP_MESSAGES.phone);
  const result = await lookupPhone(auth.supabase, q);
  if (!result.ok) return fail(502, result.error);
  return Response.json({ verdict: result.verdict, cached: result.cached, id: result.id });
}
