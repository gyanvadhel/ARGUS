"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, ShieldBan } from "lucide-react";
import { toast } from "sonner";
import { Eye, type EyeMood } from "@/components/eye/eye";
import { Button } from "@/components/ui/button";
import { callerVerdict, levelMeta } from "@/lib/format";
import type { Community, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";

type CallState = "ringing" | "declined" | "blocked" | "answered";

type Props = {
  verdict: Verdict;
  community: Community;
  contacts: number;
  /** False for numbers that can't exist: they can be blocked, but there's no real line to report. */
  reportable?: boolean;
  onClose: () => void;
  onBlock: () => Promise<void>;
};

/** A phone ringing with an Argus-screened call: name tag, verdict banner, and the eye reacting to the risk. */
export function IncomingCall({ verdict, community, contacts, reportable = true, onClose, onBlock }: Props) {
  const [state, setState] = useState<CallState>("ringing");
  const [busy, setBusy] = useState(false);
  const decline = useRef<HTMLButtonElement>(null);
  const { score, level } = verdict;
  const risky = score >= 60;
  const info = verdict.signals.find((s) => s.source === "Number validation")?.evidence ?? {};
  const reason = verdict.signals.find((s) => s.status === "malicious" || s.status === "suspicious")?.summary;
  const tone = levelMeta(level, verdict.verified).color;
  const mood: EyeMood = risky ? "danger" : score < 30 && level !== "UNVERIFIED" ? "safe" : "watching";

  useEffect(() => {
    decline.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const outcome = {
    declined: { title: "Call declined", body: risky ? "Good call. Argus will keep watching this number." : "The caller can leave a message." },
    blocked: reportable
      ? { title: "Blocked and reported", body: "Other Argus users will now see this number flagged." }
      : { title: "Blocked", body: "This caller ID was faked, so there's no real number to report." },
    answered: { title: "Connected", body: "Never share codes, PINs or passwords on a call you didn't expect." },
  } as const;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Incoming call"
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative flex h-[min(720px,92dvh)] w-[340px] flex-col overflow-hidden rounded-[3rem] border border-border bg-background shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9)]",
          state === "ringing" && "phone-ringing",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-6 w-28 rounded-full bg-black" aria-hidden />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {state === "ringing" ? "Incoming call, screened by Argus" : "Call ended"}
        </p>

        <div className="relative mx-auto mt-2 h-44 w-full">
          <Eye mood={state === "blocked" ? "danger" : mood} distance={4.8} className="absolute inset-0" />
          {state === "ringing" &&
            [0, 1, 2].map((i) => (
              <span
                key={i}
                className="ring-pulse pointer-events-none absolute left-1/2 top-1/2 size-32 rounded-full border"
                style={{ animationDelay: `${i * 0.6}s`, borderColor: tone }}
                aria-hidden
              />
            ))}
        </div>

        <div className="px-6 text-center">
          <p className="font-serif text-3xl leading-tight">{community.name ?? "Unknown caller"}</p>
          <p className="mt-1 font-mono text-sm text-foreground/80">{String(info.international ?? verdict.subject)}</p>
          {info.region != null && <p className="mt-0.5 text-xs text-muted-foreground">{String(info.region)}</p>}
        </div>

        <div
          className="mx-5 mt-5 rounded-2xl border px-4 py-3"
          style={{ borderColor: `color-mix(in oklab, ${tone} 45%, transparent)`, background: `color-mix(in oklab, ${tone} 10%, transparent)` }}
        >
          <p className="font-medium" style={{ color: tone }}>
            {risky || score >= 30 ? callerVerdict(score, level, verdict.verified) : "No warnings from Argus"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/75">
            {reason ?? "Not reported by Argus users and not on any blocklist."}
          </p>
        </div>

        {state === "ringing" ? (
          <div className="mt-auto px-8 pb-10">
            {score >= 30 && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onBlock();
                  setBusy(false);
                  setState("blocked");
                }}
                className="mx-auto mb-7 flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-foreground/85 hover:border-foreground/40 disabled:opacity-50"
              >
                <ShieldBan className="size-4" /> {reportable ? "Block and report" : "Block"}
              </button>
            )}
            <div className="flex items-end justify-between">
              <div className="flex flex-col items-center gap-2">
                <button
                  ref={decline}
                  type="button"
                  onClick={() => setState("declined")}
                  aria-label="Decline"
                  className="grid size-16 place-items-center rounded-full bg-risk-high text-black transition-transform hover:scale-105"
                >
                  <PhoneOff className="size-6" />
                </button>
                <span className="text-xs text-muted-foreground">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (risky) toast.warning("Argus recommends not answering this one.");
                    setState("answered");
                  }}
                  aria-label="Answer"
                  className="grid size-16 place-items-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
                >
                  <Phone className="size-6" />
                </button>
                <span className="text-xs text-muted-foreground">Answer</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-auto px-8 pb-10 text-center">
            <p className="font-serif text-2xl">{outcome[state].title}</p>
            <p className="mt-2 text-sm text-muted-foreground">{outcome[state].body}</p>
            {score >= 80 && contacts > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Argus would alert {contacts} trusted contact{contacts === 1 ? "" : "s"} about this call (simulated).
              </p>
            )}
            <Button variant="outline" onClick={onClose} className="mt-6 h-10 rounded-full px-6">
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
