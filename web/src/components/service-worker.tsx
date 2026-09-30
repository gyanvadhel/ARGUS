"use client";

import { useEffect } from "react";

/** Registers public/sw.js, which lets an installed Argus receive shares from other apps. Renders nothing. */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
