import { describe, it, expect } from "vitest";
import { computeMostHeld, computeNotableMoves, type ScanRow } from "@/lib/aggregations";

const scan: ScanRow[] = [
  { slug: "a", person: "A", holdings: [
      { cusip: "X", issuer: "XCorp", value: 100, shares: 10, weight: 0.5 },
      { cusip: "Y", issuer: "YCorp", value: 50, shares: 5 },
    ], changes: [
      { cusip: "X", issuer: "XCorp", kind: "new", prevShares: 0, shares: 10, value: 100, deltaPct: null },
    ] },
  { slug: "b", person: "B", holdings: [
      { cusip: "X", issuer: "XCorp", value: 200, shares: 20, weight: 0.8 },
    ], changes: [
      { cusip: "X", issuer: "XCorp", kind: "increased", prevShares: 5, shares: 20, value: 200, deltaPct: 3 },
      { cusip: "Y", issuer: "YCorp", kind: "exited", prevShares: 7, shares: 0, value: 0, deltaPct: null },
    ] },
];

describe("computeMostHeld", () => {
  it("ranks by holder count then total value", () => {
    const r = computeMostHeld(scan, 10);
    expect(r[0]).toMatchObject({ cusip: "X", issuer: "XCorp", holderCount: 2, totalValue: 300 });
    expect(r[1]).toMatchObject({ cusip: "Y", holderCount: 1, totalValue: 50 });
  });
});

describe("computeNotableMoves", () => {
  it("counts buyers (new/increased) and sellers (exited/decreased) per cusip", () => {
    const r = computeNotableMoves(scan, 10);
    expect(r.mostBought[0]).toMatchObject({ cusip: "X", issuer: "XCorp", count: 2 });
    expect(r.mostSold[0]).toMatchObject({ cusip: "Y", issuer: "YCorp", count: 1 });
  });
});
