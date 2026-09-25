"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, PhoneIncoming, PhoneOff, Send, ShieldAlert, User } from "lucide-react";
import { toast } from "sonner";
import { callTurn, saveCall, screenCaller } from "@/app/(app)/call-assistant/actions";
import { Iris } from "@/components/iris/iris";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LEVEL_META, levelFor } from "@/lib/format";
import type { CallTurn, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";

const DISCLOSURE = "Hi, this is the Argus call assistant screening this line. Who's calling, and what's this about?";
const EXAMPLES = [
  { label: "Wrong number", text: "Hi sorry, I think I have the wrong number, I was trying to reach a plumber." },
  { label: "Vague urgency", text: "This is urgent, I need you to confirm your identity right now or there will be a problem with your account." },
  { label: "Fake tech support", text: "This is Microsoft technical support. We detected a virus on your computer. Give us remote access to your computer immediately and do not tell anyone." },
  { label: "Bank PIN scam", text: "This is your bank's fraud department, we noticed suspicious activity, please confirm your pin and card number immediately, do not tell your family, keep this confidential." },
];

type Phase = "setup" | "live" | "blocked" | "ended";

export function CallConsole() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [callerId, setCallerId] = useState("");
  const [transcript, setTranscript] = useState<CallTurn[]>([]);
  const [analysis, setAnalysis] = useState<Verdict | null>(null);
  const [blockVerdict, setBlockVerdict] = useState<Verdict | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript]);

  const score = analysis?.score ?? 0;
  const level = analysis?.level && analysis.level !== "UNVERIFIED" ? analysis.level : levelFor(score);
  const color = LEVEL_META[level].color;

  function startCall() {
    start(async () => {
      const res = await screenCaller(callerId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.blocked) {
        setBlockVerdict(res.verdict);
        setPhase("blocked");
        if (res.verdict) await saveCall(callerId, res.verdict);
        return;
      }
      setTranscript([{ role: "assistant", text: DISCLOSURE }]);
      setAnalysis(null);
      setSavedId(null);
      setPhase("live");
    });
  }

  function send(text: string) {
    const line = text.trim();
    if (!line || pending) return;
    const next: CallTurn[] = [...transcript, { role: "caller", text: line }];
    setTranscript(next);
    setMessage("");
    start(async () => {
      const res = await callTurn(next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTranscript([...next, { role: "assistant", text: res.reply }]);
      setAnalysis(res.analysis);
      setMode(res.mode);
    });
  }

  function endCall() {
    start(async () => {
      if (analysis) {
        const res = await saveCall(callerId, analysis);
        if (res.ok) setSavedId(res.id);
        else toast.error(res.error);
      }
      setPhase("ended");
    });
  }

  function reset() {
    setPhase("setup");
    setCallerId("");
    setTranscript([]);
    setAnalysis(null);
    setBlockVerdict(null);
    setMode(null);
    setSavedId(null);
  }

  if (phase === "setup") {
    return (
      <div className="glass mx-auto flex max-w-xl flex-col items-center rounded-3xl p-10 text-center">
        <Iris size={160} />
        <h2 className="mt-6 font-serif text-3xl">Simulate an incoming call</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Enter a caller ID, or leave it blank for an unknown caller. Known scam numbers are declined before the call
          ever rings. Try <span className="font-mono text-foreground">1-800-555-0142</span>.
        </p>
        <div className="mt-6 flex w-full gap-2">
          <Input
            value={callerId}
            onChange={(e) => setCallerId(e.target.value)}
            placeholder="Caller ID (optional)"
            aria-label="Caller ID"
            className="h-10"
            onKeyDown={(e) => e.key === "Enter" && startCall()}
          />
          <Button onClick={startCall} disabled={pending} className="h-10 shrink-0 rounded-full px-5">
            <PhoneIncoming className="size-4" /> Answer
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "blocked") {
    return (
      <div className="glass mx-auto max-w-xl rounded-3xl p-10 text-center">
        <Iris state="danger" size={160} className="mx-auto" />
        <h2 className="mt-6 font-serif text-4xl text-risk-high">Call declined</h2>
        <p className="mt-3 text-muted-foreground">
          <span className="font-mono text-foreground">{callerId}</span> is a known scam number. Argus blocked it before
          it could ring. No conversation took place.
        </p>
        {blockVerdict && (
          <p className="mt-2 text-sm text-muted-foreground">
            {blockVerdict.signals.find((s) => s.source === "ARGUS blocklist")?.summary}
          </p>
        )}
        <Button variant="outline" className="mt-8 h-10 rounded-full px-5" onClick={reset}>Take another call</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <section className="glass flex h-[620px] min-w-0 flex-col rounded-3xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <p className="text-sm">
            <span className="text-muted-foreground">On the line:</span> <span className="font-mono">{callerId || "Unknown caller"}</span>
          </p>
          {phase === "live" ? (
            <Button variant="outline" onClick={endCall} disabled={pending} className="h-8">
              <PhoneOff className="size-3.5" /> End and save
            </Button>
          ) : (
            <Button variant="outline" onClick={reset} className="h-8">New call</Button>
          )}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {transcript.map((t, i) => (
            <div key={i} className={cn("flex gap-3", t.role === "caller" && "flex-row-reverse")}>
              <div className={cn("grid size-8 shrink-0 place-items-center rounded-full", t.role === "caller" ? "bg-white/10" : "bg-gradient-to-br from-aurora-1 to-aurora-2")}>
                {t.role === "caller" ? <User className="size-4" /> : <Bot className="size-4" />}
              </div>
              <p className={cn("max-w-[75%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed", t.role === "caller" ? "bg-white/[0.07]" : "border border-border/60 bg-background/40")}>
                {t.text}
              </p>
            </div>
          ))}
          {pending && phase === "live" && <p className="pl-11 text-xs text-muted-foreground">Argus is listening…</p>}
          <div ref={endRef} />
        </div>
        {phase === "live" && (
          <div className="border-t border-border/60 p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button
                  key={e.label}
                  type="button"
                  onClick={() => send(e.text)}
                  disabled={pending}
                  className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {e.label}
                </button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(message); }} className="flex gap-2">
              <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Speak as the caller…" aria-label="Caller message" disabled={pending} className="h-10" />
              <Button type="submit" disabled={pending || !message.trim()} aria-label="Send" className="size-10">
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <div className="glass rounded-3xl p-6">
          <p className="text-sm text-muted-foreground">Live call risk</p>
          <p className="mt-3 font-serif text-6xl tabular-nums" style={{ color }}>{score}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full transition-[width,background-color] duration-700"
              style={{ width: `${Math.max(score, 2)}%`, background: color, boxShadow: `0 0 16px ${color}` }}
            />
          </div>
          <p className="mt-3 text-sm" style={{ color }}>{LEVEL_META[level].label}</p>
          {mode && <p className="mt-4 text-xs text-muted-foreground">Replies by: {mode === "Claude" ? "Claude AI" : "scripted assistant"}</p>}
        </div>
        {analysis && analysis.signals.some((s) => s.status === "suspicious" || s.status === "malicious") && (
          <div className="glass rounded-3xl p-6">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><ShieldAlert className="size-3.5" /> Red flags</p>
            <ul className="mt-3 space-y-2 text-sm">
              {analysis.signals
                .filter((s) => s.status === "suspicious" || s.status === "malicious")
                .map((s) => <li key={s.source}>{s.summary}</li>)}
            </ul>
          </div>
        )}
        {phase === "ended" && (
          <div className="glass rounded-3xl p-6 text-sm">
            <p className="font-medium">Call ended.</p>
            <p className="mt-1 text-muted-foreground">
              No information was shared.
              {savedId && <> <Link href={`/scan/${savedId}`} className="underline underline-offset-4">View saved report</Link>.</>}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
