import { describe, expect, it } from "vitest";
import { blinkClosure, gazeAngles, pupilOffset } from "./gaze";

const rect = { left: 100, top: 100, width: 200, height: 200 }; // centre (200, 200)

describe("gazeAngles", () => {
  it("looks straight ahead when the cursor is on the eye", () => {
    expect(gazeAngles(rect, { x: 200, y: 200 })).toEqual({ yaw: 0, pitch: 0 });
  });
  it("turns right and down toward a cursor below-right", () => {
    const { yaw, pitch } = gazeAngles(rect, { x: 300, y: 270 }, 700);
    expect(yaw).toBeCloseTo(Math.atan2(100, 700));
    expect(pitch).toBeCloseTo(Math.atan2(70, 700));
  });
  it("never rolls further than the limit", () => {
    const { yaw, pitch } = gazeAngles(rect, { x: -5000, y: 9000 }, 700, 0.6);
    expect(yaw).toBe(-0.6);
    expect(pitch).toBe(0.6);
  });
});

describe("pupilOffset", () => {
  it("stays centred when the cursor is on the eye", () => {
    expect(pupilOffset({ x: 10, y: 10 }, { x: 10, y: 10 }, 4)).toEqual({ x: 0, y: 0 });
  });
  it("moves proportionally for a nearby cursor", () => {
    const o = pupilOffset({ x: 0, y: 0 }, { x: 60, y: 0 }, 4, 240);
    expect(o.x).toBeCloseTo(1);
    expect(o.y).toBeCloseTo(0);
  });
  it("caps at the maximum offset for a distant cursor", () => {
    const o = pupilOffset({ x: 0, y: 0 }, { x: 3000, y: 4000 }, 4, 240);
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(4);
  });
});

describe("blinkClosure", () => {
  it("is open before and after a blink and shut in the middle", () => {
    expect(blinkClosure(-1)).toBe(0);
    expect(blinkClosure(0)).toBe(0);
    expect(blinkClosure(0.5)).toBeCloseTo(1);
    expect(blinkClosure(1)).toBeCloseTo(0);
    expect(blinkClosure(2)).toBe(0);
  });
});
