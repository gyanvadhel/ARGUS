import { levelMeta } from "@/lib/format";
import type { RiskLevel } from "@/lib/types";

export function LevelPill({ level, score, verified }: { level: RiskLevel; score?: number; verified?: boolean }) {
  const { label, color } = levelMeta(level, verified);
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
