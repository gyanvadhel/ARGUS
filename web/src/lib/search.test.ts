import { describe, expect, it } from "vitest";
import { likePattern } from "./search";

describe("likePattern", () => {
  it("matches the words anywhere", () => {
    expect(likePattern("paypal")).toBe("%paypal%");
  });

  it("treats % and _ as plain characters, not wildcards", () => {
    expect(likePattern("50%_off")).toBe("%50\\%\\_off%");
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });

  it("ignores empty searches and trims long ones", () => {
    expect(likePattern("   ")).toBeNull();
    expect(likePattern(undefined)).toBeNull();
    expect(likePattern("x".repeat(300))?.length).toBe(102);
  });
});
