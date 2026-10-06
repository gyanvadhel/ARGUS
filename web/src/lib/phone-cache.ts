import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Verdict } from "@/lib/types";

/** The shared 24-hour phone verdict cache. Only the server may read or write it (with the secret key), so nobody can
 *  plant a verdict that every other Argus user would then be shown. Without the key there is simply no cache. */
export type PhoneCache = {
  get: (e164: string) => Promise<Verdict | null>;
  put: (e164: string, verdict: Verdict) => Promise<void>;
  forget: (e164: string) => Promise<void>;
};

let admin: SupabaseClient | null | undefined;

function adminClient(): SupabaseClient | null {
  if (admin === undefined) {
    const secret = process.env.SUPABASE_SECRET_KEY;
    admin = secret
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  }
  return admin;
}

export const phoneCache: PhoneCache = {
  async get(e164) {
    const client = adminClient();
    if (!client) return null;
    const { data } = await client.rpc("get_phone_verdict", { p_number: e164 });
    return (data as Verdict | null) ?? null;
  },
  async put(e164, verdict) {
    await adminClient()?.rpc("put_phone_verdict", { p_number: e164, p_verdict: verdict });
  },
  async forget(e164) {
    await adminClient()?.rpc("forget_phone_verdict", { p_number: e164 });
  },
};
