import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

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
