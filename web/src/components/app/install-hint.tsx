"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPrompt = Event & { prompt: () => Promise<void> };

/** On Android, offers to install Argus: installed, it appears in every app's Share menu (see manifest.ts). */
export function InstallHint() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    if (!/Android/i.test(navigator.userAgent)) return;
    const offer = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const installed = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!prompt) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4 sm:flex-row sm:items-center">
      <Share2 className="size-5 shrink-0 text-muted-foreground" />
      <p className="flex-1 text-sm leading-relaxed">
        Install Argus to check links, messages and screenshots straight from any app&apos;s Share menu.
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-9 rounded-full"
        onClick={async () => {
          await prompt.prompt().catch(() => {});
          setPrompt(null);
        }}
      >
        Install Argus
      </Button>
    </div>
  );
}
