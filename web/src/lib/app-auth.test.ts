import { describe, expect, it } from "vitest";
import { bearerToken } from "./app-auth";

describe("bearerToken", () => {
  it("reads the access token the app sends", () => {
    expect(bearerToken("Bearer eyJhbGciOi.payload.sig")).toBe("eyJhbGciOi.payload.sig");
    expect(bearerToken("bearer abc-123_~+/=")).toBe("abc-123_~+/=");
  });
  it("refuses anything else", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerToken("Bearer two words")).toBeNull();
  });
});
