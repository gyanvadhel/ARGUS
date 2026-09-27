import { describe, expect, it } from "vitest";
import { WARM_EVERY_MS, shouldWarm } from "./warm";

describe("shouldWarm", () => {
  it("wakes the engine on a first visit", () => {
    expect(shouldWarm(null, 1_000_000)).toBe(true);
  });

  it("doesn't ping again while the engine is surely still awake", () => {
    expect(shouldWarm(1_000_000, 1_000_000 + WARM_EVERY_MS - 1)).toBe(false);
  });

  it("pings again once it may have gone back to sleep", () => {
    expect(shouldWarm(1_000_000, 1_000_000 + WARM_EVERY_MS)).toBe(true);
  });

  it("treats a garbled stored time as never pinged", () => {
    expect(shouldWarm(Number.NaN, 5)).toBe(true);
  });
});
