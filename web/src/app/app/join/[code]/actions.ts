"use server";

import { isInviteCode } from "@/lib/family-invite";
import { createClient } from "@/lib/supabase/server";

export type JoinResult = { ok: true; name: string } | { ok: false; error: string };

export async function joinFamily(code: string): Promise<JoinResult> {
  if (!isInviteCode(code)) return { ok: false, error: "That invite link isn't valid." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to join." };
  const { data, error } = await supabase.rpc("accept_family_invite", { p_code: code });
  if (error) return { ok: false, error: error.message };
  return { ok: true, name: (data as { inviter_name: string }[] | null)?.[0]?.inviter_name ?? "your family member" };
}
