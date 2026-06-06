import { describe, it, expect } from "vitest";
import { parseQuote, type FinnhubQuote } from "./finnhub";

describe("parseQuote", () => {
  it("取 c(当前价) + t(时间戳)→交易日(UTC)", () => {
    const q: FinnhubQuote = { c: 307.36, t: 1780689600, d: -3.87, dp: -1.24, h: 315, l: 307, o: 312, pc: 311 };
    expect(parseQuote(q)).toEqual({ close: 307.36, date: "2026-06-05" });
  });
  it("c=0 或缺失 → null(无效报价, 跳过)", () => {
    expect(parseQuote({ c: 0, t: 1780689600 } as FinnhubQuote)).toBeNull();
    expect(parseQuote({} as FinnhubQuote)).toBeNull();
  });
});
