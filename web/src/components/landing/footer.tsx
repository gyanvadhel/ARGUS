import Link from "next/link";
import { WatchingEye } from "@/components/eye/watching-eye";

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-muted-foreground sm:px-10">
        <div className="flex items-center gap-3 text-foreground">
          <WatchingEye className="h-4 w-6 text-foreground" />
          <span className="font-display text-xl">Argus</span>
        </div>
        <p>Threat data from URLhaus (abuse.ch), OpenPhish, Phishing.Database, VirusTotal and FCC complaint records.</p>
        <div className="flex items-center gap-6">
          <Link href="/app" className="hover:text-foreground">Android app</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}
