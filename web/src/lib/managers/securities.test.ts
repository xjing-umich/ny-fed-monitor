import { describe, it, expect } from "vitest";
import { rowsToCusipMap, type CusipMapRow } from "./securities";

describe("rowsToCusipMap", () => {
  it("把行映射为 cusip → {ticker,name}", () => {
    const rows: CusipMapRow[] = [
      { cusip: "37833100", ticker: "AAPL", issuer: "APPLE INC" },
      { cusip: "999999999", ticker: null, issuer: "OBSCURE FUND" },
    ];
    const m = rowsToCusipMap(rows);
    expect(m.get("37833100")).toEqual({ ticker: "AAPL", name: "APPLE INC" });
    expect(m.get("999999999")).toEqual({ ticker: null, name: "OBSCURE FUND" });
  });
});
