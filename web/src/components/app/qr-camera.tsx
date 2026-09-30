"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { qrFromVideo } from "@/lib/image-read";

const FRAME_MS = 180;

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError") return "Camera access is blocked. Allow it in your browser's site settings, or upload a photo of the code instead.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera found. Upload a photo or screenshot of the code instead.";
  return "The camera couldn't start. Upload a photo or screenshot of the code instead.";
}

/** Reads a QR code through the camera, on this device. Nothing is recorded or sent anywhere. */
export function QrCamera({ onResult, onClose }: { onResult: (raw: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const report = useRef(onResult);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    report.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    const canvas = document.createElement("canvas");
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't open the camera here. Upload a photo or screenshot of the code instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        setError(cameraError(e));
        return;
      }
      const v = video.current;
      if (stopped || !v) return stop();
      v.srcObject = stream;
      await v.play().catch(() => {});
      setLive(true);
      const tick = async () => {
        if (stopped) return;
        const found = await qrFromVideo(v, canvas).catch(() => null);
        if (found && !stopped) {
          stop();
          report.current(found);
          return;
        }
        timer = window.setTimeout(tick, FRAME_MS);
      };
      void tick();
    })();
    return stop;
  }, []);

  return (
    <section className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-medium">Scan a QR code</h2>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-white/5" aria-label="Close camera">
          <X className="size-4" />
        </button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-risk-high">{error}</p>
      ) : (
        <>
          <div className="relative mx-auto mt-4 aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-black">
            <video ref={video} muted playsInline className="size-full object-cover" aria-label="Camera view" />
            <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/70" aria-hidden />
            {!live && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" /> Starting the camera…
              </div>
            )}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Point your camera at the code. It&apos;s read on this device; nothing is recorded or sent anywhere.
          </p>
        </>
      )}
    </section>
  );
}
