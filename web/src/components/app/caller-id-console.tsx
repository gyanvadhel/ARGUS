"use client";

import { useState, useTransition } from "react";
import { Loader2, PhoneIncoming, Search } from "lucide-react";
import { toast } from "sonner";
import { lookupNumber, type LookupResult } from "@/app/(app)/caller-id/actions";
import { reportNumber } from "@/app/(app)/scan/actions";
import { WatchingEye } from "@/components/eye/watching-eye";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callerVerdict, LEVEL_META, STATUS_ORDER, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IncomingCall } from "./incoming-call";
import { SignalCard } from "./signal-card";

type Found = Extract<LookupResult, { ok: true }>;

const SAMPLES = [
  { label: "Known scam line", value: "1-800-555-0142" },
  { label: "One-ring trap", value: "+232 76 123456" },
  { label: "Look-alike area code", value: "+1 876 203 4567" },
  { label: "Ordinary number", value: "+1 650-253-0000" },
];
const CATEGORIES = ["Scam", "Spam", "Robocall", "Fraud", "Other"];

function IdentityCard({ found, onSimulate }: { found: Found; onSimulate: () => void }) {
  const { verdict, community, recent } = found;
  const tone = verdict.level === "UNVERIFIED" ? "var(--risk-unknown)" : LEVEL_META[verdict.level].color;
  const info = verdict.signals.find((s) => s.source === "Number validation")?.evidence ?? {};
  const max = Math.max(1, ...CATEGORIES.map((c) => community.categories[c] ?? 0));
  return (
    <section className="rounded-[2rem] border border-border/70 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Verdict</p>
          <p className="font-display mt-2 text-5xl sm:text-6xl" style={{ color: tone }}>
            {callerVerdict(verdict.score, verdict.level)}
          </p>
        </div>
        <p className="font-display text-6xl tabular-nums" style={{ color: tone }} aria-label={`Risk ${verdict.score} out of 100`}>
          {verdict.score}
        </p>
      </div>

      <div className="mt-8 border-t border-border/60 pt-6">
        <p className="font-serif text-3xl">{community.name ? `“${community.name}”` : "No name tag yet"}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {community.name
            ? `Suggested by ${community.name_votes} Argus user${community.name_votes === 1 ? "" : "s"}`
            : "Know who this is? Tag it below so others know too."}
        </p>
        <p className="mt-5 font-mono text-xl">{String(info.international ?? verdict.subject)}</p>
        <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd className="mt-0.5">{String(info.region ?? "Unknown")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Carrier</dt>
            <dd className="mt-0.5">{String(info.carrier ?? "Not listed")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Line</dt>
            <dd className="mt-0.5 capitalize">{String(info.line_type ?? "Unknown")}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-7 border-t border-border/60 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-2xl">Community</h3>
          <p className="flex gap-4 text-sm text-muted-foreground">
            <span>{community.reports} report{community.reports === 1 ? "" : "s"}</span>
            <span>
              Seen in {community.sightings} scam message{community.sightings === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        {community.reports > 0 ? (
          <ul className="mt-4 space-y-2.5">
            {CATEGORIES.map((c) => {
              const n = community.categories[c] ?? 0;
              return (
                <li key={c} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-sm">
                  <span className={cn(n ? "text-foreground" : "text-muted-foreground")}>{c}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <span className="block h-full rounded-full bg-chart-2" style={{ width: `${(n / max) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">{n}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No one has reported this number yet.</p>
        )}
        {recent.length > 0 && (
          <ul className="mt-5 divide-y divide-border/50 border-t border-border/50">
            {recent.map((r, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="text-foreground">{r.category}</span>
                  {r.name_tag && <span className="text-muted-foreground">, tagged “{r.name_tag}”</span>}
                  {r.note && <span className="block truncate text-xs text-muted-foreground">{r.note}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button onClick={onSimulate} className="mt-8 h-12 w-full rounded-full text-sm">
        <PhoneIncoming className="size-4" /> Simulate a call from this number
      </Button>
    </section>
  );
}

function ReportForm({ e164, onDone }: { e164: string; onDone: () => void }) {
  const [category, setCategory] = useState("Scam");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="rounded-[2rem] border border-border/70 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await reportNumber(e164, category, note, name);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Reported. Other Argus users are now warned about this number.");
          setName("");
          setNote("");
          onDone();
        });
      }}
    >
      <h3 className="font-serif text-2xl">Report or tag this number</h3>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="What kind of call was it?">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              category === c ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Who is it? e.g. Fake bank KYC call" aria-label="Name tag" className="mt-4 h-10" />
      <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="What did they say? (optional)" aria-label="Note" className="mt-3 h-10" />
      <Button type="submit" disabled={pending} variant="outline" className="mt-4 h-10 w-full rounded-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Submit report"}
      </Button>
    </form>
  );
}

export function CallerIdConsole({ contacts }: { contacts: number }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [calling, setCalling] = useState(false);
  const [pending, start] = useTransition();

  function lookup(value: string) {
    if (!value.trim()) return;
    start(async () => {
      const res = await lookupNumber(value);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setFound(res);
    });
  }

  const signals = found ? [...found.verdict.signals].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) : [];

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup(query);
        }}
        className="flex items-center gap-2 rounded-full border border-border bg-white/[0.02] p-1.5 pl-5 transition-colors focus-within:border-foreground/40"
      >
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Look up any number, with its country code"
          aria-label="Phone number"
          inputMode="tel"
          className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" disabled={pending} className="h-11 min-w-28 rounded-full px-6">
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Look up"}
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="mr-1 text-muted-foreground">Try:</span>
        {SAMPLES.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={pending}
            onClick={() => {
              setQuery(s.value);
              lookup(s.value);
            }}
            className="rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}
      </div>

      {found ? (
        <div
          aria-busy={pending}
          className={cn("grid gap-6 transition-opacity lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]", pending && "pointer-events-none opacity-40")}
        >
          <IdentityCard found={found} onSimulate={() => setCalling(true)} />
          <div className="space-y-6">
            <section>
              <h3 className="font-serif mb-3 text-2xl">Why Argus thinks so</h3>
              <div className="grid gap-3">
                {signals.map((s, i) => (
                  <SignalCard key={`${i}-${s.source}`} signal={s} visible />
                ))}
              </div>
            </section>
            <ReportForm e164={found.verdict.subject} onDone={() => lookup(found.verdict.subject)} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-[2rem] border border-dashed border-border/70 px-6 py-16 text-center">
          <WatchingEye className="h-10 w-16 text-foreground" strokeWidth={1.4} />
          <p className="mt-6 max-w-md text-muted-foreground">
            Unlike reputation-only caller ID, Argus also catches brand-new scam numbers: unassigned numbers, internet lines,
            one-ring callback traps, and numbers already seen in scam messages.
          </p>
        </div>
      )}

      {calling && found && (
        <IncomingCall
          verdict={found.verdict}
          community={found.community}
          contacts={contacts}
          onClose={() => setCalling(false)}
          onBlock={async () => {
            const top = Object.entries(found.community.categories).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Scam";
            const res = await reportNumber(found.verdict.subject, top, "Blocked from an incoming call", "");
            if (!res.ok && !res.error.includes("already")) toast.error(res.error);
            lookup(found.verdict.subject);
          }}
        />
      )}
    </div>
  );
}
