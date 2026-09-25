import "server-only";
import { randomBytes } from "node:crypto";

// A Telegram bot for family alerts. Everything is outbound calls to Telegram's Bot API, so it works from a laptop:
// no public URL or webhook needed. A contact opts in by opening t.me/<bot>?start=<code> and pressing Start.

const API = "https://api.telegram.org";

export type TgUpdate = {
  update_id: number;
  message?: { text?: string; chat: { id: number; first_name?: string; username?: string } };
};

export function telegramToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function startLink(username: string, code: string): string {
  return `https://t.me/${username}?start=${code}`;
}

/** 18 random bytes as base64url: 24 characters, all ones Telegram allows in a start parameter. */
export function newLinkCode(): string {
  return randomBytes(18).toString("base64url");
}

async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<{ ok: boolean; result?: T }> {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  return (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; result?: T };
}

const usernames = new Map<string, string>();

export function clearBotCache() {
  usernames.clear();
}

/** The bot's @username, needed for the t.me link. Asked once per token. */
export async function botUsername(token: string): Promise<string> {
  const known = usernames.get(token);
  if (known) return known;
  const me = await call<{ username: string }>(token, "getMe");
  if (!me.ok || !me.result?.username) throw new Error("Telegram didn't accept the bot token.");
  usernames.set(token, me.result.username);
  return me.result.username;
}

/** Messages people have sent the bot and nobody has confirmed yet (Telegram keeps them for 24 hours). */
export async function fetchUpdates(token: string): Promise<TgUpdate[]> {
  const res = await call<TgUpdate[]>(token, "getUpdates", { limit: 100, timeout: 0, allowed_updates: ["message"] });
  return res.ok ? (res.result ?? []) : [];
}

/** Mark updates up to this one as handled, so the queue never fills up. */
export async function confirmUpdates(token: string, upTo: number): Promise<void> {
  await call(token, "getUpdates", { offset: upTo + 1, limit: 1, timeout: 0 });
}

export function findStart(updates: TgUpdate[], code: string): { chatId: number; name: string; updateId: number } | null {
  const hit = updates.find((u) => u.message?.text?.trim() === `/start ${code}`);
  if (!hit?.message) return null;
  const chat = hit.message.chat;
  return { chatId: chat.id, name: chat.username ? `@${chat.username}` : (chat.first_name ?? "Telegram user"), updateId: hit.update_id };
}

export async function sendMessage(token: string, chatId: number, text: string): Promise<boolean> {
  try {
    const res = await call(token, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
    return res.ok;
  } catch {
    return false;
  }
}
