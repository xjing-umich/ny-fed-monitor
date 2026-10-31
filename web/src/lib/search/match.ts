import type { SearchItem, SearchResult } from "./types";
export function matchSearch(
  items: SearchItem[],
  query: string,
): SearchResult[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return [];
  return items
    .filter((item) =>
      (item.label + " " + (item.keywords ?? ""))
        .toLowerCase()
        .replace(/\s+/g, " ")
        .includes(q),
    )
    .map((item) => ({ item, score: rank(item, q) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(
      ({ item }): SearchResult => ({
        ...item,
        kind: item.href.includes("/investors/") ? "investor" : "company",
      }),
    )
    .sort((a, b) => a.kind.localeCompare(b.kind));
}
function rank(item: SearchItem, q: string) {
  if (decodeURIComponent(item.href.split("/").at(-1) ?? "").toLowerCase() === q)
    return 3;
  const label = item.label.toLowerCase().replace(/\s+/g, " ");
  return label === q ? 2 : label.startsWith(q) ? 1 : 0;
}
export function nextSearchOption(
  current: number,
  direction: 1 | -1,
  length: number,
): number {
  if (!length) return -1;
  return current < 0
    ? direction === 1
      ? 0
      : length - 1
    : (current + direction + length) % length;
}
