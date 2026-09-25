"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import { KIND_META, LEVEL_META, STATUS_ORDER } from "@/lib/format";
import type { Verdict } from "@/lib/types";
import { ScoreDial } from "./score-dial";
import { SignalCard } from "./signal-card";

export function VerdictView({ verdict, actions }: { verdict: Verdict; actions?: React.ReactNode }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const meta = LEVEL_META[verdict.level] ?? LEVEL_META.UNVERIFIED;
  const Kind = KIND_META[verdict.kind];
  const signals = [...verdict.signals].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const answered = signals.filter((s) => !["unavailable", "error"].includes(s.status)).length;

  useEffect(() => {
    if (!gridRef.current) return;
    const cards = gridRef.current.querySelectorAll<HTMLElement>("[data-signal]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cards.forEach((c) => (c.style.opacity = "1"));
      return;
    }
    const a = animate(cards, {
      opacity: [0, 1],
      y: [14, 0],
      delay: stagger(70, { start: 250 }),
      duration: 600,
      ease: "outQuart",
    });
    return () => { a.complete(); };
  }, [verdict]);

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="glass relative flex flex-col items-center overflow-hidden rounded-3xl p-8 text-center">
        <div className="absolute -top-20 h-48 w-72 rounded-full blur-3xl" style={{ background: `color-mix(in oklab, ${meta.color} 22%, transparent)` }} aria-hidden />
        <ScoreDial score={verdict.score} color={meta.color} />
        <p className="relative mt-5 font-serif text-5xl" style={{ color: meta.color }}>{meta.label}</p>
        <p className="relative mt-1 text-sm text-muted-foreground">
          {verdict.threat_type !== "None" ? verdict.threat_type : "No threat detected"}
        </p>
        <div className="relative mt-6 flex max-w-full items-center gap-2 rounded-full border border-border/70 px-3 py-1.5">
          <Kind.icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-xs">{verdict.subject}</span>
        </div>
        <p className="relative mt-6 text-sm leading-relaxed text-foreground/85">{verdict.recommendation}</p>
        {actions && <div className="relative mt-6 w-full">{actions}</div>}
      </section>
      <section className="min-w-0">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-3xl">Evidence</h2>
          <p className="text-sm text-muted-foreground">{answered} of {signals.length} sources answered</p>
        </div>
        <div ref={gridRef} className="grid gap-3 xl:grid-cols-2">
          {signals.map((s) => <SignalCard key={s.source} signal={s} />)}
        </div>
      </section>
    </div>
  );
}
