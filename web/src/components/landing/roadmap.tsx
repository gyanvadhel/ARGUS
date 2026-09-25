const ITEMS = [
  { title: "Live call screening", body: "An Android app that screens incoming calls as they ring, using the phone network's own caller verification." },
  { title: "Outlook inbox", body: "Gmail already connects today. Outlook is next, so phishing gets flagged there before you open it too." },
  { title: "Real family alerts", body: "Your trusted contacts get a text the moment something high-risk reaches you." },
  { title: "Extension in the stores", body: "The Argus browser extension works today in developer mode. One-click install from the Chrome Web Store and Edge Add-ons is next." },
];

export function Roadmap() {
  return (
    <section id="next" className="mx-auto max-w-[1600px] px-6 py-24 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="font-display text-[clamp(2.8rem,6vw,6rem)]">Coming next</h2>
        <p className="max-w-xs text-sm text-muted-foreground">Designed and on the way. Not live yet.</p>
      </div>
      <ul className="mt-12 grid border-t border-border/70 sm:grid-cols-2">
        {ITEMS.map((item, i) => (
          <li key={item.title} className={`border-b border-border/70 py-8 sm:px-8 ${i % 2 === 0 ? "sm:border-r sm:pl-0" : ""}`}>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-medium">{item.title}</h3>
              <span className="rounded-full border border-dashed border-foreground/30 px-2.5 py-0.5 text-xs text-muted-foreground">Coming soon</span>
            </div>
            <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
