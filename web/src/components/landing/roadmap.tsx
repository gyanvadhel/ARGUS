import { AppWindow, BellRing, Inbox, Smartphone } from "lucide-react";

const ITEMS = [
  { icon: Smartphone, title: "Live call screening", body: "An Android app that screens incoming calls in real time, using the phone network's own caller verification." },
  { icon: Inbox, title: "Gmail and Outlook", body: "Connect your inbox and Argus flags phishing before you open it." },
  { icon: AppWindow, title: "Browser extension", body: "A warning before a malicious page ever loads." },
  { icon: BellRing, title: "Real family alerts", body: "Your trusted contacts get a text the moment something high-risk reaches you." },
];

export function Roadmap() {
  return (
    <section id="roadmap" className="mx-auto max-w-7xl px-6 py-24">
      <h2 className="font-serif text-5xl tracking-tight">Coming next</h2>
      <p className="mt-3 max-w-xl text-muted-foreground">Designed and on the way. Not live yet.</p>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {ITEMS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-5 rounded-3xl border border-dashed border-border p-6">
            <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" />
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-medium">{title}</h3>
                <span className="rounded-full bg-aurora-2/15 px-2.5 py-0.5 text-xs text-aurora-2">Coming soon</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
