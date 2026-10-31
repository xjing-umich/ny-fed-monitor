import { DATA_DRIVEN_PATHS, DATA_DRIVEN_ROUTE_HANDLERS, publicationPath } from "./paths";
/** Concrete rewrite destinations: invalidating /stocks/T alone misses the /en cache. */
export function parseTickers(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 500 ||
    value.some(
      (t) => typeof t !== "string" || !/^[A-Za-z]{1,6}(\.[A-Za-z])?$/.test(t),
    )
  )
    throw new Error("Invalid ticker list");
  return [...new Set(value.map((t) => t.toUpperCase()))];
}
export function targetedPaths(
  tickers: string[],
  aggregates: boolean,
): string[] {
  const stockPaths = tickers.flatMap((t) => [
    `/en/stocks/${t}`,
    `/zh/stocks/${t}`,
    `/api/sec/company/${t}`,
  ]);
  const aggregatePaths = aggregates
    ? DATA_DRIVEN_PATHS.filter((p) => p !== "/[lang]/stocks/[ticker]")
    : [];
  return [
    ...new Set([
      ...stockPaths,
      ...aggregatePaths,
      "/api/sec/fundamentals/latest",
      ...DATA_DRIVEN_ROUTE_HANDLERS,
    ]),
  ];
}

/** Proof refresh accepts concrete public pages only, under the existing ingest authorization. */
export function parsePublicationPaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length===0 || value.length>500) throw new Error("Invalid publication path list");
  return [...new Set(value.map(path=>publicationPath(path)))];
}
export function publicationRevalidationPaths(paths: string[]): string[] {
  return [...new Set(paths.map(path=> {
    const url = new URL(publicationPath(path), "https://publication.invalid");
    let pathname = url.pathname;
    // Next's public query rewrites have separate static cache entries. Revalidating
    // the bare screener leaves these variants stale; mirror next.config's precedence.
    if (/^\/(?:zh\/)?stocks\/screener$/.test(pathname)) {
      const view = url.searchParams.get("view");
      const holders = url.searchParams.get("sort") === "holders";
      const variant = holders && ["all", "strike_zone", "below"].includes(view ?? "")
        ? `${view}-holders`
        : ["strike_zone", "below", "conviction"].includes(view ?? "")
          ? view : holders ? "all-holders" : null;
      if (variant) pathname += `/${variant}`;
    }
    return pathname==="/zh" || pathname.startsWith("/zh/") ? pathname : pathname==="/" ? "/en" : `/en${pathname}`;
  }))];
}
