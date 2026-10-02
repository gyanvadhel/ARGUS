"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  Lock,
  Phone,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { PreviewResult } from "@/app/preview-actions";
import { LevelPill } from "@/components/app/level-pill";
import { cn } from "@/lib/utils";

interface EyeInnerPortalProps {
  result: PreviewResult | null;
  busy: boolean;
  onSampleSelect: (sample: string) => void;
}

export function EyeInnerPortal({ result, busy, onSampleSelect }: EyeInnerPortalProps) {
  const isOk = result?.ok === true;
  const isSafe = isOk && result.score < 30;
  const isDangerous = isOk && result.score >= 60;
  const isSuspicious = isOk && !isSafe && !isDangerous;

  return (
    <div className="relative mx-auto w-full max-w-2xl px-4 text-center">
      {/* Outer ambient glow halo */}
      <div
        className="pointer-events-none absolute -inset-6 rounded-full opacity-40 blur-3xl"
        style={{
          background: isDangerous
            ? "radial-gradient(circle, rgba(255,77,97,0.3) 0%, transparent 70%)"
            : isSafe
              ? "radial-gradient(circle, rgba(94,211,176,0.35) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(109,107,255,0.3) 0%, transparent 70%)",
        }}
      />

      <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-[#0a0a0d]/90 p-5 sm:p-7 shadow-[0_0_60px_rgba(0,0,0,0.9),0_0_20px_rgba(255,255,255,0.06)] backdrop-blur-2xl">
        {/* Top telemetry bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                  isDangerous ? "bg-rose-400" : isSafe ? "bg-emerald-400" : "bg-iris-glow",
                )}
              />
              <span
                className={cn(
                  "relative inline-flex size-2.5 rounded-full",
                  isDangerous ? "bg-rose-500" : isSafe ? "bg-emerald-500" : "bg-[#6d6bff]",
                )}
              />
            </span>
            <span className="font-mono tracking-widest text-muted-foreground uppercase text-[11px]">
              Argus Retina Telemetry
            </span>
          </div>

          {isOk && (
            <div className="flex items-center gap-2">
              <LevelPill level={result.level} score={result.score} verified={result.verified} />
              <span className="font-mono text-[11px] text-muted-foreground">
                {result.sourcesAnswered} of {result.sourceCount} sources
              </span>
            </div>
          )}
        </div>

        {/* Content based on state */}
        {busy ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <Radio className="size-6 animate-pulse text-emerald-400" />
            </div>
            <p className="mt-3 font-serif text-lg text-foreground">Evaluating threat telemetry…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Interrogating live reputation feeds, blocklists, and network traps
            </p>
          </div>
        ) : isOk ? (
          result.signedIn ? (
            /* Signed in: full breakdown inside the eye */
            <div className="mt-4 text-left">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-serif text-xl sm:text-2xl text-foreground">
                    {isSafe ? "Why this is safe" : isDangerous ? "Why this was flagged" : "Suspicious signals"}
                  </h3>
                  <p className="mt-0.5 font-mono text-xs text-foreground/75 truncate max-w-sm sm:max-w-md">
                    {result.subject}
                  </p>
                </div>
                <div className="shrink-0">
                  {isSafe ? (
                    <span className="flex size-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <ShieldCheck className="size-5" />
                    </span>
                  ) : isDangerous ? (
                    <span className="flex size-9 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <ShieldAlert className="size-5" />
                    </span>
                  ) : (
                    <span className="flex size-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <AlertTriangle className="size-5" />
                    </span>
                  )}
                </div>
              </div>

              <p className="mt-2.5 text-xs sm:text-sm text-foreground/85 leading-relaxed">
                {result.recommendation || (isSafe
                  ? "Evaluated against live carrier registry, blocklists, community reports, and threat feeds. All sources returned clean."
                  : "Caution recommended based on threat analysis.")}
              </p>

              {result.isIndianNumber && (
                <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200/90 flex gap-2.5 items-start">
                  <Info className="size-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <strong className="text-amber-300 font-medium">TRAI Regulatory Notice:</strong> In India, legitimate banks & lenders call only from official <strong>1600</strong> or <strong>140</strong> series, never personal 10-digit mobile SIMs.
                  </div>
                </div>
              )}

              {/* Signals Grid inside the Eye */}
              {result.signals && result.signals.length > 0 && (
                <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {result.signals.map((sig, idx) => {
                    const isClean = sig.status === "clean";
                    const isMal = sig.status === "malicious";
                    const isSus = sig.status === "suspicious";
                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-white/5 bg-white/[0.03] p-2.5 text-xs flex items-start gap-2"
                      >
                        {isClean ? (
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400 mt-0.5" />
                        ) : isMal ? (
                          <ShieldAlert className="size-3.5 shrink-0 text-rose-400 mt-0.5" />
                        ) : isSus ? (
                          <AlertTriangle className="size-3.5 shrink-0 text-amber-400 mt-0.5" />
                        ) : (
                          <span className="size-3.5 shrink-0 rounded-full border border-muted-foreground/40 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground/90 text-[11px] uppercase tracking-wide">
                            {sig.source}
                          </p>
                          <p className="text-muted-foreground text-[11px] leading-snug line-clamp-2">
                            {sig.summary}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs">
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
                    Open in full scanning app →
                  </Link>
                )}
                <span className="text-[11px] text-muted-foreground/60">
                  Live multi-engine threat telemetry
                </span>
              </div>
            </div>
          ) : (
            /* Signed out: holographic locked portal */
            <div className="mt-4 py-3 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-foreground shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                <Lock className="size-5 text-iris-glow" />
              </div>

              <h3 className="mt-3 font-serif text-xl sm:text-2xl text-foreground">
                Sign in to see why this is safe
              </h3>
              <p className="mx-auto mt-2 max-w-md text-xs sm:text-sm text-foreground/75 leading-relaxed">
                Argus cross-checked {result.sourceCount} threat intelligence engines (carrier registry, callback traps, blocklists, community scam reports, and IPQS feeds). Sign in with your free account to unlock verified signal telemetry inside the eye.
              </p>

              {result.sourceNames.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {result.sourceNames.map((name, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-foreground/60"
                    >
                      <CheckCircle2 className="size-3 text-emerald-400" />
                      {name}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link
                  href="/login"
                  className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-5 text-xs font-semibold text-background hover:bg-foreground/90 transition-colors"
                >
                  Sign in to view breakdown
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex h-9 items-center justify-center rounded-full border border-border px-5 text-xs font-medium text-foreground hover:bg-white/5 transition-colors"
                >
                  Create free account
                </Link>
              </div>
            </div>
          )
        ) : (
          /* Empty state: nothing scanned yet */
          <div className="py-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-foreground shadow-[0_0_25px_rgba(109,107,255,0.25)]">
              <Sparkles className="size-6 text-iris-glow" />
            </div>

            <h3 className="mt-3 font-serif text-xl text-foreground">
              Inside the Watcher&apos;s Eye
            </h3>
            <p className="mx-auto mt-1.5 max-w-sm text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Scroll back up to paste any number, link, or message. Or test a live sample to watch telemetry unfold inside the pupil:
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => onSampleSelect("+91 80-78153147")}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground/80 hover:border-emerald-400/50 hover:bg-white/10 transition-colors"
              >
                <Phone className="size-3 text-emerald-400" />
                <span>+91 80-78153147</span>
              </button>
              <button
                type="button"
                onClick={() => onSampleSelect("http://paypal-security-alert.net/verify-account")}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground/80 hover:border-rose-400/50 hover:bg-white/10 transition-colors"
              >
                <ExternalLink className="size-3 text-rose-400" />
                <span>Phishing Link</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onSampleSelect(
                    "URGENT: your bank account is suspended. Verify your identity within 24 hours at bit.ly/secure-verify",
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground/80 hover:border-amber-400/50 hover:bg-white/10 transition-colors"
              >
                <AlertTriangle className="size-3 text-amber-400" />
                <span>Scam SMS</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
