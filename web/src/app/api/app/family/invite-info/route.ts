import { inviteInfo } from "@/lib/family-invite-info";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  return Response.json(await inviteInfo(code), { headers: { "cache-control": "no-store" } });
}
