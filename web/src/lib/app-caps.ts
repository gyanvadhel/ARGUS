import "server-only";
import type { ServerSupabase } from "@/lib/app-auth";
import { appLimitKey } from "@/lib/rate-limit";

// Daily caps per account, so one phone can't use up the free services everyone shares.
export const APP_CAPS = { scan: 500, handoff: 20, invite: 20 } as const;
export type CapName = keyof typeof APP_CAPS;

export const CAP_MESSAGES: Record<CapName, string> = {
  scan: "You've reached today's limit of 500 checks. Try again tomorrow.",
  handoff: "That's a lot of website sign-ins today. Sign in on the website instead.",
  invite: "That's a lot of invites today. Try again tomorrow.",
};

const SECRET = process.env.RATE_LIMIT_SECRET || process.env.GMAIL_TOKEN_KEY || "argus-preview";

/** True when this account may do one more of these today. If counting fails, it's allowed rather than blocking people. */
export async function withinCap(supabase: ServerSupabase, cap: CapName, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("take_check_slot", {
    p_key: appLimitKey(cap, userId, SECRET),
    p_limit: APP_CAPS[cap],
    p_window_seconds: 86_400,
  });
  return error ? true : data !== false;
}
