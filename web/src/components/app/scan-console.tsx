"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileUp, ImageUp, KeyRound, Loader2, QrCode, ScanSearch, ScanText, X } from "lucide-react";
import { toast } from "sonner";
import { runScan, type ScanResult } from "@/app/(app)/scan/actions";
import { Eye, type EyeMood } from "@/components/eye/eye";
import { Button } from "@/components/ui/button";
import { detectKind } from "@/lib/detect";
import { eicarFile } from "@/lib/eicar";
import { isReadableImage, qrFromImage, textFromImage } from "@/lib/image-read";
import { parseQr, type QrPayload } from "@/lib/qr";
import { cn } from "@/lib/utils";
import { PasswordCheck } from "./password-check";
import { QrCamera } from "./qr-camera";
import { ReportNumber } from "./report-number";
import { UpiCard } from "./upi-card";
import { VerdictView } from "./verdict-view";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // hosting limits a request to 4.5 MB
// Where public/sw.js keeps a screenshot shared to Argus from another app.
const SHARED_CACHE = "argus-shared";
const SHARED_IMAGE = "/shared-image";

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
  "Asking VirusTotal and researchers' threat reports…",
  "Running the Argus model…",
  "Weighing the evidence…",
];

type Upi = Extract<QrPayload, { kind: "upi" }>;
type Origin = { kind: "qr" } | { kind: "screenshot"; image: File };

export function ScanConsole({
  initialInput,
  autoRun = false,
  shared,
}: {
  initialInput?: string;
  autoRun?: boolean;
  /** "image": a screenshot shared to Argus from another app is waiting; "retry": one arrived before Argus could take it. */
  shared?: string;
}) {
  const [input, setInput] = useState(initialInput ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<Extract<ScanResult, { ok: true }> | null>(null);
  const [focused, setFocused] = useState(false);
  const [tool, setTool] = useState<"camera" | "password" | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [upi, setUpi] = useState<Upi | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
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

  // A link sent from the browser extension ("See the full evidence") starts scanning straight away.
  useEffect(() => {
    // Links from the extension start at once; anything else only when asked to (the dashboard's first-visit examples).
    if (!initialInput || (!autoRun && detectKind(initialInput) !== "url")) return;
    const t = setTimeout(() => void submit({ input: initialInput }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for what the page was opened with
  }, [initialInput]);

  // A screenshot shared to Argus from another app (public/sw.js holds it until this page takes it).
  useEffect(() => {
    if (shared !== "image" && shared !== "retry") return;
    window.history.replaceState(null, "", "/scan");
    if (shared === "retry") {
      toast("That image arrived before Argus was ready. Share it again, or upload it here.");
      return;
    }
    if (!("caches" in window)) return;
    void (async () => {
      const cache = await caches.open(SHARED_CACHE);
      const res = await cache.match(SHARED_IMAGE);
      if (!res) return;
      await cache.delete(SHARED_IMAGE);
      const blob = await res.blob();
      const name = decodeURIComponent(res.headers.get("x-file-name") ?? "screenshot");
      void readImage(new File([blob], name, { type: blob.type || "image/png" }));
    })().catch(() => toast.error("Couldn't open the shared image. Upload it here instead."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for what the page was opened with
  }, [shared]);

  function scanAsFile(f: File) {
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error("Files up to 4 MB can be scanned in the web app.");
      return;
    }
    setFile(f);
    setInput("");
    setOrigin(null);
    setUpi(null);
  }

  function pickFile(f: File | null | undefined) {
    if (!f) return;
    // Pictures are read here on the device (a QR code, or the words in a screenshot); other files are checked whole.
    if (isReadableImage(f)) void readImage(f);
    else scanAsFile(f);
  }

  function openQr(raw: string) {
    const payload = parseQr(raw);
    setTool(null);
    setFile(null);
    if (payload.kind === "upi") {
      setResult(null);
      setOrigin(null);
      setUpi(payload);
      return;
    }
    const text = payload.kind === "url" ? payload.url : payload.kind === "phone" ? payload.number : payload.text;
    setOrigin({ kind: "qr" });
    setInput(text);
    void submit({ input: text });
  }

  async function readImage(image: File) {
    setFile(null);
    setUpi(null);
    setResult(null);
    setTool(null);
    setReading("Looking for a QR code…");
    try {
      const qr = await qrFromImage(image).catch(() => null);
      if (qr) {
        setReading(null);
        openQr(qr);
        return;
      }
      setReading("Getting the screenshot reader ready…");
      const text = await textFromImage(image, ({ stage, progress }) =>
        setReading(
          stage === "reading"
            ? `Reading your screenshot… ${Math.round(progress * 100)}%`
            : "Getting the screenshot reader ready (the first time takes longer)…",
        ),
      );
      setOrigin({ kind: "screenshot", image });
      setReading(null);
      if (text.replace(/\s/g, "").length < 4) {
        toast.error("No words or QR code found in that image.");
        return;
      }
      setInput(text);
      void submit({ input: text });
    } catch {
      setReading(null);
      setOrigin({ kind: "screenshot", image });
      toast.error("Couldn't read that image. Try a clearer screenshot, or paste the text instead.");
    }
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
    setUpi(null);
    try {
      const res = await runScan(form);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResult(res);
      if (res.alerted > 0) toast(`Told ${res.alerted} trusted contact${res.alerted === 1 ? "" : "s"} on Telegram.`);
    } catch {
      toast.error("The scan couldn't finish. Refresh the page and try again.");
    } finally {
      setScanning(false);
    }
  }

  function runSample(s: (typeof SAMPLES)[number]) {
    setOrigin(null);
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

  const busy = scanning || reading !== null;
  const mood: EyeMood = busy
    ? "scanning"
    : result
      ? result.verdict.score >= 60 ? "danger" : result.verdict.score < 30 ? "safe" : "watching"
      : focused || input || file ? "watching" : "idle";
  const caption = reading
    ? reading
    : scanning
    ? STAGES[stage]
    : result
      ? result.verdict.score >= 60 ? "That one's dangerous." : result.verdict.score < 30 ? "Looks clean." : "Worth a second look."
      : focused ? "Reading along…" : "Watching for something to check.";

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
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
        {origin && !reading && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 text-xs text-muted-foreground">
            {origin.kind === "qr" ? (
              <span className="flex items-center gap-1.5"><QrCode className="size-3.5" /> Read from a QR code.</span>
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <ScanText className="size-3.5 shrink-0" /> Read from your image on this device. Fix any misread words, then scan again.
                </span>
                <button type="button" onClick={() => scanAsFile(origin.image)} className="underline underline-offset-4 hover:text-foreground">
                  Check the image file instead
                </button>
              </>
            )}
          </div>
        )}
        <div className="flex items-start gap-4 p-4">
          {reading ? (
            <div className="flex min-h-24 flex-1 items-center gap-3 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 shrink-0 animate-spin" /> {reading}
            </div>
          ) : file ? (
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
              onPaste={(e) => {
                const image = Array.from(e.clipboardData.files).find(isReadableImage);
                if (image) {
                  e.preventDefault();
                  void readImage(image);
                }
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
              placeholder="Paste a link, an email, a text message or a phone number, or drop a file or screenshot here"
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
          <Button type="button" onClick={() => void submit()} disabled={busy} className="h-10 rounded-full px-6">
            {scanning ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
            {scanning ? "Scanning…" : "Scan"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void readImage(f); e.target.value = ""; }}
        />
        {(
          [
            { key: "camera", label: "Scan a QR code", short: "QR code", icon: Camera, onClick: () => setTool(tool === "camera" ? null : "camera") },
            { key: "screenshot", label: "Read a screenshot", short: "Screenshot", icon: ImageUp, onClick: () => imageInput.current?.click() },
            { key: "password", label: "Check a password", short: "Password", icon: KeyRound, onClick: () => setTool(tool === "password" ? null : "password") },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={busy}
            onClick={t.onClick}
            aria-label={t.label}
            aria-pressed={t.key === "screenshot" ? undefined : tool === t.key}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-2xl border border-border/70 px-2 py-3 text-xs transition-colors hover:border-foreground/40 disabled:opacity-50",
              "sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:py-2 sm:text-sm",
              tool === t.key && "border-foreground/50 bg-white/5",
            )}
          >
            <t.icon className="size-4 text-muted-foreground" />
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tool === "camera" && <QrCamera onResult={openQr} onClose={() => setTool(null)} />}
      {tool === "password" && <PasswordCheck onClose={() => setTool(null)} />}

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted-foreground">Try a sample:</span>
        {SAMPLES.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={busy}
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

      {upi && <div className="max-w-3xl"><UpiCard payment={upi} onDismiss={() => setUpi(null)} /></div>}

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
