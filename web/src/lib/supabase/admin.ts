import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null | undefined;

/**
 * Returns a Supabase client authenticated with the service role key (SUPABASE_SECRET_KEY).
 * Only the server may use this client for privileged operations (e.g. reading FCM tokens,
 * shared caches, or cron jobs). Returns null if the secret key is not configured.
 */
export function adminClient(): SupabaseClient | null {
  if (admin === undefined) {
    const secret = process.env.SUPABASE_SECRET_KEY;
    admin = secret
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  }
  return admin;
}
