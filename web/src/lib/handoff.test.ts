import { describe, expect, it } from "vitest";
import { handoffUrl } from "./handoff";

describe("handoffUrl", () => {
  it("links to the confirm route with the one-time token and where to land", () => {
    const url = new URL(handoffUrl("https://askargus.app", "abc123", "/history?kind=url"));
    expect(url.origin + url.pathname).toBe("https://askargus.app/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBe("abc123");
    expect(url.searchParams.get("type")).toBe("magiclink");
    expect(url.searchParams.get("next")).toBe("/history?kind=url");
  });
  it("never lands anywhere off the site", () => {
    expect(new URL(handoffUrl("https://askargus.app", "t", "https://evil.example")).searchParams.get("next")).toBe("/dashboard");
    expect(new URL(handoffUrl("https://askargus.app", "t", "//evil.example")).searchParams.get("next")).toBe("/dashboard");
  });
});
