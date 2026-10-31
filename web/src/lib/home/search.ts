import type { SearchItem } from "@/components/shell/SearchBox";
export type LandingMatch = SearchItem & { kind: "company" | "investor" };
export function landingMatches(
  items: SearchItem[],
  query: string,
): LandingMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items
    .filter((item) =>
      (item.label + " " + (item.keywords ?? "")).toLowerCase().includes(q),
    )
    .map((item) => ({
      ...item,
      kind: item.href.includes("/investors/")
        ? ("investor" as const)
        : ("company" as const),
    }))
    .sort((a, b) => score(b, q) - score(a, q))
    .slice(0, 8)
    .sort((a, b) => a.kind.localeCompare(b.kind));
}
function score(item: SearchItem, q: string): number {
  if (decodeURIComponent(item.href.split("/").at(-1) ?? "").toLowerCase() === q)
    return 3;
  if (item.label.toLowerCase() === q) return 2;
  return item.label.toLowerCase().startsWith(q) ? 1 : 0;
}
