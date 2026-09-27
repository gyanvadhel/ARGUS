"use client";

import { useEffect } from "react";
import { shouldWarm } from "@/lib/warm";

const KEY = "argus:engine-warmed";

/** Keeps the free scanning engine awake while someone has Argus open (see lib/warm.ts). Renders nothing. */
export function WarmEngine() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      try {
        const stored = localStorage.getItem(KEY);
        if (!shouldWarm(stored === null ? null : Number(stored), Date.now())) return;
        localStorage.setItem(KEY, String(Date.now()));
      } catch {
        // Storage can be blocked in private windows: ping anyway.
      }
      void fetch("/api/warm", { cache: "no-store" }).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, 60_000);
    return () => clearInterval(timer);
  }, []);
  return null;
}
