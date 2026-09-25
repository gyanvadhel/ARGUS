import type { Community, CommunityReport } from "./types";

/** Fold raw phone reports into the community picture the scanner and the Caller ID card use. */
export function summarizeCommunity(reports: CommunityReport[], sightings: number, now = Date.now()): Community {
  const categories: Record<string, number> = {};
  const names = new Map<string, { label: string; votes: number }>();
  let latest = -Infinity;

  for (const r of reports) {
    categories[r.category] = (categories[r.category] ?? 0) + 1;
    const tag = r.name_tag?.trim();
    if (tag) {
      const key = tag.toLowerCase().replace(/\s+/g, " ");
      const entry = names.get(key) ?? { label: tag, votes: 0 };
      entry.votes += 1;
      names.set(key, entry);
    }
    latest = Math.max(latest, new Date(r.created_at).getTime());
  }

  const top = [...names.values()].sort((a, b) => b.votes - a.votes)[0];
  return {
    reports: reports.length,
    categories,
    name: top?.label ?? null,
    name_votes: top?.votes ?? 0,
    last_report_days: reports.length ? Math.max(0, (now - latest) / 864e5) : null,
    sightings,
  };
}
