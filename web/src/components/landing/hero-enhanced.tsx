"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { previewScan, type PreviewResult } from "@/app/preview-actions";
import { LevelPill } from "@/components/app/level-pill";
import { Eye, type EyeMood } from "@/components/eye/eye";
import { WatchingEye } from "@/components/eye/watching-eye";
import { ReactiveWord } from "@/components/fx/reactive-word";
import { detectKind } from "@/lib/detect";
import type { ScanKind } from "@/lib/types";
import { useMedia } from "@/lib/use-media";
import { cn } from "@/lib/utils";
import { HeroBreakdown } from "./hero-breakdown";

gsap.registerPlugin(ScrollTrigger);

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

function PreviewLine({ result, onClear }: { result: PreviewResult; onClear?: () => void }) {
  const lineRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (lineRef.current) {
      gsap.fromTo(
        lineRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }
      );
    }
  }, []);

  if (!result.ok) return <span className="text-risk-high">{result.error}</span>;
  return (
    <span ref={lineRef} className="flex flex-wrap items-center justify-between w-full gap-x-3 gap-y-1">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <LevelPill level={result.level} score={result.score} verified={result.verified} />
        <span className="text-foreground/75">
          {result.threat !== "None" ? result.threat : result.verified ? "Positive evidence it's legitimate" : "Nothing suspicious found"}
        </span>
      </span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline decoration-foreground/20 underline-offset-4"
        >
          Check another
        </button>
      )}
    </span>
  );
}

export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  const section = useRef<HTMLElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const heroTextRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const kind = detectKind(value);
  const portrait = useMedia("(max-aspect-ratio: 4/5)");
  const compact = useMedia("(max-width: 640px)");

  // GSAP scroll-driven animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section.current,
          start: "top top",
          end: "bottom top",
          scrub: 1,
          onUpdate: (self) => {
            progress.current = self.progress;
          },
        },
      });

      // Overlay fades and moves up as you scroll
      tl.to(overlay.current, {
        opacity: 0,
        y: -90,
        ease: "power2.inOut",
      }, 0);

      // Shade fades in to black
      tl.to(shade.current, {
        opacity: 1,
        ease: "power2.inOut",
      }, 0);

      // Title scales and fades
      if (titleRef.current) {
        tl.to(titleRef.current, {
          scale: 1.2,
          opacity: 0,
          ease: "power2.out",
        }, 0);
      }

      // Hero text subtle parallax
      if (heroTextRef.current) {
        tl.to(heroTextRef.current, {
          y: -40,
          opacity: 0.3,
          ease: "power1.out",
        }, 0);
      }
    });

    return () => ctx.revert();
  }, []);

  // Entrance animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(heroTextRef.current?.children || [], {
        opacity: 0,
        y: 30,
        duration: 1,
        stagger: 0.15,
        ease: "power3.out",
        delay: 0.3,
      });

      gsap.from(titleRef.current, {
        opacity: 0,
        scale: 0.9,
        duration: 1.2,
        ease: "power3.out",
        delay: 0.5,
      });

      gsap.from(".sight", {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: "power2.out",
        delay: 0.8,
      });
    });

    return () => ctx.revert();
  }, []);

  const dive = useCallback(() => progress.current, []);

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
        <Eye
          mood={mood}
          dive={dive}
          target={target}
          distance={6.8}
          offsetY={portrait ? (focused ? -0.45 : -0.1) : (result ? 0.35 : 0.6)}
          className="absolute inset-0"
        />

        <div
          ref={overlay}
          className={cn(
            "absolute inset-0 flex flex-col justify-between px-6 sm:px-10 transition-all duration-300",
            focused && compact ? "pt-14 pb-4" : "pt-24 pb-8 sm:pt-28 sm:pb-12",
          )}
        >
          <div
            ref={heroTextRef}
            className={cn(
              "mx-auto flex w-full max-w-[1600px] items-start justify-between gap-10 transition-all duration-300",
              focused && compact ? "max-h-0 opacity-0 overflow-hidden -translate-y-4 pointer-events-none pb-0 m-0" : "max-h-64 opacity-100",
            )}
          >
            <div className="max-w-sm">
              <p className="font-serif text-3xl leading-tight">The watcher that never sleeps.</p>
              <p className="mt-4 text-[15px] leading-relaxed text-foreground/70">
                Argus checks links, files, emails, texts and phone numbers against real threat intelligence, then tells you in
                plain words whether it&apos;s safe.
              </p>
              <Link
                href="/app"
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/70 px-4 py-2 text-sm text-foreground/90 transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <Smartphone className="size-4" /> Get the Android app
              </Link>
            </div>
            <p className="hidden text-right text-sm leading-relaxed text-muted-foreground md:block">
              Move your cursor.
              <br />
              It&apos;s watching.
            </p>
          </div>

          <div className={cn("transition-transform duration-300 ease-out", focused && compact ? "-translate-y-6 sm:translate-y-0" : "")}>
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
                  onFocus={() => {
                    setFocused(true);
                    if (compact) {
                      setTimeout(() => {
                        field.current?.scrollIntoView({ block: "center", behavior: "smooth" });
                      }, 120);
                    }
                  }}
                  onBlur={() => setFocused(false)}
                  placeholder={compact ? "Paste anything to check" : "Paste a link, a message or a phone number"}
                  aria-label="Something to check"
                  className="h-12 min-w-0 flex-1 bg-transparent text-[clamp(1.05rem,1.5vw,1.35rem)] outline-none placeholder:text-muted-foreground/80"
                />
                <button type="submit" disabled={busy} className="font-display sight-go shrink-0 pb-1.5 text-3xl disabled:opacity-50 sm:text-[2.35rem]">
                  Check
                </button>
                <span className="sight-rule" aria-hidden />
                <span className="sight-draw" aria-hidden />
                <span className="sight-scan" aria-hidden />
              </div>
              <div className="mt-3 flex min-h-7 flex-wrap items-center justify-between gap-x-8 gap-y-2 text-sm" aria-live="polite">
                {result ? (
                  <PreviewLine result={result} onClear={() => setResult(null)} />
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

              {result && result.ok && (
                <HeroBreakdown result={result} onClear={() => setResult(null)} />
              )}
            </form>

            <h1
              ref={titleRef}
              className={cn(
                "font-display pointer-events-none mt-4 select-none text-center text-[27vw] leading-[0.74] text-foreground [transform:translateY(16%)] transition-all duration-300",
                (focused && compact) || result ? "hidden opacity-0" : "opacity-100",
              )}
            >
              <ReactiveWord text="ARGUS" />
            </h1>
          </div>
        </div>

        <div ref={shade} className="pointer-events-none absolute inset-0 bg-background opacity-0" />
      </div>
    </section>
  );
}
