/** A Postgres ILIKE pattern that finds the words anywhere, with %, _ and \ matched literally. */
export function likePattern(query: string | undefined): string | null {
  const q = (query ?? "").trim().slice(0, 100);
  if (!q) return null;
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
