import { afterEach, describe, expect, it, vi } from "vitest";
import { botUsername, clearBotCache, findStart, newLinkCode, sendMessage, startLink } from "./telegram";

afterEach(() => {
  vi.unstubAllGlobals();
  clearBotCache();
});

describe("linking a trusted contact", () => {
  it("builds a t.me link that starts the bot with a one-time code", () => {
    expect(startLink("argus_alerts_bot", "abc_123")).toBe("https://t.me/argus_alerts_bot?start=abc_123");
  });
  it("makes unguessable codes that Telegram accepts", () => {
    const a = newLinkCode();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newLinkCode()).not.toBe(a);
  });
  it("finds the contact who pressed Start with their code", () => {
    const updates = [
      { update_id: 1, message: { text: "/start someone-else", chat: { id: 11, first_name: "Other" } } },
      { update_id: 2, message: { text: "hello", chat: { id: 12, first_name: "Chatty" } } },
      { update_id: 3, message: { text: "/start CODE123", chat: { id: 42, first_name: "Asha", username: "asha_k" } } },
    ];
    expect(findStart(updates, "CODE123")).toEqual({ chatId: 42, name: "@asha_k", updateId: 3 });
    expect(findStart(updates, "nope")).toBeNull();
  });
});

describe("talking to Telegram", () => {
  it("sends a message to a chat", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, result: {} }));
    vi.stubGlobal("fetch", fetch);
    expect(await sendMessage("TOKEN", 42, "hi")).toBe(true);
    expect(String(fetch.mock.calls[0][0])).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ chat_id: 42, text: "hi" });
  });
  it("reports a contact who blocked the bot as not delivered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }, { status: 403 })),
    );
    expect(await sendMessage("TOKEN", 42, "hi")).toBe(false);
  });
  it("looks up the bot's username once", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, result: { username: "argus_alerts_bot" } }));
    vi.stubGlobal("fetch", fetch);
    expect(await botUsername("TOKEN")).toBe("argus_alerts_bot");
    await botUsername("TOKEN");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
