import { isPriceStale, PRICE_MAX_AGE_DAYS } from "@/lib/valuation/priceAge";

function assert(c: boolean, m: string) {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
}

assert(isPriceStale("2026-06-01", new Date("2026-07-04T00:00:00Z"), PRICE_MAX_AGE_DAYS) === true, "33天前的价stale");
assert(isPriceStale("2026-07-02", new Date("2026-07-04T00:00:00Z"), PRICE_MAX_AGE_DAYS) === false, "2天前的价fresh");
assert(isPriceStale("2026-06-23", new Date("2026-07-04T00:00:00Z")) === true, "11天前 > PRICE_MAX_AGE_DAYS → stale");
assert(isPriceStale("2026-06-24", new Date("2026-07-04T00:00:00Z")) === false, "10天前 = 边界仍 fresh(> 才 stale)");

console.log("priceRead.check OK");
