// Render's free engine falls asleep after 15 idle minutes; pinging every 10 while someone browses keeps it awake.
export const WARM_EVERY_MS = 10 * 60 * 1000;

export function shouldWarm(lastPing: number | null, now: number): boolean {
  return lastPing === null || !Number.isFinite(lastPing) || now - lastPing >= WARM_EVERY_MS;
}
