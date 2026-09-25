"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, ScanSearch, X } from "lucide-react";
import { toast } from "sonner";
import { runScan, type ScanResult } from "@/app/(app)/scan/actions";
import { Iris } from "@/components/iris/iris";
import { Button } from "@/components/ui/button";
import { eicarFile } from "@/lib/eicar";
import { cn } from "@/lib/utils";
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
  { label: "Blocklisted caller", input: "1-800-555-0142" },
  { label: "EICAR test file", eicar: true },
  { label: "Safe message", input: "Hey are we still on for lunch tomorrow at noon?" },
];

const STAGES = [
  "Reading the input…",
  "Querying VirusTotal…",
  "Checking URLhaus and MalwareBazaar…",
  "Asking Google Safe Browsing…",
  "Looking up domain records…",
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
  const fileInput = useRef<HTMLInputElement>(null);

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
    const res = await runScan(form);
    setScanning(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setResult(res);
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

  const irisState = scanning
    ? "scanning"
    : result
      ? result.verdict.score >= 60 ? "danger" : result.verdict.score < 30 ? "safe" : "idle"
      : "idle";

  return (
    <div className="space-y-8">
      <div
        className={cn("glass relative rounded-3xl p-2 transition-shadow", dragging && "ring-2 ring-primary/60")}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
      >
        <div className="flex items-start gap-4 p-4">
          <Iris state={irisState} size={72} className="hidden shrink-0 sm:block" />
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
            className="rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}
      </div>

      {scanning && (
        <div className="glass flex flex-col items-center rounded-3xl py-14">
          <Iris state="scanning" size={220} />
          <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">{STAGES[stage]}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <VerdictView verdict={result.verdict} />
          <p className="text-center text-xs text-muted-foreground">
            Saved to your <Link href={`/scan/${result.id}`} className="underline underline-offset-4">history</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
