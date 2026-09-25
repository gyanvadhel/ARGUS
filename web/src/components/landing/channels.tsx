import { LevelPill } from "@/components/app/level-pill";
import { WatchingEye } from "@/components/eye/watching-eye";
import type { RiskLevel } from "@/lib/types";

const CHANNELS: { name: string; body: string; subject: string; score: number; level: RiskLevel; note: string }[] = [
  {
    name: "Links",
    body: "Live phishing and malware feeds, look-alikes of famous sites, and a safe visit to the page itself: where it redirects and what it asks for.",
    subject: "paypal-security-alert.net/verify",
    score: 98,
    level: "HIGH RISK",
    note: "Mentions PayPal but isn't a PayPal domain",
  },
  {
    name: "Files",
    body: "Fingerprinted and checked against 70+ antivirus engines. The file itself never leaves the server.",
    subject: "invoice.pdf.exe",
    score: 60,
    level: "SUSPICIOUS",
    note: "Disguised as .pdf but is actually a .exe program",
  },
  {
    name: "Emails",
    body: "Sender authentication, spoofed display names, reply-to tricks, and every link inside the message.",
    subject: "Final notice: account suspended",
    score: 100,
    level: "HIGH RISK",
    note: "SPF fail: the sending server isn't authorized to send for this domain",
  },
  {
    name: "Texts",
    body: "Urgency, secrecy, gift cards and fake arrests, read the way a scammer wrote them. Links and numbers inside are checked too.",
    subject: "Your Google listing will be removed. Call 1-877-556-9255",
    score: 90,
    level: "HIGH RISK",
    note: "That number is reported to the FCC for robocalls",
  },
  {
    name: "Calls",
    body: "Numbers that can't exist, internet lines, one-ring scam codes, complaints filed with the FCC, and what Argus users report.",
    subject: "+1 877-556-9255",
    score: 90,
    level: "HIGH RISK",
    note: "Reported to the FCC for robocalls about Google listings",
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
