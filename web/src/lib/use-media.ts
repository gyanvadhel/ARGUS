"use client";

import { useSyncExternalStore } from "react";

/** Whether a CSS media query matches, kept live. False on the server and until the page hydrates. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
