// One window-level pointer tracker shared by every watching eye, so a hundred eyes cost one listener.

export const pointer = {
  x: 0,
  y: 0,
  /** px per ms, smoothed; pupils tighten when the cursor moves fast */
  speed: 0,
  /** timestamp of the last move, used to start idle glances */
  lastMove: 0,
  /** true while the cursor is over something clickable or typeable */
  attention: false,
};

let started = false;

export function startPointerTracking() {
  if (started || typeof window === "undefined") return;
  started = true;
  pointer.x = window.innerWidth / 2;
  pointer.y = window.innerHeight * 0.4;
  let lastX = pointer.x;
  let lastY = pointer.y;
  let lastT = performance.now();
  window.addEventListener(
    "pointermove",
    (e) => {
      const now = performance.now();
      const instant = Math.hypot(e.clientX - lastX, e.clientY - lastY) / Math.max(1, now - lastT);
      pointer.speed = pointer.speed * 0.8 + instant * 0.2;
      lastX = pointer.x = e.clientX;
      lastY = pointer.y = e.clientY;
      lastT = pointer.lastMove = now;
      const el = e.target instanceof Element ? e.target : null;
      pointer.attention = !!el?.closest("a, button, input, textarea, select, [data-attention]");
    },
    { passive: true },
  );
}
