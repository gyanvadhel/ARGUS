"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { STATUS_META } from "@/lib/format";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

const DETAIL_KEYS: [string, string][] = [
  ["sha256", "SHA-256"],
  ["domain", "Domain"],
  ["registered", "Registered"],
  ["carrier", "Carrier"],
  ["line_type", "Line type"],
  ["country", "Country"],
  ["e164", "Number"],
  ["label", "Model label"],
];

function EvidenceList({ evidence }: { evidence: Record<string, unknown> }) {
  const items: React.ReactNode[] = [];
  const reasons = evidence.reasons as string[] | undefined;
  const matches = evidence.matches as Record<string, unknown>[] | undefined;
  const nested = evidence.signals as Signal[] | undefined;

  if (reasons?.length) items.push(...reasons.map((r) => <li key={r}>{r}</li>));
  if (matches?.length)
    items.push(
      ...matches.map((m, i) => (
        <li key={`m${i}`}>
          {String(m.why ?? m.notes ?? m.indicator ?? JSON.stringify(m))}
          {m.phrase ? <span className="text-foreground/60"> (“{String(m.phrase)}”)</span> : null}
        </li>
      )),
    );
  if (nested?.length)
    items.push(
      ...nested.map((s) => (
        <li key={s.source}>
          <span style={{ color: STATUS_META[s.status].color }}>{s.source}:</span> {s.summary}
        </li>
      )),
    );
  for (const [key, label] of DETAIL_KEYS) {
    if (evidence[key] != null)
      items.push(
        <li key={key}>
          <span className="text-foreground/60">{label}:</span> <span className="break-all font-mono">{String(evidence[key])}</span>
        </li>,
      );
  }
  if (!items.length) return null;
  return <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">{items}</ul>;
}

export function SignalCard({ signal, visible = false }: { signal: Signal; visible?: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[signal.status];
  const muted = ["unknown", "unavailable", "error"].includes(signal.status);
  const hasDetails = Object.keys(signal.evidence).some((k) => k !== "threat_type" && k !== "subject");
  return (
    <div data-signal className={cn("rounded-2xl border border-border/70 p-4", !visible && "opacity-0", muted ? "bg-transparent" : "glass")}>
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        aria-expanded={hasDetails ? open : undefined}
        className="flex w-full items-start gap-3 text-left"
      >
        <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: meta.color, boxShadow: muted ? "none" : `0 0 12px ${meta.color}` }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn("truncate text-sm font-medium", muted && "text-muted-foreground")}>{signal.source}</p>
            {signal.authoritative && signal.status === "malicious" && (
              <ShieldCheck className="size-3.5 shrink-0 text-risk-high" aria-label="Authoritative source" />
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{signal.summary}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ color: meta.color, backgroundColor: `color-mix(in oklab, ${meta.color} 12%, transparent)` }}
        >
          {meta.label}
        </span>
        {hasDetails && <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />}
      </button>
      {open && <EvidenceList evidence={signal.evidence} />}
    </div>
  );
}
