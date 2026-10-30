import { DATA_DRIVEN_PATHS, DATA_DRIVEN_ROUTE_HANDLERS } from "./paths";
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
