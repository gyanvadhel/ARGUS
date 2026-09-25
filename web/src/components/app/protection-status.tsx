import { timeAgo } from "@/lib/format";
import type { FeedStatus } from "@/lib/types";

const BUILT_IN = [
  "Scam model",
  "Phrase rules",
  "Link rules",
  "Look-alike check",
  "Live page check",
  "Domain age",
  "Sender checks",
  "Number validation",
  "FCC complaints",
  "File inspection",
];

const FEED_NAMES: Record<string, string> = {
  urlhaus: "URLhaus malware links",
  openphish: "OpenPhish phishing pages",
  phishing_db: "Phishing.Database domains",
  tranco: "Tranco most visited sites",
};

function Dot({ on }: { on: boolean }) {
  const color = on ? "var(--risk-safe)" : "var(--risk-unknown)";
  return <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: color }} />;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-xs text-muted-foreground">{title}</p>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

export function ProtectionStatus({
  sources,
  feeds,
  hosted = false,
}: {
  sources: Record<string, boolean> | null;
  feeds?: Record<string, FeedStatus> | null;
  /** A hosted engine on a free plan sleeps when idle; this page load has just woken it. */
  hosted?: boolean;
}) {
  if (!sources) {
    return hosted ? (
      <div className="rounded-2xl border border-border/70 p-4 text-sm text-muted-foreground">
        The scanning engine is waking up: free hosting sleeps when nobody has used it for a while. Refresh in a few seconds.
      </div>
    ) : (
      <div className="rounded-2xl border border-risk-high/30 bg-risk-high/10 p-4 text-sm text-risk-high">
        The scanning engine is offline. Run <code className="font-mono">dev.ps1</code> to start it.
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {feeds && (
        <Group title="Live threat feeds">
          {Object.entries(feeds).map(([key, f]) => {
            const on = f.fetched_at != null;
            return (
              <li key={key} className="flex gap-3 text-sm">
                <Dot on={on} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={on ? "" : "text-muted-foreground"}>{FEED_NAMES[key] ?? f.label}</span>
                    {on && <span className="shrink-0 font-mono text-xs tabular-nums">{f.count.toLocaleString()}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {on
                      ? `Updated ${timeAgo(new Date(f.fetched_at! * 1000).toISOString())}`
                      : f.error ? "Download failed, retrying soon" : "Downloading"}
                  </p>
                </div>
              </li>
            );
          })}
        </Group>
      )}
      <div>
        <p className="mb-2.5 text-xs text-muted-foreground">Built in, always on</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
          {BUILT_IN.map((name) => (
            <li key={name} className="flex gap-2.5 text-sm">
              <Dot on />
              <span>{name}</span>
            </li>
          ))}
        </ul>
      </div>
      <Group title="Extra services">
        {Object.entries(sources).map(([name, on]) => (
          <li key={name} className="flex gap-3 text-sm">
            <Dot on={on} />
            <span className={on ? "flex-1" : "flex-1 text-muted-foreground"}>{name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{on ? "Active" : "Not set up"}</span>
          </li>
        ))}
      </Group>
    </div>
  );
}
