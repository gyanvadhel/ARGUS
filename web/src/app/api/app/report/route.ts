import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { parseReportBody } from "@/lib/app-phone";

// "Scam" on a call warning: report the number from this account, then drop its shared cached verdict.
export async function POST(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const body = parseReportBody(await request.json().catch(() => null));
  if ("error" in body) return fail(400, body.error);
  const { error } = await auth.supabase.from("phone_reports").insert({ number: body.number, category: "Scam" });
  if (error && error.code !== "23505") return fail(502, "Couldn't send your report. Try again.");
  await auth.supabase.rpc("forget_phone_verdict", { p_number: body.number });
  return Response.json({ ok: true });
}
