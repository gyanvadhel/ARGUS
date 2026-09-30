import { describe, expect, it } from "vitest";
import { scanPathFor, sharedInput } from "./share";

describe("sharedInput", () => {
  it("uses a shared message as it is", () => {
    expect(sharedInput({ text: "Your parcel is held. Pay Rs 25 at indiapost-help.example" })).toBe(
      "Your parcel is held. Pay Rs 25 at indiapost-help.example",
    );
  });
  it("keeps a shared link, ignoring the page title that comes with it", () => {
    expect(sharedInput({ title: "Win an iPhone!", url: "https://prize.example/claim" })).toBe("https://prize.example/claim");
    expect(sharedInput({ title: "Win an iPhone!", text: "https://prize.example/claim" })).toBe("https://prize.example/claim");
  });
  it("adds the link to the message when they come separately, without repeating it", () => {
    expect(sharedInput({ text: "Look at this", url: "https://a.example" })).toBe("Look at this\nhttps://a.example");
    expect(sharedInput({ text: "Look https://a.example", url: "https://a.example" })).toBe("Look https://a.example");
  });
  it("falls back to the title, and caps the length", () => {
    expect(sharedInput({ title: "Only a title" })).toBe("Only a title");
    expect(sharedInput({ text: "x".repeat(5000) })).toHaveLength(2000);
    expect(sharedInput({})).toBe("");
  });
});

describe("scanPathFor", () => {
  it("opens the scanner and runs the check straight away", () => {
    expect(scanPathFor("call 98765 now")).toBe("/scan?input=call+98765+now&run=1");
    expect(scanPathFor("")).toBe("/scan");
  });
});
