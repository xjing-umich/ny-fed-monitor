/**
 * resolveStockPagePrice — masthead Price vs valuation consumers.
 * Multi-class (V, BRK.B) / thin / no-floor: keyFact still shows fetched price;
 * strike/DCF only get price when floor.kind === "floor".
 */
import { resolveStockPagePrice } from "./resolveStockPagePrice";
import type { LatestPrice } from "@/lib/managers/priceRead";

function assert(c: boolean, m: string) {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
}

const price: LatestPrice = { close: 350.12, date: "2026-07-10", currency: "USD" };

// Multi-class (per_share_unavailable): keyFact keeps price; valuation gated off
{
  const r = resolveStockPagePrice({ floorKind: "per_share_unavailable", fetched: price });
  assert(r.keyFact === price, "multi-class → keyFact keeps price");
  assert(r.valuation === null, "multi-class → valuation price null");
}

// Thin / no floor: same split
{
  const r = resolveStockPagePrice({ floorKind: undefined, fetched: price });
  assert(r.keyFact === price, "no floor → keyFact keeps price");
  assert(r.valuation === null, "no floor → valuation price null");
}

// Real floor: both paths get the fetched row
{
  const r = resolveStockPagePrice({ floorKind: "floor", fetched: price });
  assert(r.keyFact === price, "floor → keyFact price");
  assert(r.valuation === price, "floor → valuation price");
}

// No row in DB: both null regardless of kind
{
  const r = resolveStockPagePrice({ floorKind: "floor", fetched: null });
  assert(r.keyFact === null && r.valuation === null, "no row → both null");
}

console.log("resolveStockPagePrice.check OK");
