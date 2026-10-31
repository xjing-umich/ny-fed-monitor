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
    .sort((a, b) => a.kind.localeCompare(b.kind))
    .slice(0, 8);
}
