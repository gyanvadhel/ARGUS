"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Loader2, ScanSearch, X } from "lucide-react";
import { toast } from "sonner";
import { runScan, type ScanResult } from "@/app/(app)/scan/actions";
import { Eye, type EyeMood } from "@/components/eye/eye";
import { Button } from "@/components/ui/button";
import { eicarFile } from "@/lib/eicar";
import { cn } from "@/lib/utils";
import { ReportNumber } from "./report-number";
import { VerdictView } from "./verdict-view";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const SAMPLES: { label: string; input?: string; eicar?: boolean }[] = [
  { label: "Phishing link", input: "http://paypal-security-alert.net/verify-account" },
  { label: "Scam text", input: "URGENT: Your bank account has been suspended due to unusual activity. Verify your identity within 24 hours at bit.ly/secure-verify or you will be arrested." },
  {
    label: "Spoofed email",
    input: `From: "PayPal Security" <security@paypa1-security.com>
Reply-To: refunds@secure-helpdesk.xyz
To: you@example.com
Subject: Final notice: account suspended
Authentication-Results: mx.example.com; spf=fail smtp.mailfrom=paypa1-security.com; dkim=none; dmarc=fail

Dear customer, we detected an unusual sign-in. Click here to verify your password immediately: http://paypal-security-alert.net/login`,
  },
  { label: "Reported robocaller", input: "+1 877-556-9255" },
  { label: "EICAR test file", eicar: true },
  { label: "Safe message", input: "Hey are we still on for lunch tomorrow at noon?" },
];

// Everything runs at once; these name what's being asked while you wait.
const STAGES = [
  "Reading the input…",
  "Checking live phishing and malware feeds…",
  "Visiting the site safely…",
  "Looking up domain records and complaints…",
  "Asking VirusTotal…",
  "Running the Argus model…",
  "Weighing the evidence…",
];

export function ScanConsole() {
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<Extract<ScanResult, { ok: true }> | null>(null);
  const [focused, setFocused] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // While you type, the eye reads along the last line of the field.
  const target = useCallback(() => {
    const el = textRef.current;
    if (!focused || !el) return null;
    const r = el.getBoundingClientRect();
    const lines = input.split("\n");
    const row = Math.min(lines.length - 1, 4);
    return {
      x: r.left + Math.min(r.width - 24, 12 + (lines[lines.length - 1]?.length ?? 0) * 8.5),
      y: Math.min(r.bottom - 12, r.top + 14 + row * 26),
    };
  }, [focused, input]);

  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 900);
    return () => clearInterval(t);
  }, [scanning]);

  function pickFile(f: File | null | undefined) {
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error("Files up to 8 MB can be scanned in the web app.");
      return;
    }
    setFile(f);
    setInput("");
  }

  async function submit(override?: { input?: string; file?: File }) {
    const f = override ? override.file ?? null : file;
    const text = override ? override.input ?? "" : input;
    if (!f && !text.trim()) {
      toast.error("Paste something or drop a file to scan.");
      return;
    }
    const form = new FormData();
    if (f) form.append("file", f);
    else form.append("input", text);
    setStage(0);
    setScanning(true);
    setResult(null);
    try {
      const res = await runScan(form);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResult(res);
    } catch {
      toast.error("The scan couldn't finish. Refresh the page and try again.");
    } finally {
      setScanning(false);
    }
  }

  function runSample(s: (typeof SAMPLES)[number]) {
    if (s.eicar) {
      const f = eicarFile();
      setFile(f);
      setInput("");
      void submit({ file: f });
    } else {
      setFile(null);
      setInput(s.input!);
      void submit({ input: s.input! });
    }
  }

  const mood: EyeMood = scanning
    ? "scanning"
    : result
      ? result.verdict.score >= 60 ? "danger" : result.verdict.score < 30 ? "safe" : "watching"
      : focused || input || file ? "watching" : "idle";
  const caption = scanning
    ? STAGES[stage]
    : result
      ? result.verdict.score >= 60 ? "That one's dangerous." : result.verdict.score < 30 ? "Looks clean." : "Worth a second look."
      : focused ? "Reading along�" : "Watching for something to check.";

  return (
    <div className="space-y-8">
      <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div className="relative hidden min-h-72 lg:block">
        <Eye mood={mood} target={target} distance={4.4} className="absolute inset-0" />
        <p className="absolute inset-x-0 bottom-1 text-center text-xs text-muted-foreground" aria-live="polite">{caption}</p>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-4">
      <div
        className={cn("glass relative rounded-3xl p-2 transition-shadow", dragging && "ring-2 ring-foreground/40")}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
      >
        <div className="flex items-start gap-4 p-4">
          {file ? (
            <div className="flex min-h-24 flex-1 items-center gap-3">
              <FileUp className="size-5 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB. Only its fingerprint is sent to threat databases.</p>
              </div>
              <button type="button" onClick={() => setFile(null)} className="ml-auto rounded-full p-1.5 text-muted-foreground hover:bg-white/5" aria-label="Remove file">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <textarea
              ref={textRef}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
              placeholder="Paste a link, an email, a text message or a phone number, or drop a file here"
              aria-label="Content to scan"
              rows={4}
              className="min-h-24 flex-1 resize-y bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/70"
            />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <input ref={fileInput} type="file" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
            <Button type="button" variant="ghost" onClick={() => fileInput.current?.click()} className="h-9">
              <FileUp className="size-4" /> Upload file
            </Button>
            <span className="hidden text-xs text-muted-foreground sm:inline">Ctrl + Enter to scan</span>
          </div>
          <Button type="button" onClick={() => void submit()} disabled={scanning} className="h-10 rounded-full px-6">
            {scanning ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
            {scanning ? "Scanning…" : "Scan"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted-foreground">Try a sample:</span>
        {SAMPLES.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={scanning}
            onClick={() => runSample(s)}
            className="rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}
      </div>

      </div>
      </div>

      {scanning && <p className="text-sm text-muted-foreground lg:hidden">{STAGES[stage]}</p>}

      {result && (
        <div className="space-y-4">
          <VerdictView
            verdict={result.verdict}
            actions={
              result.verdict.kind === "phone" && result.verdict.subject.startsWith("+")
                ? <ReportNumber e164={result.verdict.subject} />
                : undefined
            }
          />
          <p className="text-center text-xs text-muted-foreground">
            Saved to your <Link href={`/scan/${result.id}`} className="underline underline-offset-4">history</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
