import { KIND_META } from "@/lib/format";
import type { DashboardStats } from "@/lib/stats";

export function KindBreakdown({ data }: { data: DashboardStats["byKind"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="space-y-4">
      {data.map(({ kind, count, threats }) => {
        const { label, icon: Icon } = KIND_META[kind];
        return (
          <li key={kind}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><Icon className="size-4 text-muted-foreground" />{label}</span>
              <span className="text-xs text-muted-foreground">
                {count} scanned, <span className={threats ? "text-foreground" : ""}>{threats} threats</span>
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${(count / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
