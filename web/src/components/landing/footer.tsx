import { Logo } from "@/components/brand/logo";

export function Footer() {
  return (
    <footer className="border-t border-border/50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Logo className="size-5" />
          <span className="font-serif text-lg text-foreground">Argus</span>
        </div>
        <p>Threat data from VirusTotal, abuse.ch, Google Safe Browsing and public domain records.</p>
      </div>
    </footer>
  );
}
