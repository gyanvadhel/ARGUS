import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthUrl,
  exchangeCode,
  GMAIL_SCOPE,
  GmailAccessRevoked,
  listRecent,
  refreshAccessToken,
  senderName,
  toMeta,
  toRawEmail,
} from "./gmail";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const creds = { clientId: "client.apps.googleusercontent.com", clientSecret: "secret", redirectUri: "http://localhost:3000/api/gmail/callback" };

afterEach(() => vi.unstubAllGlobals());

describe("buildAuthUrl", () => {
  it("asks for read-only Gmail access that keeps working after the tab closes", () => {
    const url = new URL(buildAuthUrl(creds, "state-123"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe(GMAIL_SCOPE);
    expect(GMAIL_SCOPE).toBe("https://www.googleapis.com/auth/gmail.readonly");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("redirect_uri")).toBe(creds.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});

const MESSAGE = {
  id: "m1",
  snippet: "Your receipt from PayPal &amp; more",
  internalDate: String(Date.parse("2026-09-24T10:00:00Z")),
  payload: {
    mimeType: "multipart/mixed",
    headers: [
      { name: "From", value: "PayPal <service@paypal.com>" },
      { name: "To", value: "you@gmail.com" },
      { name: "Subject", value: "Your receipt" },
      { name: "Authentication-Results", value: "mx.google.com; spf=pass smtp.mailfrom=paypal.com; dkim=pass header.i=@paypal.com; dmarc=pass" },
      { name: "Received", value: "from mail.paypal.com by mx.google.com" },
      { name: "Content-Type", value: "multipart/mixed; boundary=xyz" },
    ],
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: b64url("You sent $20.00 to Alice.") } },
          { mimeType: "text/html", body: { data: b64url('<p>You sent <a href="https://www.paypal.com/activity">$20.00</a></p>') } },
        ],
      },
      { mimeType: "application/pdf", filename: "receipt.pdf", body: { attachmentId: "att1", size: 90000 } },
    ],
  },
};

describe("toRawEmail", () => {
  const raw = toRawEmail(MESSAGE);
  it("keeps the headers Argus judges the sender by", () => {
    expect(raw).toContain("From: PayPal <service@paypal.com>");
    expect(raw).toContain("Subject: Your receipt");
    expect(raw).toContain("Authentication-Results: mx.google.com; spf=pass");
  });
  it("carries the text and HTML bodies, with their links, but not attachments", () => {
    expect(raw).toContain("You sent $20.00 to Alice.");
    expect(raw).toContain("https://www.paypal.com/activity");
    expect(raw).not.toContain("att1");
    expect(raw).not.toContain("boundary=xyz");
  });
  it("stays well under the engine's size limit even for huge emails", () => {
    const huge = structuredClone(MESSAGE);
    huge.payload.parts[0].parts![0].body!.data = b64url("x".repeat(500_000));
    expect(toRawEmail(huge).length).toBeLessThan(90_000);
  });
});

describe("toMeta", () => {
  it("pulls out who it's from, the subject and when", () => {
    expect(toMeta(MESSAGE)).toEqual({
      id: "m1",
      from: "PayPal <service@paypal.com>",
      subject: "Your receipt",
      date: "2026-09-24T10:00:00.000Z",
      snippet: "Your receipt from PayPal & more",
    });
  });
  it("shows the display name, or the address when there's no name", () => {
    expect(senderName("PayPal <service@paypal.com>")).toBe("PayPal");
    expect(senderName('"Chase Bank" <alerts@chase.com>')).toBe("Chase Bank");
    expect(senderName("alerts@chase.com")).toBe("alerts@chase.com");
  });
});

describe("Google calls", () => {
  it("exchanges the sign-in code for tokens", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ access_token: "at", refresh_token: "rt", expires_in: 3599 }));
    vi.stubGlobal("fetch", fetch);
    const tokens = await exchangeCode(creds, "the-code");
    expect(tokens.refresh_token).toBe("rt");
    const body = String(fetch.mock.calls[0][1].body);
    expect(body).toContain("code=the-code");
    expect(body).toContain("grant_type=authorization_code");
  });
  it("reports revoked access so the app can ask to reconnect", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "invalid_grant" }, { status: 400 })));
    await expect(refreshAccessToken(creds, "rt")).rejects.toBeInstanceOf(GmailAccessRevoked);
  });
  it("lists the latest inbox messages with their headers", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ messages: [{ id: "m1" }] }))
      .mockResolvedValueOnce(Response.json(MESSAGE));
    vi.stubGlobal("fetch", fetch);
    const list = await listRecent("at", 5);
    expect(list.map((m) => m.subject)).toEqual(["Your receipt"]);
    expect(String(fetch.mock.calls[0][0])).toContain("labelIds=INBOX");
    expect(fetch.mock.calls[0][1].headers.authorization).toBe("Bearer at");
  });
});
