import { describe, it, expect } from "vitest";
import { padCusip, parseMappingResult, normalizeTicker, type MappingResultItem } from "./openfigi";

describe("padCusip", () => {
  it("补足 9 位前导零", () => {
    expect(padCusip("37833100")).toBe("037833100"); // Apple, 缺 1 位
  });
  it("已是 9 位则原样返回", () => {
    expect(padCusip("191216100")).toBe("191216100"); // Coca-Cola
  });
});

describe("normalizeTicker", () => {
  it("斜杠类别股 → 点号(BRK/B → BRK.B)", () => {
    expect(normalizeTicker("BRK/B")).toBe("BRK.B");
  });
  it("无斜杠原样", () => {
    expect(normalizeTicker("AAPL")).toBe("AAPL");
  });
});

describe("parseMappingResult", () => {
  it("取第一条 data 的 ticker/name/exchCode/figi", () => {
    const item: MappingResultItem = {
      data: [
        { ticker: "AAPL", name: "APPLE INC", exchCode: "US", figi: "BBG000B9XRY4", securityType: "Common Stock" },
      ],
    };
    expect(parseMappingResult("37833100", "APPLE INC", item)).toEqual({
      cusip: "37833100",
      ticker: "AAPL",
      name: "APPLE INC",
      exchange: "US",
      figi: "BBG000B9XRY4",
      resolved: true,
    });
  });
  it("warning(无匹配)→ resolved false, ticker null, 保留 issuer 名", () => {
    const item: MappingResultItem = { warning: "No identifier found." };
    expect(parseMappingResult("999999999", "OBSCURE FUND", item)).toEqual({
      cusip: "999999999",
      ticker: null,
      name: "OBSCURE FUND",
      exchange: null,
      figi: null,
      resolved: false,
    });
  });
});
