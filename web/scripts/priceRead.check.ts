import { isPriceStale } from "@/lib/managers/priceRead";

function assert(c: boolean, m: string) {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
}

assert(isPriceStale("2026-06-01", new Date("2026-07-04T00:00:00Z"), 10) === true, "33天前的价stale");
assert(isPriceStale("2026-07-02", new Date("2026-07-04T00:00:00Z"), 10) === false, "2天前的价fresh");

console.log("priceRead.check OK");
