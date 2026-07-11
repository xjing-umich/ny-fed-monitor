import type { LatestPrice } from "@/lib/managers/priceRead";

/**
 * Split fetched market price for the stock page:
 * - keyFact: always the fetched row (multi-class / thin / no-floor still show Price)
 * - valuation: only when a real per-share floor exists (strike / DCF / reconcile)
 */
export function resolveStockPagePrice(args: {
  floorKind: string | undefined;
  fetched: LatestPrice | null;
}): { keyFact: LatestPrice | null; valuation: LatestPrice | null } {
  const { floorKind, fetched } = args;
  return {
    keyFact: fetched,
    valuation: floorKind === "floor" ? fetched : null,
  };
}
