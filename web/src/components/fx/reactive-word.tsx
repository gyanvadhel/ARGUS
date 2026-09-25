"use client";

import { useEffect, useRef } from "react";
import { pointer, startPointerTracking } from "@/lib/pointer";
import { cn } from "@/lib/utils";

/**
 * A word whose letters widen as the cursor comes near, using Archivo's width axis:
 * the type leans in to look at you, the same way the eye does.
 */
export function ReactiveWord({ text, className, reach = 460 }: { text: string; className?: string; reach?: number }) {
  const letters = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    startPointerTracking();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const current = letters.current.map(() => 62);
    let raf = 0;
    const loop = () => {
      const rects = letters.current.map((el) => el?.getBoundingClientRect() ?? null);
      letters.current.forEach((el, i) => {
        const r = rects[i];
        if (!el || !r) return;
        const d = Math.hypot(pointer.x - (r.left + r.width / 2), (pointer.y - (r.top + r.height / 2)) * 0.55);
        const k = Math.max(0, 1 - d / reach);
        const want = 62 + k * k * 58;
        current[i] += (want - current[i]) * 0.12;
        el.style.fontStretch = `${current[i].toFixed(1)}%`;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reach]);

  return (
    <span className={cn("inline-flex", className)} aria-label={text}>
      {text.split("").map((ch, i) => (
        <span key={i} ref={(el) => { letters.current[i] = el; }} aria-hidden style={{ fontStretch: "62%" }}>
          {ch}
        </span>
      ))}
    </span>
  );
}
