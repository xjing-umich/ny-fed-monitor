export const LIST_PAGE_SIZE = 25;
export const LIST_Q_MAX = 64;
export const LIST_Q_DEBOUNCE_MS = 200;

export type ListDir = "asc" | "desc";
export type VerdictFilter = "all" | "buying" | "selling" | "mixed";

export type ListParams = {
  q: string;
  sort: string;
  dir: ListDir;
  page: number;
  vf: VerdictFilter;
};

export type ParseOpts = {
  defaultSort: string;
  allowedSorts: string[];
  hasVf: boolean;
};

export function parseListParams(sp: URLSearchParams, opts: ParseOpts): ListParams {
  const rawQ = sp.get("q") ?? "";
  const q = rawQ.slice(0, LIST_Q_MAX);
  const sort = opts.allowedSorts.includes(sp.get("sort") ?? "")
    ? (sp.get("sort") as string)
    : opts.defaultSort;
  const dirRaw = sp.get("dir");
  const dir: ListDir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : "desc";
  const pageNum = Number(sp.get("page"));
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1;
  const vfRaw = sp.get("vf");
  const vf: VerdictFilter =
    opts.hasVf && (vfRaw === "buying" || vfRaw === "selling" || vfRaw === "mixed" || vfRaw === "all")
      ? vfRaw
      : "all";
  return { q, sort, dir, page, vf };
}

export function serializeListParams(
  p: ListParams,
  opts: { defaultSort: string; hasVf: boolean }
): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q.slice(0, LIST_Q_MAX));
  if (p.sort !== opts.defaultSort) sp.set("sort", p.sort);
  if (p.dir !== "desc") sp.set("dir", p.dir);
  if (p.page !== 1) sp.set("page", String(p.page));
  if (opts.hasVf && p.vf !== "all") sp.set("vf", p.vf);
  return sp.toString();
}

export function clampPage(page: number, pageCount: number): number {
  if (pageCount <= 0) return 1;
  return Math.min(Math.max(1, page), pageCount);
}

/** Header click: same field toggles dir; new field → desc. */
export function nextSortState(
  currentSort: string,
  currentDir: ListDir,
  clickedSort: string
): { sort: string; dir: ListDir } {
  if (clickedSort === currentSort) {
    return { sort: currentSort, dir: currentDir === "desc" ? "asc" : "desc" };
  }
  return { sort: clickedSort, dir: "desc" };
}
