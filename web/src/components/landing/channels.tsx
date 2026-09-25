import { FileText, Globe, Mail, MessageSquareText, Phone } from "lucide-react";

const CHANNELS = [
  { icon: Globe, title: "Links", body: "Blocklists, Google's phishing database, 70+ antivirus engines, and how old the domain really is.", sources: ["URLhaus", "Safe Browsing", "VirusTotal", "Domain records"] },
  { icon: FileText, title: "Files", body: "Argus fingerprints the file and checks it against known malware. The file itself never leaves our server.", sources: ["VirusTotal", "MalwareBazaar", "File inspection"] },
  { icon: Mail, title: "Emails", body: "Sender authentication, spoofed display names, reply-to tricks, and every link inside the message.", sources: ["SPF", "DKIM", "DMARC"] },
  { icon: MessageSquareText, title: "Texts", body: "Reads a message the way a scammer wrote it: urgency, secrecy, gift cards, threats of arrest.", sources: ["Argus model", "Scam phrases"] },
  { icon: Phone, title: "Calls", body: "Is the number real, is it an internet line, is it blocklisted, and have other Argus users reported it?", sources: ["Number validation", "Community reports"] },
];

export function Channels() {
  return (
    <section id="channels" className="mx-auto max-w-7xl px-6 py-24">
      <h2 className="max-w-4xl text-balance font-serif text-5xl leading-tight tracking-tight">Scams reach you five ways. Argus watches all of them.</h2>
      <ul className="mt-14 border-t border-border/70">
        {CHANNELS.map(({ icon: Icon, title, body, sources }) => (
          <li key={title} className="grid gap-4 border-b border-border/70 py-8 md:grid-cols-[14rem_1fr_18rem] md:items-baseline md:gap-10">
            <h3 className="flex items-center gap-3 font-serif text-4xl">
              <Icon className="size-5 shrink-0 -translate-y-0.5 text-aurora-2" />
              {title}
            </h3>
            <p className="max-w-xl leading-relaxed text-muted-foreground">{body}</p>
            <p className="text-sm text-foreground/70">{sources.join(", ")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
