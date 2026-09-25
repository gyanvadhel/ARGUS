import { WatchingEye } from "@/components/eye/watching-eye";

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-muted-foreground sm:px-10">
        <div className="flex items-center gap-3 text-foreground">
          <WatchingEye className="h-4 w-6 text-foreground" />
          <span className="font-display text-xl">Argus</span>
        </div>
        <p>Threat data from VirusTotal, abuse.ch, Google Safe Browsing and public domain records.</p>
      </div>
    </footer>
  );
}
