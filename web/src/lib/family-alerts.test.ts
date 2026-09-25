import { describe, expect, it } from "vitest";
import { composeAlert, planAlerts } from "./family-alerts";

describe("composeAlert", () => {
  it("tells family about a dangerous link without making it clickable", () => {
    const text = composeAlert(
      { kind: "scan", scanKind: "url", subject: "http://paypal-security-alert.net/verify", score: 99, label: "High risk", threat: "Phishing" },
      "Gyan",
    );
    expect(text).toContain("Gyan");
    expect(text).toContain("99");
    expect(text).toContain("paypal-security-alert[.]net");
    expect(text).not.toContain("http");
  });
  it("never forwards what someone's messages or emails said", () => {
    const text = composeAlert(
      { kind: "scan", scanKind: "text", subject: "Your OTP is 482913, share it with the agent", score: 91, label: "High risk", threat: "Fraud / Scam" },
      "Gyan",
    );
    expect(text).not.toContain("482913");
    expect(text).toContain("message");
  });
  it("says a call is happening right now, and when it was only a demo", () => {
    const text = composeAlert(
      { kind: "call", number: "+1 877-556-9255", score: 90, label: "Likely scam", reason: "25 complaints to the FCC", simulated: true },
      "Gyan",
    );
    expect(text).toContain("+1 877-556-9255");
    expect(text).toContain("right now");
    expect(text).toMatch(/simulated/i);
  });
});

describe("planAlerts", () => {
  const contacts = [
    { id: "a", notify_high_risk: true, telegram_chat_id: 1 },
    { id: "b", notify_high_risk: false, telegram_chat_id: 2 },
    { id: "c", notify_high_risk: true, telegram_chat_id: null },
  ];
  const now = new Date("2026-09-25T12:00:00Z");
  it("alerts only contacts who are connected and have alerts on", () => {
    expect(planAlerts(contacts, [], "x", now)).toEqual([{ contactId: "a", chatId: 1 }]);
  });
  it("doesn't repeat the same alert within ten minutes", () => {
    expect(planAlerts(contacts, [{ subject: "x", created_at: "2026-09-25T11:55:00Z" }], "x", now)).toEqual([]);
    expect(planAlerts(contacts, [{ subject: "x", created_at: "2026-09-25T11:45:00Z" }], "x", now)).toHaveLength(1);
  });
});
