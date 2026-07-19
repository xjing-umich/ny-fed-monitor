import { INVESTOR_ALIASES } from "../../lib/investorAliases";
import { cleanIssuer } from "../../lib/format";
import { LIST_PAGE_SIZE } from "./listQuery";
import type { ListDir } from "./listQuery";

export type InvestorSearchRow = {
  slug: string;
  person: string;
  name: string;
};

export function filterInvestors<T extends InvestorSearchRow>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((m) => {
    const alias = (INVESTOR_ALIASES[m.slug] ?? "").toLowerCase();
    return (
      m.person.toLowerCase().includes(needle) ||
      m.name.toLowerCase().includes(needle) ||
      m.slug.toLowerCase().includes(needle) ||
      alias.includes(needle)
    );
  });
}

export type StockSearchRow = {
  ticker: string;
  issuer: string;
};

export function filterStocks<T extends StockSearchRow>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) =>
      r.ticker.toLowerCase().includes(needle) ||
      cleanIssuer(r.issuer).toLowerCase().includes(needle) ||
      r.issuer.toLowerCase().includes(needle)
  );
}

export function sortByKey<T>(
  rows: T[],
  sort: string,
  dir: ListDir,
  getters: Record<string, (row: T) => number>
): T[] {
  const get = getters[sort];
  if (!get) return [...rows];
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const d = get(a) - get(b);
    if (d !== 0) return d * mul;
    return 0;
  });
}

export type SliceMode = "desktop" | "mobile";

export function visibleSlice<T>(rows: T[], page: number, mode: SliceMode): T[] {
  const p = Math.max(1, page);
  if (mode === "mobile") return rows.slice(0, p * LIST_PAGE_SIZE);
  const start = (p - 1) * LIST_PAGE_SIZE;
  return rows.slice(start, start + LIST_PAGE_SIZE);
}

export function pageCount(total: number): number {
  if (total <= 0) return 0;
  return Math.ceil(total / LIST_PAGE_SIZE);
}
