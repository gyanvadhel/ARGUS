import { api } from "@/lib/api";

// Pokes the free scanning engine so it starts waking up the moment someone arrives, well before they check
// anything. A sleeping engine won't answer within the short health timeout, but the request still wakes it.
export async function GET() {
  await api.health().catch(() => null);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
