import { describe, expect, it } from "vitest";
import { googleSignInUrl, packFlow, sameValue, sha256Hex, unpackFlow } from "./google-signin";

describe("googleSignInUrl", () => {
  const url = new URL(googleSignInUrl({ clientId: "abc.apps.googleusercontent.com", redirectUri: "https://argus.example/api/auth/google/callback", state: "s1", nonce: "raw-nonce" }));

  it("asks Google to post the signed-in result back to Argus's own address", () => {
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("redirect_uri")).toBe("https://argus.example/api/auth/google/callback");
    expect(url.searchParams.get("response_type")).toBe("id_token");
    expect(url.searchParams.get("response_mode")).toBe("form_post");
  });

  it("asks only for name, email and picture", () => {
    expect(url.searchParams.get("scope")).toBe("openid email profile");
  });

  it("sends Google the nonce's hash and keeps the raw nonce for Supabase", () => {
    expect(url.searchParams.get("nonce")).toBe(sha256Hex("raw-nonce"));
    expect(url.toString()).not.toContain("raw-nonce");
    expect(url.searchParams.get("state")).toBe("s1");
  });
});

describe("sha256Hex", () => {
  it("matches the standard digest", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("packFlow / unpackFlow", () => {
  it("round-trips what the callback needs", () => {
    expect(unpackFlow(packFlow({ state: "s", nonce: "n", next: "/scan" }))).toEqual({ state: "s", nonce: "n", next: "/scan" });
  });

  it("rejects anything tampered or missing", () => {
    expect(unpackFlow(undefined)).toBeNull();
    expect(unpackFlow("not-base64-json")).toBeNull();
    expect(unpackFlow(Buffer.from(JSON.stringify({ state: 1 })).toString("base64url"))).toBeNull();
  });
});

describe("sameValue", () => {
  it("compares in constant time and treats different lengths as different", () => {
    expect(sameValue("abc", "abc")).toBe(true);
    expect(sameValue("abc", "abd")).toBe(false);
    expect(sameValue("abc", "abcd")).toBe(false);
  });
});
