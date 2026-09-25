"use client";

import { useEffect, useRef } from "react";
import { pointer, startPointerTracking } from "@/lib/pointer";

/** A dot and a lagging ring that swells over anything clickable. Fine pointers only. */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    startPointerTracking();
    const root = document.documentElement;
    root.classList.add("has-cursor");
    let rx = pointer.x;
    let ry = pointer.y;
    let raf = 0;
    const loop = () => {
      rx += (pointer.x - rx) * 0.2;
      ry += (pointer.y - ry) * 0.2;
      if (dot.current) dot.current.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      if (ring.current) {
        ring.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
        const hover = pointer.attention ? "1" : "0";
        if (ring.current.dataset.hover !== hover) ring.current.dataset.hover = hover;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      root.classList.remove("has-cursor");
    };
  }, []);

  return (
    <>
      <div ref={ring} className="cursor-ring max-[1024px]:hidden" aria-hidden />
      <div ref={dot} className="cursor-dot max-[1024px]:hidden" aria-hidden />
    </>
  );
}
