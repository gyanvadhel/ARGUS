import { LevelPill } from "@/components/app/level-pill";
import { WatchingEye } from "@/components/eye/watching-eye";
import type { RiskLevel } from "@/lib/types";

const CHANNELS: { name: string; body: string; subject: string; score: number; level: RiskLevel; note: string }[] = [
  {
    name: "Links",
    body: "Blocklists, Google's phishing database, 70+ antivirus engines, and how old the domain really is.",
    subject: "paypal-security-alert.net/verify",
    score: 80,
    level: "HIGH RISK",
    note: "Mentions PayPal but isn't a PayPal domain",
  },
  {
    name: "Files",
    body: "Fingerprinted and checked against known malware. The file itself never leaves the server.",
    subject: "invoice.pdf.exe",
    score: 60,
    level: "SUSPICIOUS",
    note: "Disguised as .pdf but is actually a .exe program",
  },
  {
    name: "Emails",
    body: "Sender authentication, spoofed display names, reply-to tricks, and every link inside the message.",
    subject: "Final notice: account suspended",
    score: 90,
    level: "HIGH RISK",
    note: "DMARC failed: the sender's domain doesn't vouch for this email",
  },
  {
    name: "Texts",
    body: "Urgency, secrecy, gift cards and fake arrests, read the way a scammer wrote them. Numbers inside are checked too.",
    subject: "Your parcel is held. Call 1 800 555 0142",
    score: 85,
    level: "HIGH RISK",
    note: "Contains a number on the Argus blocklist",
  },
  {
    name: "Calls",
    body: "Unassigned numbers, internet lines, one-ring scam codes, and what other Argus users have reported.",
    subject: "+1 800-555-0142",
    score: 85,
    level: "HIGH RISK",
    note: "Reported tech support scam number",
  },
];

export function Channels() {
  return (
    <section id="watches" className="mx-auto max-w-[1600px] px-6 py-24 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="font-display text-[clamp(2.8rem,6vw,6rem)]">What it watches</h2>
        <p className="max-w-xs text-sm text-muted-foreground">Hover a line to see a real verdict.</p>
      </div>
      <ul className="mt-12 border-t border-border/70">
        {CHANNELS.map((c) => (
          <li key={c.name} tabIndex={0} className="group border-b border-border/70 py-7 outline-none focus-visible:bg-white/2">
            <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              <div className="flex items-center gap-5">
                <WatchingEye className="h-5 w-8 shrink-0" />
                <h3 className="font-display stretch-hover text-6xl text-foreground/85 group-hover:text-foreground group-hover:font-stretch-100% group-focus:font-stretch-100% md:text-8xl">
                  {c.name}
                </h3>
              </div>
              <div>
                <p className="max-w-lg text-lg leading-relaxed text-foreground/65 transition-colors group-hover:text-foreground/90">{c.body}</p>
                <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:grid-rows-[1fr] group-focus:grid-rows-[1fr]">
                  <div className="overflow-hidden">
                    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 px-4 py-3">
                      <span className="font-mono text-xs text-foreground/80">{c.subject}</span>
                      <LevelPill level={c.level} score={c.score} />
                      <span className="text-sm text-muted-foreground">{c.note}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
