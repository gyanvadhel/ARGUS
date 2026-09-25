import { LEVEL_META } from "@/lib/format";
import type { RiskLevel } from "@/lib/types";

export function LevelPill({ level, score }: { level: RiskLevel; score?: number }) {
  const { label, color } = LEVEL_META[level] ?? LEVEL_META.UNVERIFIED;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {label}
      {score !== undefined && <span className="font-mono opacity-70">{score}</span>}
    </span>
  );
}
