import { describe, it, expect } from "vitest";
import {
  buildMovesPayload,
  parseInvestorNarrative,
  narrativeKey,
  type ManagerDetailLike,
} from "./investorNarrative";

const detail: ManagerDetailLike = {
  manager: { person: "Warren Buffett", name: "Berkshire Hathaway", slug: "berkshire-hathaway" },
  latest: {
    period: "2024 Q4",
    totalValue: 300_000_000_000,
    filedAt: "2025-02-14",
    holdings: [
      { issuer: "APPLE INC", value: 75_000_000_000, weight: 0.25 },
      { issuer: "BANK OF AMERICA", value: 30_000_000_000, weight: 0.1 },
    ],
  },
  changes: [
    { issuer: "OCCIDENTAL PETROLEUM", value: 12_000_000_000, deltaPct: 0.2, kind: "increased" },
    { issuer: "APPLE INC", value: 75_000_000_000, deltaPct: -0.13, kind: "decreased" },
    { issuer: "ULTA BEAUTY", value: 200_000_000, deltaPct: null, kind: "new" },
    { issuer: "PARAMOUNT", value: 0, deltaPct: null, kind: "exited" },
  ],
};

describe("buildMovesPayload", () => {
  it("提炼经理人/季度/组合规模 + 动作(按市值降序, 截断) + top 持仓", () => {
    const p = buildMovesPayload(detail, 10);
    expect(p.person).toBe("Warren Buffett");
    expect(p.name).toBe("Berkshire Hathaway");
    expect(p.period).toBe("2024 Q4");
    expect(p.portfolio_value).toBe(300_000_000_000);
    expect(p.moves[0]).toEqual({ issuer: "APPLE INC", kind: "decreased", delta_pct: -0.13, value: 75_000_000_000 });
    expect(p.moves.map((m) => m.kind)).toContain("new");
    expect(p.moves.map((m) => m.kind)).toContain("exited");
    expect(p.top_holdings[0]).toEqual({ issuer: "APPLE INC", weight: 0.25 });
  });

  it("limit 截断动作数", () => {
    expect(buildMovesPayload(detail, 2).moves).toHaveLength(2);
  });
});

describe("narrativeKey", () => {
  it("拼 page_key", () => {
    expect(narrativeKey("berkshire-hathaway", "2024 Q4", "zh")).toBe("investor:berkshire-hathaway:2024 Q4:zh");
  });
});

describe("parseInvestorNarrative", () => {
  it("解析裸 JSON → 校验 judgment_line + moves", () => {
    const text = JSON.stringify({
      judgment_line: "本季减持苹果约 13%，加仓西方石油。",
      moves: [{ issuer: "APPLE INC", action: "减仓", why: "持续兑现部分科技仓位" }],
      confidence: "medium",
      limitations: ["基于公开 13F，滞后一个季度"],
    });
    const r = parseInvestorNarrative(text);
    expect(r.judgment_line).toContain("苹果");
    expect(r.moves[0]).toEqual({ issuer: "APPLE INC", action: "减仓", why: "持续兑现部分科技仓位" });
    expect(r.confidence).toBe("medium");
  });

  it("解析带 ```json 围栏的输出", () => {
    const text = "```json\n{\"judgment_line\":\"x\",\"moves\":[],\"confidence\":\"low\",\"limitations\":[]}\n```";
    expect(parseInvestorNarrative(text).judgment_line).toBe("x");
  });

  it("非法 confidence 归一为 low", () => {
    const text = JSON.stringify({ judgment_line: "x", moves: [], confidence: "bananas", limitations: [] });
    expect(parseInvestorNarrative(text).confidence).toBe("low");
  });

  it("缺 judgment_line 抛错", () => {
    const text = JSON.stringify({ moves: [], confidence: "low", limitations: [] });
    expect(() => parseInvestorNarrative(text)).toThrow();
  });
});
