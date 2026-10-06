import { describe, expect, it } from "vitest";
import { composePushAlert, sendFcmPush } from "./fcm";

describe("composePushAlert", () => {
  it("never includes message text or email words in push alerts", () => {
    const alert = composePushAlert(
      {
        kind: "scan",
        scanKind: "text",
        subject: "Your secret bank PIN is 998811, wire immediately",
        score: 95,
        label: "High risk",
        threat: "Banking trojan / Phishing",
      },
      "Mom",
    );
    expect(alert.title).toContain("Mom");
    expect(alert.body).toContain("message");
    expect(alert.body).toContain("High risk");
    expect(alert.body).toContain("Banking trojan / Phishing");
    // Strictly verify private message content is absent:
    expect(alert.body).not.toContain("998811");
    expect(alert.body).not.toContain("secret bank PIN");
  });

  it("defangs URLs and never makes them clickable or exposes full secret query params", () => {
    const alert = composePushAlert(
      {
        kind: "scan",
        scanKind: "url",
        subject: "https://evil-login-phish.net/steal?token=secret123",
        score: 98,
        label: "High risk",
        threat: "Credential harvester",
      },
      "Dad",
    );
    expect(alert.body).toContain("evil-login-phish[.]net");
    expect(alert.body).not.toContain("https://");
    expect(alert.body).not.toContain("secret123");
  });

  it("includes caller number for high-risk calls", () => {
    const alert = composePushAlert(
      {
        kind: "call",
        number: "+1 800-555-0199",
        score: 92,
        label: "Likely scam",
        reason: "Robocall fraud database match",
      },
      "Grandpa",
    );
    expect(alert.body).toContain("+1 800-555-0199");
    expect(alert.body).toContain("Likely scam");
    expect(alert.body).toContain("Robocall fraud database match");
  });

  it("formats protection disabled alert accurately", () => {
    const alert = composePushAlert(
      {
        kind: "protection_disabled",
        protection: "Scam-site blocker",
      },
      "Sarah",
    );
    expect(alert.body).toContain("Scam-site blocker was turned off on their phone");
    expect(alert.body).toContain("Check in to ensure their protections stay on");
  });

  it("formats 48h device offline alert", () => {
    const alert = composePushAlert(
      {
        kind: "device_offline",
        deviceName: "Galaxy S23",
      },
      "Grandma",
    );
    expect(alert.body).toContain("Galaxy S23");
    expect(alert.body).toContain("hasn't checked in with Argus for 48 hours");
  });
});

describe("sendFcmPush", () => {
  it("gracefully returns skipped when FIREBASE_SERVICE_ACCOUNT is unset", async () => {
    const orig = process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    try {
      const res = await sendFcmPush(["test-token"], {
        title: "Test",
        body: "Test body",
      });
      expect(res.skipped).toBe(true);
      expect(res.sent).toBe(0);
    } finally {
      if (orig) process.env.FIREBASE_SERVICE_ACCOUNT = orig;
    }
  });
});
