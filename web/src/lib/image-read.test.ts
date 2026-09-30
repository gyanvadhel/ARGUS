import { describe, expect, it } from "vitest";
import { isReadableImage, tidyOcr } from "./image-read";

describe("tidyOcr", () => {
  it("drops the stray spacing and blank runs a screenshot reader leaves behind", () => {
    expect(tidyOcr("  Dear  customer,\n\n\n\nyour KYC   expires today \n  \n Call 98765 43210 \n")).toBe(
      "Dear customer,\n\nyour KYC expires today\n\nCall 98765 43210",
    );
  });
});

describe("isReadableImage", () => {
  it("reads screenshots and photos, but leaves other files to the file check", () => {
    expect(isReadableImage(new File(["x"], "shot.png", { type: "image/png" }))).toBe(true);
    expect(isReadableImage(new File(["x"], "photo.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isReadableImage(new File(["x"], "icon.svg", { type: "image/svg+xml" }))).toBe(false);
    expect(isReadableImage(new File(["x"], "invoice.pdf", { type: "application/pdf" }))).toBe(false);
  });
});
