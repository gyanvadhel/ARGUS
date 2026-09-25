const ALWAYS_ON = ["Argus scam model", "Scam phrase rules", "Link heuristics", "Domain records (RDAP)", "File inspection"];

export function ProtectionStatus({ sources }: { sources: Record<string, boolean> | null }) {
  if (!sources) {
    return (
      <div className="rounded-2xl border border-risk-high/30 bg-risk-high/10 p-4 text-sm text-risk-high">
        The scanning engine is offline. Run <code className="font-mono">dev.ps1</code> to start it.
      </div>
    );
  }
  const rows = [...ALWAYS_ON.map((name) => [name, true] as const), ...Object.entries(sources)];
  return (
    <ul className="space-y-2.5">
      {rows.map(([name, on]) => (
        <li key={name} className="flex items-center justify-between gap-3 text-sm">
          <span className={on ? "" : "text-muted-foreground"}>{name}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs" style={{ color: on ? "var(--risk-safe)" : "var(--risk-unknown)" }}>
            <span className="size-1.5 rounded-full" style={{ background: on ? "var(--risk-safe)" : "var(--risk-unknown)" }} />
            {on ? "Active" : "Not configured"}
          </span>
        </li>
      ))}
    </ul>
  );
}
