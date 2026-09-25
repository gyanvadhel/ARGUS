"use client";

import { useEffect, useId, useRef } from "react";
import { blinkClosure, pupilOffset } from "@/lib/gaze";
import { pointer, startPointerTracking } from "@/lib/pointer";
import { cn } from "@/lib/utils";

const ALMOND = "M-11 0 C-6 -8.6 6 -8.6 11 0 C6 8.6 -6 8.6 -11 0 Z";

type Entry = { root: SVGSVGElement; iris: SVGGElement; lid: SVGGElement; next: number; at: number; rect: DOMRect | null };

// Every eye on the page shares one animation loop: read all positions, then write all transforms.
const eyes = new Set<Entry>();
let frame = 0;

function tick(now: number) {
  for (const e of eyes) e.rect = e.root.getBoundingClientRect();
  const vh = window.innerHeight;
  for (const e of eyes) {
    const r = e.rect;
    if (!r || r.width === 0 || r.bottom < -40 || r.top > vh + 40) continue;
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const o = pupilOffset(c, pointer, 3.6, 260);
    e.iris.setAttribute("transform", `translate(${o.x.toFixed(2)} ${o.y.toFixed(2)})`);
    const near = Math.hypot(pointer.x - c.x, pointer.y - c.y) < Math.max(90, r.width * 1.6);
    if (e.root.dataset.near !== (near ? "1" : "0")) e.root.dataset.near = near ? "1" : "0";
    if (now > e.next) {
      e.at = now;
      e.next = now + 2400 + Math.random() * 7000;
    }
    const closure = blinkClosure((now - e.at) / 190);
    e.lid.setAttribute("transform", `scale(1 ${(1 - closure * 0.94).toFixed(3)})`);
  }
  frame = eyes.size ? requestAnimationFrame(tick) : 0;
}

export function WatchingEye({ className, strokeWidth = 1.25 }: { className?: string; strokeWidth?: number }) {
  const root = useRef<SVGSVGElement>(null);
  const iris = useRef<SVGGElement>(null);
  const lid = useRef<SVGGElement>(null);
  const clip = `${useId().replace(/[^a-zA-Z0-9-]/g, "")}-almond`;

  useEffect(() => {
    if (!root.current || !iris.current || !lid.current) return;
    startPointerTracking();
    const entry: Entry = {
      root: root.current,
      iris: iris.current,
      lid: lid.current,
      next: performance.now() + Math.random() * 6000,
      at: -1e9,
      rect: null,
    };
    eyes.add(entry);
    if (!frame) frame = requestAnimationFrame(tick);
    return () => {
      eyes.delete(entry);
    };
  }, []);

  return (
    <svg ref={root} viewBox="-12 -8 24 16" className={cn("watching-eye", className)} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <path d={ALMOND} />
        </clipPath>
      </defs>
      <g ref={lid}>
        <path d={ALMOND} className="eye-outline" strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <g clipPath={`url(#${clip})`}>
          <g ref={iris}>
            <circle r="4.3" className="eye-iris" />
            <circle r="1.7" className="eye-pupil" />
            <circle cx="-1.3" cy="-1.4" r="0.75" className="eye-glint" />
          </g>
        </g>
      </g>
    </svg>
  );
}
