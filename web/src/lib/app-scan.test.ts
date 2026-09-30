import { describe, expect, it } from "vitest";
import { MAX_APP_INPUT, parseScanBody, shouldSave } from "./app-scan";

describe("parseScanBody", () => {
  it("takes the text to check and how to save it", () => {
    expect(parseScanBody({ input: "  call 98765 now " })).toEqual({ input: "call 98765 now", save: "always" });
    expect(parseScanBody({ input: "hi", save: "flagged" })).toEqual({ input: "hi", save: "flagged" });
    expect(parseScanBody({ input: "hi", save: "whatever" })).toEqual({ input: "hi", save: "always" });
  });
  it("explains empty, missing and oversized input", () => {
    expect(parseScanBody({ input: "   " })).toHaveProperty("error");
    expect(parseScanBody(null)).toHaveProperty("error");
    expect(parseScanBody("text")).toHaveProperty("error");
    expect(parseScanBody({ input: "x".repeat(MAX_APP_INPUT + 1) })).toHaveProperty("error");
    expect(parseScanBody({ input: "x".repeat(MAX_APP_INPUT) })).toHaveProperty("input");
  });
});

describe("shouldSave", () => {
  it("saves checks people start, and automatic ones only when flagged", () => {
    expect(shouldSave("always", 0)).toBe(true);
    expect(shouldSave("flagged", 59)).toBe(false);
    expect(shouldSave("flagged", 60)).toBe(true);
  });
});
