import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isInviteCode } from "@/lib/family-invite";

/** Who sent an invite (first name) and whether it still works. Needs no account. */
export async function inviteInfo(code: string): Promise<{ name: string | null; valid: boolean }> {
  if (!isInviteCode(code)) return { name: null, valid: false };
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.rpc("family_invite_info", { p_code: code });
  const row = (data as { inviter_name: string | null; valid: boolean }[] | null)?.[0];
  if (error || !row) return { name: null, valid: false };
  return { name: row.inviter_name, valid: row.valid };
}
