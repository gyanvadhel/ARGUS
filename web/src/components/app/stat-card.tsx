"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";

export function StatCard({ label, value, tone, hint }: { label: string; value: number; tone: string; hint?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const counter = { v: 0 };
    const a = animate(counter, {
      v: value,
      duration: 1200,
      ease: "outExpo",
      onUpdate: () => {
        if (ref.current) ref.current.textContent = Math.round(counter.v).toLocaleString();
      },
    });
    return () => { a.pause(); };
  }, [value]);
  return (
    <div className="glass rounded-3xl p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-4 font-serif text-5xl tabular-nums leading-none" style={{ color: tone }}>
        <span ref={ref}>{value.toLocaleString()}</span>
      </p>
      {hint && <p className="mt-3 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
