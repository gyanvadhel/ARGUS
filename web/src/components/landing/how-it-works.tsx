import { LevelPill } from "@/components/app/level-pill";

const STEPS = [
  { title: "Paste or drop anything", body: "A link, an email, a text, a phone number or a file. Argus works out what it is." },
  { title: "Every source at once", body: "The relevant intelligence sources are asked in parallel. A slow one never holds up your answer." },
  { title: "One honest verdict", body: "A 0–100 risk score, the evidence behind it, and what to do next." },
];

// A verdict the engine really returns for this link (live DNS included).
const PREVIEW = [
  { source: "Argus threat intel", summary: "Fake PayPal security alert domain", color: "var(--risk-high)" },
  { source: "Argus heuristics", summary: "Mentions PayPal but isn't an official PayPal domain", color: "var(--risk-sus)" },
  { source: "Domain check (DNS)", summary: "This domain doesn't exist: the link is fake or already taken down", color: "var(--risk-sus)" },
  { source: "Phishing.Database", summary: "Not on its list of known phishing domains", color: "var(--risk-safe)" },
  { source: "VirusTotal", summary: "No record of this link yet", color: "var(--risk-unknown)" },
];

export function HowItWorks() {
  return (
    <section className="mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-16 px-6 py-28 sm:px-10 lg:grid-cols-2">
      <div>
        <h2 className="font-display text-[clamp(2.8rem,6vw,6rem)]">
          Evidence,
          <br />
          not guesswork.
        </h2>
        <ol className="mt-12 space-y-9">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-6">
              <span className="font-display w-10 shrink-0 text-5xl text-foreground/30">{i + 1}</span>
              <div>
                <h3 className="text-lg font-medium">{s.title}</h3>
                <p className="mt-1 max-w-md text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <figure className="rounded-[2rem] border border-border/70 p-6 sm:p-9">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <figcaption className="text-sm text-muted-foreground">A real verdict</figcaption>
            <p className="mt-2 break-all font-mono text-sm text-foreground/80">http://paypal-security-alert.net/verify</p>
          </div>
          <div className="text-right">
            <p className="font-display text-8xl leading-none text-risk-high">99</p>
            <div className="mt-3">
              <LevelPill level="HIGH RISK" />
            </div>
          </div>
        </div>
        <ul className="mt-9 divide-y divide-border/60 border-y border-border/60">
          {PREVIEW.map((p) => (
            <li key={p.source} className="flex items-start gap-4 py-3.5 sm:items-center">
              <span className="mt-1.5 size-2 shrink-0 rounded-full sm:mt-0" style={{ background: p.color }} />
              {/* Phones stack the source over its finding; wider screens keep one line per source. */}
              <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
                <p className="text-sm font-medium sm:w-44 sm:shrink-0">{p.source}</p>
                <p className="mt-0.5 text-sm text-muted-foreground sm:mt-0 sm:truncate">{p.summary}</p>
              </div>
            </li>
          ))}
        </ul>
      </figure>
    </section>
  );
}
