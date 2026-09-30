import { describe, expect, it } from "vitest";
import { loginNext, safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/scan")).toBe("/scan");
    expect(safeNext("/history?kind=url")).toBe("/history?kind=url");
  });
  it.each(["//evil.example", "/\\evil.example", "/\\/evil.example", "https://evil.example", "evil", "", null])(
    "rejects off-site or odd targets: %s",
    (value) => {
      expect(safeNext(value)).toBe("/dashboard");
    },
  );
});

describe("loginNext", () => {
  it("brings you back to what you were opening, including what was shared to Argus", () => {
    expect(loginNext("/scan", "?input=call+now&run=1")).toBe("/scan?input=call+now&run=1");
    expect(loginNext("/history", "")).toBe("/history");
  });
  it("drops a query too long to carry through sign-in", () => {
    expect(loginNext("/scan", `?input=${"x".repeat(3000)}`)).toBe("/scan");
  });
});
