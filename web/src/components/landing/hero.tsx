"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { previewScan, type PreviewResult } from "@/app/preview-actions";
import { LevelPill } from "@/components/app/level-pill";
import { Eye, type EyeMood } from "@/components/eye/eye";
import { Magnetic } from "@/components/fx/magnetic";
import { ReactiveWord } from "@/components/fx/reactive-word";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SAMPLES = [
  { label: "a phishing link", value: "http://paypal-security-alert.net/verify-account" },
  { label: "a scam text", value: "URGENT: your bank account is suspended. Verify your identity within 24 hours at bit.ly/secure-verify or you will be arrested." },
  { label: "a scam number", value: "1-800-555-0142" },
];

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function PreviewLine({ result }: { result: PreviewResult }) {
  if (!result.ok) return <span className="text-risk-high">{result.error}</span>;
  return (
    <>
      <LevelPill level={result.level} score={result.score} />
      <span className="text-foreground/75">{result.threat !== "None" ? result.threat : "Nothing suspicious found"}</span>
      <Link href="/signup" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
        See the full evidence
      </Link>
    </>
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
    return { x: r.left + Math.min(r.width - 30, 20 + value.length * 8.5), y: r.top + r.height / 2 };
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
        <Eye mood={mood} dive={dive} target={target} distance={6.2} offsetY={0.42} className="absolute inset-0" />

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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(value);
              }}
              className="mx-auto w-full max-w-2xl"
            >
              <div className="flex items-center gap-2 rounded-full border border-border bg-background/75 p-1.5 pl-5 backdrop-blur-md transition-colors focus-within:border-foreground/40">
                <input
                  ref={field}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="Paste a suspicious link, message or phone number"
                  aria-label="Something to check"
                  className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
                />
                <Magnetic strength={0.18}>
                  <button type="submit" disabled={busy} className={cn(buttonVariants(), "h-11 min-w-28 rounded-full px-6 text-sm")}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : "Check it"}
                  </button>
                </Magnetic>
              </div>
              <div className="mt-3 flex min-h-8 flex-wrap items-center justify-center gap-2 text-sm" aria-live="polite">
                {result ? (
                  <PreviewLine result={result} />
                ) : (
                  <>
                    <span className="text-muted-foreground">Try</span>
                    {SAMPLES.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => {
                          setValue(s.value);
                          void run(s.value);
                        }}
                        className="rounded-full border border-border px-3 py-1 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                      >
                        {s.label}
                      </button>
                    ))}
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
