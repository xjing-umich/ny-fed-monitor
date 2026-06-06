import { describe, it, expect } from "vitest";
import { computeConsensus, type ScanInput } from "./compute";

const cusipToTicker = new Map<string, { ticker: string | null; name: string | null }>([
  ["C1", { ticker: "AAA", name: "Alpha Inc" }],
  ["C2", { ticker: "BBB", name: "Beta Inc" }],
  ["C3", { ticker: null, name: "Unmapped Co" }],
]);

const scan: ScanInput[] = [
  { slug: "m1", holdings: [{ cusip: "C1", issuer: "Alpha Inc", value: 100 }, { cusip: "C2", issuer: "Beta Inc", value: 50 }],
    changes: [{ cusip: "C1", issuer: "Alpha Inc", kind: "new", value: 100 }] },
  { slug: "m2", holdings: [{ cusip: "C1", issuer: "Alpha Inc", value: 200 }],
    changes: [{ cusip: "C1", issuer: "Alpha Inc", kind: "increased", value: 200 }, { cusip: "C2", issuer: "Beta Inc", kind: "exited", value: 0 }] },
];

describe("computeConsensus", () => {
  it("most-held 按 ticker 聚合持有人数与市值", () => {
    const { holdings } = computeConsensus(scan, cusipToTicker);
    const aaa = holdings.find((h) => h.ticker === "AAA");
    expect(aaa).toEqual({ ticker: "AAA", issuer: "Alpha Inc", holder_count: 2, total_value: 300 });
    const bbb = holdings.find((h) => h.ticker === "BBB");
    expect(bbb?.holder_count).toBe(1);
  });
  it("未解析 cusip 用 cusip 作兜底 ticker 键", () => {
    const scan2: ScanInput[] = [{ slug: "m", holdings: [{ cusip: "C3", issuer: "Unmapped Co", value: 10 }], changes: [] }];
    const { holdings } = computeConsensus(scan2, cusipToTicker);
    expect(holdings[0]).toEqual({ ticker: "C3", issuer: "Unmapped Co", holder_count: 1, total_value: 10 });
  });
  it("moves 按方向聚合: new/increased→bought, exited/decreased→sold", () => {
    const { moves } = computeConsensus(scan, cusipToTicker);
    const bought = moves.find((m) => m.ticker === "AAA" && m.direction === "bought");
    expect(bought).toEqual({ ticker: "AAA", direction: "bought", issuer: "Alpha Inc", manager_count: 2, net_value: 300 });
    const sold = moves.find((m) => m.ticker === "BBB" && m.direction === "sold");
    expect(sold?.manager_count).toBe(1);
  });
});
