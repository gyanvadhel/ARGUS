import { LevelPill } from "@/components/app/level-pill";

const STEPS = [
  { title: "Paste or drop anything", body: "A link, an email, a text, a phone number or a file. Argus works out what it is." },
  { title: "Every source, at once", body: "The relevant intelligence sources are asked in parallel. A slow one never holds up your answer." },
  { title: "One honest verdict", body: "A 0–100 risk score, the evidence behind it, and what to do next." },
];

const PREVIEW = [
  { source: "Google Safe Browsing", summary: "Google flags this as phishing", color: "var(--risk-high)" },
  { source: "Argus heuristics", summary: "Mentions PayPal but isn't a PayPal domain", color: "var(--risk-sus)" },
  { source: "Domain records", summary: "Domain registered only 3 days ago", color: "var(--risk-sus)" },
  { source: "VirusTotal", summary: "11 of 94 security vendors flag this link", color: "var(--risk-high)" },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto grid max-w-7xl items-center gap-16 px-6 py-24 lg:grid-cols-2">
      <div>
        <h2 className="font-serif text-5xl leading-tight tracking-tight">Evidence, not guesswork.</h2>
        <ol className="mt-10 space-y-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border font-serif text-lg text-aurora-2">{i + 1}</span>
              <div>
                <h3 className="text-lg font-medium">{s.title}</h3>
                <p className="mt-1 max-w-md text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <figure className="glass rounded-[2rem] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <figcaption className="text-sm text-muted-foreground">Example verdict</figcaption>
            <p className="mt-2 break-all font-mono text-sm text-foreground/80">http://paypal-security-alert.net/verify</p>
          </div>
          <div className="text-right">
            <p className="font-serif text-7xl leading-none text-risk-high">92</p>
            <div className="mt-2"><LevelPill level="HIGH RISK" /></div>
          </div>
        </div>
        <ul className="mt-8 space-y-2.5">
          {PREVIEW.map((p) => (
            <li key={p.source} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-white/[0.02] px-4 py-3">
              <span className="size-2 shrink-0 rounded-full" style={{ background: p.color, boxShadow: `0 0 12px ${p.color}` }} />
              <span className="w-44 shrink-0 text-sm font-medium">{p.source}</span>
              <span className="truncate text-sm text-muted-foreground">{p.summary}</span>
            </li>
          ))}
        </ul>
      </figure>
    </section>
  );
}
