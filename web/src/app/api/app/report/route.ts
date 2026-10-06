import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { CAP_MESSAGES, withinCap } from "@/lib/app-caps";
import { parseReportBody } from "@/lib/app-phone";
import { phoneCache } from "@/lib/phone-cache";

// "Scam" on a call warning: report the number from this account, then drop its shared cached verdict.
export async function POST(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const body = parseReportBody(await request.json().catch(() => null));
  if ("error" in body) return fail(400, body.error);
  if (!(await withinCap(auth.supabase, "report", auth.user.id))) return fail(429, CAP_MESSAGES.report);
  const { error } = await auth.supabase.from("phone_reports").insert({ number: body.number, category: "Scam" });
  if (error && error.code !== "23505") return fail(502, "Couldn't send your report. Try again.");
  await phoneCache.forget(body.number).catch(() => undefined);
  return Response.json({ ok: true });
}
