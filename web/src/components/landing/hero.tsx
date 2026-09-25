"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { previewScan, type PreviewResult } from "@/app/preview-actions";
import { LevelPill } from "@/components/app/level-pill";
import { Eye, type EyeMood } from "@/components/eye/eye";
import { WatchingEye } from "@/components/eye/watching-eye";
import { ReactiveWord } from "@/components/fx/reactive-word";
import { detectKind } from "@/lib/detect";
import type { ScanKind } from "@/lib/types";

const SAMPLES = [
  { label: "a phishing link", value: "http://paypal-security-alert.net/verify-account" },
  { label: "a scam text", value: "URGENT: your bank account is suspended. Verify your identity within 24 hours at bit.ly/secure-verify or you will be arrested." },
  { label: "a fake number", value: "+999 123 4567" },
];

const READS_AS: Record<ScanKind, string> = {
  url: "a link",
  phone: "a phone number",
  email: "an email",
  text: "a message",
  file: "a file",
  call: "a call",
};

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function PreviewLine({ result }: { result: PreviewResult }) {
  if (!result.ok) return <span className="text-risk-high">{result.error}</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <LevelPill level={result.level} score={result.score} verified={result.verified} />
      <span className="text-foreground/75">
        {result.threat !== "None" ? result.threat : result.verified ? "Positive evidence it's legitimate" : "Nothing suspicious found"}
      </span>
      <Link href="/signup" className="text-muted-foreground underline decoration-foreground/25 underline-offset-4 hover:text-foreground">
        See the full evidence
      </Link>
    </span>
  );
}

export function Hero() {
  const section = useRef<HTMLElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const progress = useRef(0);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const kind = detectKind(value);

  // Scroll drives the dive into the pupil: copy fades, the camera pushes in, then black.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const el = section.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
        progress.current = p;
        if (overlay.current) {
          overlay.current.style.opacity = String(1 - smooth(0.03, 0.28, p));
          overlay.current.style.transform = `translate3d(0, ${(-p * 90).toFixed(1)}px, 0)`;
          overlay.current.style.pointerEvents = p > 0.2 ? "none" : "";
        }
        if (shade.current) shade.current.style.opacity = String(smooth(0.7, 0.95, p));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const dive = useCallback(() => progress.current, []);
  // While you type, the eye reads along the field.
  const target = useCallback(() => {
    const el = field.current;
    if (!focused || !el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(r.width - 30, 12 + value.length * 10.5), y: r.top + r.height / 2 };
  }, [focused, value]);

  async function run(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await previewScan(text));
    } catch {
      setResult({ ok: false, error: "The check didn't finish. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const mood: EyeMood = busy
    ? "scanning"
    : result?.ok
      ? result.score >= 60 ? "danger" : result.score < 30 ? "safe" : "watching"
      : focused ? "watching" : "idle";

  return (
    <section ref={section} className="relative h-[210vh]" aria-label="Argus">
      <div className="sticky top-0 h-dvh overflow-hidden">
        <Eye mood={mood} dive={dive} target={target} distance={6.8} offsetY={0.6} className="absolute inset-0" />

        <div ref={overlay} className="absolute inset-0 flex flex-col justify-between px-6 pt-28 sm:px-10">
          <div className="mx-auto flex w-full max-w-[1600px] items-start justify-between gap-10">
            <div className="max-w-sm">
              <p className="font-serif text-3xl leading-tight">The watcher that never sleeps.</p>
              <p className="mt-4 text-[15px] leading-relaxed text-foreground/70">
                Argus checks links, files, emails, texts and phone numbers against real threat intelligence, then tells you in
                plain words whether it&apos;s safe.
              </p>
            </div>
            <p className="hidden text-right text-sm leading-relaxed text-muted-foreground md:block">
              Move your cursor.
              <br />
              It&apos;s watching.
            </p>
          </div>

          <div>
            {/* The line of sight: you write on a single hairline the eye is watching. */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(value);
              }}
              data-busy={busy ? "1" : "0"}
              aria-busy={busy}
              className="mx-auto w-full max-w-3xl"
            >
              <div className="sight relative flex items-end gap-4 pb-2.5">
                <WatchingEye className="mb-3.5 h-4 w-7 shrink-0" strokeWidth={1.3} />
                <input
                  ref={field}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (result) setResult(null);
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="Paste a link, a message or a phone number"
                  aria-label="Something to check"
                  className="h-12 min-w-0 flex-1 bg-transparent text-[clamp(1.05rem,1.5vw,1.35rem)] outline-none placeholder:text-muted-foreground/80"
                />
                <button type="submit" disabled={busy} className="font-display sight-go shrink-0 pb-1.5 text-[2.35rem] disabled:opacity-50">
                  Check
                </button>
                <span className="sight-rule" aria-hidden />
                <span className="sight-draw" aria-hidden />
                <span className="sight-scan" aria-hidden />
              </div>
              <div className="mt-3 flex min-h-7 flex-wrap items-center justify-between gap-x-8 gap-y-2 text-sm" aria-live="polite">
                {result ? (
                  <PreviewLine result={result} />
                ) : (
                  <>
                    <span className="text-muted-foreground">
                      {busy ? "Checking live threat feeds and the page itself" : kind ? `Reads as ${READS_AS[kind]}` : "Links, texts, emails or phone numbers"}
                    </span>
                    <span className="text-muted-foreground">
                      Try{" "}
                      {SAMPLES.map((s, i) => (
                        <Fragment key={s.label}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setValue(s.value);
                              void run(s.value);
                            }}
                            className="text-foreground/80 underline decoration-foreground/25 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground disabled:opacity-50"
                          >
                            {s.label}
                          </button>
                          {i < SAMPLES.length - 2 ? ", " : i === SAMPLES.length - 2 ? " or " : ""}
                        </Fragment>
                      ))}
                    </span>
                  </>
                )}
              </div>
            </form>

            <h1 className="font-display pointer-events-none mt-4 select-none text-center text-[27vw] leading-[0.74] text-foreground [transform:translateY(16%)]">
              <ReactiveWord text="ARGUS" />
            </h1>
          </div>
        </div>

        <div ref={shade} className="pointer-events-none absolute inset-0 bg-background opacity-0" />
      </div>
    </section>
  );
}
