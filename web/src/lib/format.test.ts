import { describe, expect, it } from "vitest";
import { callerVerdict, levelMeta } from "./format";

describe("levelMeta", () => {
  it("only says Safe when positive evidence verified it", () => {
    expect(levelMeta("SAFE", true).label).toBe("Safe");
    expect(levelMeta("SAFE", false).label).toBe("No red flags");
    expect(levelMeta("SAFE").label).toBe("No red flags");
  });
  it("labels risky levels the same either way", () => {
    expect(levelMeta("HIGH RISK").label).toBe("High risk");
    expect(levelMeta("HIGH RISK", true).label).toBe("High risk");
  });
  it("falls back to unverified for anything unexpected", () => {
    expect(levelMeta("SOMETHING" as never).label).toBe("Unverified");
  });
});

describe("callerVerdict", () => {
  it("never calls an unverified number safe", () => {
    expect(callerVerdict(0, "SAFE")).toBe("No red flags");
    expect(callerVerdict(0, "SAFE", true)).toBe("Looks safe");
  });
  it("keeps the risk wording for risky numbers", () => {
    expect(callerVerdict(70, "SUSPICIOUS")).toBe("Suspicious");
    expect(callerVerdict(90, "HIGH RISK")).toBe("Likely scam");
    expect(callerVerdict(0, "UNVERIFIED")).toBe("No verdict");
  });
});
