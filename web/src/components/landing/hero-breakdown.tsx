"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, Lock, Phone, ShieldAlert, ShieldCheck, X } from "lucide-react";
import type { PreviewResult } from "@/app/preview-actions";
import { cn } from "@/lib/utils";

interface HeroBreakdownProps {
  result: Extract<PreviewResult, { ok: true }>;
  onClear: () => void;
}

export function HeroBreakdown({ result, onClear }: HeroBreakdownProps) {
  const isSafe = result.score < 30;
  const isDangerous = result.score >= 60;
  const isSuspicious = !isSafe && !isDangerous;

  if (!result.signedIn) {
    return (
      <div className="relative mt-4 w-full rounded-2xl border border-white/10 bg-[#0e0e11]/95 backdrop-blur-xl p-5 sm:p-6 shadow-2xl text-left transition-all animate-in fade-in-50 slide-in-from-top-2 duration-300">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-white/5 border border-white/10 text-foreground">
              <Lock className="size-4" />
            </span>
            <div>
              <h3 className="font-serif text-lg text-foreground">
                Sign in to see why this is safe
              </h3>
              <p className="text-xs text-muted-foreground">
                {result.sourcesAnswered} threat intelligence sources evaluated with 0 red flags
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            aria-label="Dismiss breakdown"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
          Argus evaluated this against {result.sourceCount} threat intelligence sources — including carrier verification, callback traps, blocklists, community scam reports, and live threat feeds. Sign in to unlock the verified signal breakdown and see exactly why this was cleared.
        </p>

        {result.sourceNames.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {result.sourceNames.map((name, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-foreground/70"
              >
                <CheckCircle2 className="size-3 text-emerald-400" />
                {name}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 pt-3.5 border-t border-border/50">
          <Link
            href="/login"
            className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-xs font-semibold text-background hover:bg-foreground/90 transition-colors"
          >
            Sign in to view breakdown
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-xs font-medium text-foreground hover:bg-white/5 transition-colors"
          >
            Create free account
          </Link>
        </div>
      </div>
    );
  }

  // Signed in: show full signal & reason breakdown
  return (
    <div className="relative mt-4 w-full rounded-2xl border border-white/10 bg-[#0e0e11]/95 backdrop-blur-xl p-5 sm:p-6 shadow-2xl text-left transition-all animate-in fade-in-50 slide-in-from-top-2 duration-300 max-h-[52vh] sm:max-h-[58vh] overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3.5">
        <div className="flex items-center gap-2.5">
          {isSafe ? (
            <span className="flex size-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="size-4" />
            </span>
          ) : isDangerous ? (
            <span className="flex size-8 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <ShieldAlert className="size-4" />
            </span>
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertTriangle className="size-4" />
            </span>
          )}
          <div>
            <h3 className="font-serif text-lg text-foreground">
              {isSafe ? "Why this is safe" : isDangerous ? "Why this was flagged" : "Suspicious signals"}
            </h3>
            <p className="text-xs text-muted-foreground truncate max-w-xs sm:max-w-md">
              {result.subject}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-muted-foreground">
            {result.sourcesAnswered} of {result.sourceCount} sources answered
          </span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            aria-label="Dismiss breakdown"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-3.5 text-sm text-foreground/85 leading-relaxed">
        {result.recommendation || (isSafe
          ? "All verified threat intelligence sources and integrity checks evaluated this as clean. No malicious patterns or abuse indicators detected."
          : "Exercise caution. Threat indicators were identified during scan.")}
      </div>

      {result.isIndianNumber && (
        <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200/90 flex gap-2.5 items-start">
          <Info className="size-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <strong className="text-amber-300 font-medium">TRAI & RBI Regulatory Notice:</strong> Under Indian telecom regulations, legitimate banks and financial lenders call from official <strong>1600</strong> or <strong>140</strong> series numbers, never ordinary personal 10-digit mobile numbers. If an unsolicited caller from a personal mobile SIM offers bank loans or requests KYC verification, treat with extreme caution.
          </div>
        </div>
      )}

      {result.signals && result.signals.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {result.signals.map((sig, idx) => {
            const isClean = sig.status === "clean";
            const isMal = sig.status === "malicious";
            const isSus = sig.status === "suspicious";
            return (
              <div
                key={idx}
                className="flex items-start gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] p-3 text-xs"
              >
                {isClean ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-400 mt-0.5" />
                ) : isMal ? (
                  <ShieldAlert className="size-4 shrink-0 text-rose-400 mt-0.5" />
                ) : isSus ? (
                  <AlertTriangle className="size-4 shrink-0 text-amber-400 mt-0.5" />
                ) : (
                  <span className="size-4 shrink-0 rounded-full border border-muted-foreground/40 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-foreground/90">{sig.source}</p>
                  <p className="mt-0.5 text-muted-foreground leading-normal">{sig.summary}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3 text-xs">
        {result.kind === "phone" ? (
          <Link
            href={`/caller-id?q=${encodeURIComponent(result.subject)}`}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors underline decoration-foreground/20 underline-offset-4"
          >
            <Phone className="size-3.5" /> Open in Caller ID console or report this number →
          </Link>
        ) : (
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors underline decoration-foreground/20 underline-offset-4"
          >
            Check things on your phone with the Android app →
          </Link>
        )}
        <span className="text-[11px] text-muted-foreground/70">
          Real-time multi-engine threat intelligence
        </span>
      </div>
    </div>
  );
}
