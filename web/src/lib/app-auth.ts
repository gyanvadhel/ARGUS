import "server-only";
import { createClient as createSupabase, type User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** The access token from an "Authorization: Bearer …" header, or null. */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec(header?.trim() ?? "");
  return match ? match[1] : null;
}

/** Who the Android app is acting for: a Supabase client that acts as them, so row-level security applies exactly
 *  as on the website. Null when the token is missing or no longer valid. */
export async function appUser(request: Request): Promise<{ supabase: ServerSupabase; user: User } | null> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return null;
  const supabase = createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { supabase: supabase as unknown as ServerSupabase, user: data.user };
}

export const unauthorized = () => Response.json({ error: "Sign in again." }, { status: 401 });
export const fail = (status: number, error: string) => Response.json({ error }, { status });
