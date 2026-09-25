import Link from "next/link";
import { KIND_META, timeAgo } from "@/lib/format";
import type { ScanRow } from "@/lib/types";
import { LevelPill } from "./level-pill";

type Row = Pick<ScanRow, "id" | "kind" | "input_preview" | "score" | "level" | "created_at">;

export function RecentScans({ rows }: { rows: Row[] }) {
  return (
    <ul className="divide-y divide-border/60">
      {rows.map((r) => {
        const Icon = KIND_META[r.kind].icon;
        return (
          <li key={r.id}>
            <Link href={`/scan/${r.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/[0.03]">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{r.input_preview.split("\n")[0]}</span>
              <LevelPill level={r.level} score={r.score} />
              <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground sm:block">{timeAgo(r.created_at)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
