"use client";

import { useEffect, useRef } from "react";
import { blinkClosure } from "@/lib/gaze";
import { pointer, startPointerTracking } from "@/lib/pointer";

const ALMOND = "M-11 0 C-6 -8.2 6 -8.2 11 0 C6 8.2 -6 8.2 -11 0 Z";
const CLICKABLE = "a, button, [role='button'], [role='radio'], [data-attention], select, summary, label[for]";
const TYPEABLE = "input, textarea, [contenteditable='true']";
const PAD = 7;

/**
 * A small eye that looks where you're heading and blinks when you click. Over anything clickable it turns
 * into four corner brackets that lock onto the element, like Argus fixing its gaze on it. Fine pointers only.
 */
export function Cursor() {
  const eye = useRef<HTMLDivElement>(null);
  const iris = useRef<SVGGElement>(null);
  const lid = useRef<SVGGElement>(null);
  const lock = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    startPointerTracking();
    const root = document.documentElement;
    root.classList.add("has-cursor");

    let target: Element | null = null;
    let typing = false;
    let away = false;
    let lastX = pointer.x;
    let lastY = pointer.y;
    let lookX = 0;
    let lookY = 0;
    let blinkAt = -1e9;
    let nextIdleBlink = performance.now() + 3000;
    const box = { x: pointer.x - 12, y: pointer.y - 12, w: 24, h: 24 };
    let raf = 0;

    const onOver = (e: PointerEvent) => {
      away = false;
      const el = e.target instanceof Element ? e.target : null;
      typing = !!el?.closest(TYPEABLE);
      const hit = typing ? null : el?.closest(CLICKABLE) ?? null;
      // Very large clickable areas (whole cards, full-width bars) keep the eye instead of a giant frame.
      const r = hit?.getBoundingClientRect();
      target = r && r.width * r.height < window.innerWidth * window.innerHeight * 0.25 ? hit : null;
    };
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) away = true;
    };
    const onDown = () => {
      blinkAt = performance.now();
    };
    window.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("pointerout", onOut, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });

    const loop = (now: number) => {
      // Look toward where the cursor is heading, easing back to centre when it rests.
      const vx = pointer.x - lastX;
      const vy = pointer.y - lastY;
      lastX = pointer.x;
      lastY = pointer.y;
      const len = Math.hypot(vx, vy);
      const reach = Math.min(1, len / 14);
      lookX += ((len > 0.4 ? (vx / len) * reach : 0) - lookX) * 0.16;
      lookY += ((len > 0.4 ? (vy / len) * reach : 0) - lookY) * 0.16;
      if (now > nextIdleBlink) {
        blinkAt = now;
        nextIdleBlink = now + 3500 + Math.random() * 6000;
      }

      const locked = !!target && target.isConnected && !away;
      if (eye.current) {
        eye.current.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
        const hidden = locked || typing || away ? "1" : "0";
        if (eye.current.dataset.hidden !== hidden) eye.current.dataset.hidden = hidden;
      }
      iris.current?.setAttribute("transform", `translate(${(lookX * 4.2).toFixed(2)} ${(lookY * 2.6).toFixed(2)})`);
      lid.current?.setAttribute("transform", `scale(1 ${(1 - blinkClosure((now - blinkAt) / 190) * 0.92).toFixed(3)})`);

      if (lock.current) {
        const r = locked ? target!.getBoundingClientRect() : null;
        const goal = r
          ? { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }
          : { x: pointer.x - 12, y: pointer.y - 12, w: 24, h: 24 };
        const k = r ? 0.3 : 0.45;
        box.x += (goal.x - box.x) * k;
        box.y += (goal.y - box.y) * k;
        box.w += (goal.w - box.w) * k;
        box.h += (goal.h - box.h) * k;
        const press = now - blinkAt < 160 ? 3 : 0; // brackets tighten as you click
        lock.current.style.transform = `translate3d(${(box.x + press).toFixed(1)}px, ${(box.y + press).toFixed(1)}px, 0)`;
        lock.current.style.width = `${Math.max(10, box.w - press * 2).toFixed(1)}px`;
        lock.current.style.height = `${Math.max(10, box.h - press * 2).toFixed(1)}px`;
        const on = locked ? "1" : "0";
        if (lock.current.dataset.on !== on) lock.current.dataset.on = on;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointerout", onOut);
      window.removeEventListener("pointerdown", onDown);
      root.classList.remove("has-cursor");
    };
  }, []);

  return (
    <>
      <div ref={lock} className="cursor-lock max-[1024px]:hidden" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div ref={eye} className="cursor-eye max-[1024px]:hidden" aria-hidden>
        <svg viewBox="-12.5 -9 25 18" width="26" height="18" overflow="visible">
          <defs>
            <clipPath id="argus-cursor-almond">
              <path d={ALMOND} />
            </clipPath>
          </defs>
          <g ref={lid}>
            <path d={ALMOND} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            <g clipPath="url(#argus-cursor-almond)">
              <g ref={iris}>
                <circle r="3.6" fill="currentColor" />
              </g>
            </g>
          </g>
        </svg>
      </div>
    </>
  );
}
