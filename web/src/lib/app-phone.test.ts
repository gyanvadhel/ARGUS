import { describe, expect, it } from "vitest";
import { cleanNumber, parsePhoneQuery, parseReportBody } from "./app-phone";

describe("cleanNumber", () => {
  it("keeps international numbers", () => {
    expect(cleanNumber("+91 98765-43210")).toBe("+919876543210");
    expect(cleanNumber("0091 98765 43210")).toBe("+919876543210");
  });
  it("adds the country code from the SIM for national numbers", () => {
    expect(cleanNumber("098765 43210", "IN")).toBe("+919876543210");
    expect(cleanNumber("9876543210", "in")).toBe("+919876543210");
    expect(cleanNumber("919876543210", "IN")).toBe("+919876543210");
    // An Indian mobile can itself start with 91.
    expect(cleanNumber("9123456789", "IN")).toBe("+919123456789");
    expect(cleanNumber("(415) 555-0100", "US")).toBe("+14155550100");
    expect(cleanNumber("1 415 555 0100", "US")).toBe("+14155550100");
  });
  it("refuses numbers it can't place", () => {
    expect(cleanNumber("9876543210")).toBeNull();
    expect(cleanNumber("9876543210", "ZZ")).toBeNull();
    expect(cleanNumber("12345", "IN")).toBeNull();
    expect(cleanNumber("")).toBeNull();
    expect(cleanNumber("unknown", "IN")).toBeNull();
    expect(cleanNumber("+0123456789")).toBeNull();
  });
});

describe("parsePhoneQuery", () => {
  it("reads number, country and call", () => {
    expect(parsePhoneQuery(new URL("https://x/api/app/phone?number=%2B919876543210&call=1"))).toEqual({
      number: "+919876543210",
      call: true,
    });
    expect(parsePhoneQuery(new URL("https://x/api/app/phone?number=9876543210&country=IN"))).toEqual({
      number: "+919876543210",
      call: false,
    });
  });
  it("errors on a bad number", () => {
    expect("error" in parsePhoneQuery(new URL("https://x/api/app/phone?number=abc"))).toBe(true);
    expect("error" in parsePhoneQuery(new URL("https://x/api/app/phone"))).toBe(true);
  });
});

describe("parseReportBody", () => {
  it("needs a number it can read", () => {
    expect("error" in parseReportBody({})).toBe(true);
    expect("error" in parseReportBody(null)).toBe(true);
    expect("error" in parseReportBody({ number: 42 })).toBe(true);
    expect(parseReportBody({ number: "+919876543210" })).toEqual({ number: "+919876543210" });
    expect(parseReportBody({ number: "09876543210", country: "IN" })).toEqual({ number: "+919876543210" });
  });
});
