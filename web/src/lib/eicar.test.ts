import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eicarText } from "./eicar";

describe("eicar", () => {
  it("rebuilds the exact standard test string", () => {
    expect(createHash("sha256").update(eicarText()).digest("hex"))
      .toBe("275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f");
  });
  it("is not stored contiguously in source", () => {
    const needle = "ELIF-TSET-SURIVITNA-DRADNATS-RACIE".split("").reverse().join("");
    expect(readFileSync(new URL("./eicar.ts", import.meta.url), "utf8")).not.toContain(needle);
  });
});
