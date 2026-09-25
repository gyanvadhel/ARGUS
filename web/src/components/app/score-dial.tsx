"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";

const R = 88;
const C = 2 * Math.PI * R;

export function ScoreDial({ score, color }: { score: number; color: string }) {
  const numberRef = useRef<HTMLSpanElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const counter = { v: 0 };
    const count = animate(counter, {
      v: score,
      duration: 1400,
      ease: "outExpo",
      onUpdate: () => {
        if (numberRef.current) numberRef.current.textContent = String(Math.round(counter.v));
      },
    });
    const arc = arcRef.current
      ? animate(arcRef.current, { strokeDashoffset: [C, C * (1 - score / 100)], duration: 1400, ease: "outExpo" })
      : null;
    return () => {
      count.pause();
      arc?.pause();
    };
  }, [score]);

  return (
    <div className="relative grid size-56 place-items-center">
      <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90">
        <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="10" />
        <circle
          ref={arcRef}
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - score / 100)}
          style={{ filter: `drop-shadow(0 0 10px ${color})` }}
        />
      </svg>
      <div className="text-center">
        <span ref={numberRef} className="font-serif text-7xl tabular-nums leading-none" style={{ color }}>
          {score}
        </span>
        <p className="mt-1 text-xs text-muted-foreground">risk out of 100</p>
      </div>
    </div>
  );
}
