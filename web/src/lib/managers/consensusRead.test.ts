import { describe, it, expect } from "vitest";
import { mapHeldRows, mapMoveRows } from "./consensusRead";

describe("consensusRead mappers", () => {
  it("held 行→HeldRow(ticker 作 key)", () => {
    expect(mapHeldRows([{ ticker: "AAPL", issuer: "APPLE INC", holder_count: 5, total_value: 999 }])).toEqual([
      { cusip: "AAPL", issuer: "APPLE INC", holderCount: 5, totalValue: 999 },
    ]);
  });
  it("move 行→按方向拆 mostBought/mostSold", () => {
    const { mostBought, mostSold } = mapMoveRows([
      { ticker: "AAPL", direction: "bought", issuer: "APPLE INC", manager_count: 3, net_value: 100 },
      { ticker: "XOM", direction: "sold", issuer: "EXXON", manager_count: 2, net_value: 50 },
    ]);
    expect(mostBought).toEqual([{ cusip: "AAPL", issuer: "APPLE INC", count: 3, value: 100 }]);
    expect(mostSold).toEqual([{ cusip: "XOM", issuer: "EXXON", count: 2, value: 50 }]);
  });
});
