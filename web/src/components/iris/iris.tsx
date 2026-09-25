"use client";

import { useEffect, useId, useRef } from "react";
import { animate, createTimeline, stagger } from "animejs";

export type IrisState = "idle" | "scanning" | "safe" | "danger";

const RINGS = [
  { r: 70, n: 28, dot: 2.8 },
  { r: 100, n: 40, dot: 2.4 },
  { r: 130, n: 52, dot: 2.1 },
  { r: 160, n: 64, dot: 1.8 },
  { r: 188, n: 76, dot: 1.5 },
];

const PALETTE: Record<IrisState, [string, string, string]> = {
  idle: ["#6d6bff", "#a66bff", "#ff8a7a"],
  scanning: ["#8f8bff", "#c38bff", "#ffb199"],
  safe: ["#5ed3b0", "#6d9bff", "#5ed3b0"],
  danger: ["#ff5d6c", "#ff8a7a", "#ff5d6c"],
};

function point(r: number, i: number, n: number) {
  const a = (i / n) * Math.PI * 2;
  return { cx: (200 + r * Math.cos(a)).toFixed(2), cy: (200 + r * Math.sin(a)).toFixed(2) };
}

export function Iris({ state = "idle", size = 420, className }: { state?: IrisState; size?: number; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const [c1, c2, c3] = PALETTE[state];

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const fast = state === "scanning";
    const rings = Array.from(svg.querySelectorAll<SVGGElement>("[data-ring]")).map((g, i) =>
      animate(g, { rotate: i % 2 ? -360 : 360, duration: (fast ? 9000 : 42000) + i * (fast ? 1500 : 9000), loop: true, ease: "linear" }),
    );
    const dots = animate(svg.querySelectorAll("[data-dot]"), {
      opacity: [0.25, 1],
      duration: fast ? 600 : 2200,
      delay: stagger(fast ? 6 : 24, { from: "center" }),
      loop: true,
      alternate: true,
      ease: "inOutSine",
    });
    const pupil = svg.querySelector<SVGGElement>("[data-pupil]")!;
    const gaze =
      state === "idle"
        ? createTimeline({ loop: true })
            .add(pupil, { x: 14, y: -9, duration: 1300, ease: "inOutQuad" }, 900)
            .add(pupil, { x: -12, y: 7, duration: 1500, ease: "inOutQuad" }, "+=1700")
            .add(pupil, { x: 0, y: 0, duration: 1100, ease: "inOutQuad" }, "+=1400")
        : animate(pupil, {
            x: 0,
            y: 0,
            scale: fast ? [1, 0.72] : 1.12,
            duration: fast ? 700 : 900,
            ease: fast ? "inOutSine" : "outBack",
            loop: fast,
            alternate: fast,
          });
    return () => {
      rings.forEach((a) => a.revert());
      dots.revert();
      gaze.revert();
    };
  }, [state]);

  return (
    <svg ref={svgRef} viewBox="0 0 400 400" width={size} height={size} className={className} role="img" aria-label="Argus iris">
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0%" stopColor={c2} stopOpacity="0.55" style={{ transition: "stop-color 600ms" }} />
          <stop offset="100%" stopColor={c1} stopOpacity="0" style={{ transition: "stop-color 600ms" }} />
        </radialGradient>
        <linearGradient id={`${id}-dots`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c1} style={{ transition: "stop-color 600ms" }} />
          <stop offset="50%" stopColor={c2} style={{ transition: "stop-color 600ms" }} />
          <stop offset="100%" stopColor={c3} style={{ transition: "stop-color 600ms" }} />
        </linearGradient>
        <radialGradient id={`${id}-pupil`} cx="45%" cy="40%">
          <stop offset="0%" stopColor={c3} style={{ transition: "stop-color 600ms" }} />
          <stop offset="60%" stopColor={c2} style={{ transition: "stop-color 600ms" }} />
          <stop offset="100%" stopColor={c1} style={{ transition: "stop-color 600ms" }} />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="198" fill={`url(#${id}-glow)`} />
      {RINGS.map((ring, i) => (
        <g key={ring.r} data-ring style={{ transformOrigin: "200px 200px" }}>
          <circle cx="200" cy="200" r={ring.r} fill="none" stroke={`url(#${id}-dots)`} strokeOpacity={0.08} />
          {Array.from({ length: ring.n }, (_, j) => (
            <circle key={j} data-dot {...point(ring.r, j, ring.n)} r={ring.dot} fill={`url(#${id}-dots)`} opacity={0.6} />
          ))}
          {i === 2 && <circle cx="200" cy="200" r={ring.r + 6} fill="none" stroke={c2} strokeOpacity={0.25} strokeDasharray="2 10" />}
        </g>
      ))}
      <g data-pupil style={{ transformOrigin: "200px 200px" }}>
        <circle cx="200" cy="200" r="46" fill={`url(#${id}-pupil)`} />
        <circle cx="200" cy="200" r="19" fill="#070b1a" />
        <circle cx="188" cy="187" r="5" fill="white" opacity="0.85" />
      </g>
    </svg>
  );
}
