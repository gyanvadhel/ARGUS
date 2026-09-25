// Geometry for the watching eyes: where to look, how far a pupil slides, and the blink curve.

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Yaw and pitch (radians) that turn an eye centred in `rect` toward `target` (both in client pixels).
 * The cursor is treated as a point on a plane `depthPx` in front of the screen, so gaze stays natural
 * whether the eye is huge or tiny. Positive yaw looks right, positive pitch looks down.
 */
export function gazeAngles(rect: Rect, target: Point, depthPx = 700, max = 0.62): { yaw: number; pitch: number } {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const clamp = (v: number) => Math.max(-max, Math.min(max, v));
  return { yaw: clamp(Math.atan2(target.x - cx, depthPx)), pitch: clamp(Math.atan2(target.y - cy, depthPx)) };
}

/** How far a flat pupil slides toward `target`: proportional up close, capped at `maxOffset` beyond `reach`. */
export function pupilOffset(center: Point, target: Point, maxOffset: number, reach = 240): Point {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: 0, y: 0 };
  const k = (Math.min(1, dist / reach) * maxOffset) / dist;
  return { x: dx * k, y: dy * k };
}

/** Lid closure (0 open, 1 shut) at progress `t` through a blink; outside 0..1 the eye is open. */
export function blinkClosure(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(Math.PI * t);
}
