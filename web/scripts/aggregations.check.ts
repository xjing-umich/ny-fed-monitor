import { computeMostHeld, computeNotableMoves, computeHolderDeltas } from "@/lib/aggregations";

function assert(c: boolean, m: string) {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
}

const scan = [
  {
    slug: "s",
    person: "S",
    period: "2026-03-31",
    holdings: [
      { cusip: "X", issuer: "XX", value: 9e8, shares: 1, weight: 1, putCall: "Put" } as any,
      { cusip: "Y", issuer: "YY", value: 1e8, shares: 1, weight: 0.1 } as any,
    ],
    changes: [
      { cusip: "X", issuer: "XX", kind: "new", value: 9e8, putCall: "Put" } as any,
      { cusip: "Y", issuer: "YY", kind: "new", value: 1e8 } as any,
    ],
  },
] as any;

const held = computeMostHeld(scan, 10);
assert(!held.find((h) => h.cusip === "X"), "put 不计入 most-held");
assert(!!held.find((h) => h.cusip === "Y"), "普通股保留 in most-held");

const moves = computeNotableMoves(scan, 10);
assert(!moves.mostBought.find((m) => m.cusip === "X"), "put 不计入 notable-moves(mostBought)");
assert(!!moves.mostBought.find((m) => m.cusip === "Y"), "普通股保留 in notable-moves(mostBought)");

const deltas = computeHolderDeltas(scan);
assert(!deltas.has("X"), "put 不计入 holder-deltas");
assert(deltas.get("Y") === 1, "普通股保留 in holder-deltas");

console.log("aggregations.check OK");
