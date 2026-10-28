/** Run: cd web && npx tsx src/lib/reports/build.check.ts */
import { buildQuarterlyReport } from "./build";
import { factorLookup } from "../managers/splitAdjust";
import type { ReportHolding, ReportInput, ReportManagerInput } from "./types";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}
const h = (cusip: string, shares: number, weight: number, issuer = cusip, putCall: string | null = null): ReportHolding =>
  ({ cusip, issuer, value: shares * 10, shares, weight, putCall });
const mgr = (slug: string, current: ReportHolding[] | null, prior: ReportHolding[] | null): ReportManagerInput =>
  ({ slug, person: slug.toUpperCase(), personZh: null, current, prior });

const cusipMap = new Map([
  ["C_AAPL", { ticker: "AAPL", name: "APPLE INC" }],
  ["C_GOOG", { ticker: "GOOG", name: "ALPHABET INC" }],
  ["C_KO", { ticker: "KO", name: "COCA COLA CO" }],
  // C_UNRES 故意不在表里 → ticker null
]);

const base: ReportInput = {
  period: "2026-09-30",
  managers: [
    // a: 加仓 AAPL、新建 GOOG、清仓 KO
    mgr("a", [h("C_AAPL", 200, 0.6), h("C_GOOG", 50, 0.4)], [h("C_AAPL", 100, 0.5), h("C_KO", 10, 0.5)]),
    // b: 新建 GOOG,AAPL 不变
    mgr("b", [h("C_AAPL", 10, 0.5), h("C_GOOG", 10, 0.5)], [h("C_AAPL", 10, 1)]),
    // c: 新纳入跟踪,无更早申报 → 不计入买卖与环比,但计入持有人数
    mgr("c", [h("C_GOOG", 5, 0.5), h("C_UNRES", 5, 0.5, "MYSTERY CORP")], null),
    // d: 尚未申报 P
    mgr("d", null, [h("C_AAPL", 10, 1)]),
    // e: 只有期权变动,不应计入
    mgr("e", [h("C_KO", 1, 0, "COCA COLA CO", "Call")], [h("C_AAPL", 1, 1, "APPLE INC")]),
  ],
  cusipMap,
  bargains: new Map([["GOOG", { inStrikeZone: true, marginPct: 0.35 }], ["AAPL", { inStrikeZone: false, marginPct: 0.1 }]]),
  featuredSlugs: ["a", "d", "c", "zzz-not-tracked"],
  valuationAvailable: true,
  excludedCount: 3,
};

const p = buildQuarterlyReport(base);

assert(p.schemaVersion === 1 && p.period === "2026-09-30", "版本与季度");
assert(p.coverage.filed === 4 && p.coverage.total === 5, `覆盖 4/5, got ${p.coverage.filed}/${p.coverage.total}`);

assert(p.coverage.excluded === 3, "payload 带上上季未申报人数");

const goodBuy = p.bought.items.find((i) => i.key === "GOOG");
assert(!!goodBuy && goodBuy.managerCount === 2, `GOOG 买入应为 a+b=2(c 无上季不计), got ${goodBuy?.managerCount}`);
assert(p.bought.items[0].key === "GOOG", "买入按人数排序,GOOG 第一");
assert(!p.bought.items.some((i) => i.key === "KO"), "期权 Call 不计入买入");
const koSell = p.sold.items.find((i) => i.key === "KO");
assert(!!koSell && koSell.managerCount === 1 && koSell.dominantKind === "exited", "KO 清仓 1 人");
const aaplSellByE = p.sold.items.find((i) => i.key === "AAPL");
assert(!!aaplSellByE && aaplSellByE.managerCount === 1, "e 清掉长仓 AAPL 计入卖出");

const goog = p.mostHeld.items.find((i) => i.key === "GOOG")!;
assert(goog.holderCount === 3, `GOOG 持有人 a,b,c=3, got ${goog.holderCount}`);
assert(goog.holderDelta === 2, `GOOG 环比只在有上季的已申报者内比:a,b 新持有 → +2, got ${goog.holderDelta}`);
const aapl = p.mostHeld.items.find((i) => i.key === "AAPL")!;
assert(aapl.holderCount === 2, `AAPL 持有人 a,b=2(d 未申报不计), got ${aapl.holderCount}`);
assert(aapl.holderDelta === -1, `AAPL 环比:a,b 持有不变,e 清仓 → -1, got ${aapl.holderDelta}`);

const unres = p.mostHeld.items.find((i) => i.key === "C_UNRES")!;
assert(unres.ticker === null && unres.issuer === "MYSTERY CORP", "未解析 CUSIP:ticker null,issuer 保留");
assert(p.mostHeld.items.find((i) => i.key === "GOOG")!.ticker === "GOOG", "已解析 ticker 保留");

assert(p.strikeZone.items.length === 2, `击球区交集:GOOG(3人)、AAPL(2人)都 ≥2, got ${p.strikeZone.items.length}`);
assert(p.strikeZone.items[0].key === "GOOG" && p.strikeZone.items[0].position === "strike_zone", "GOOG 击球区且排第一");
assert(p.strikeZone.items[1].position === "below", "AAPL 价值带以下");

const fa = p.featured.find((f) => f.slug === "a")!;
assert(fa.filed && fa.moves.length === 2, "a 已申报,取 2 条");
assert(fa.moves[0].key === "KO" && fa.moves[0].kind === "exited", `a 权重变化最大的是 KO 清仓(0.5→0), got ${fa.moves[0].key}`);
const fd = p.featured.find((f) => f.slug === "d")!;
assert(!fd.filed && fd.moves.length === 0, "d 未申报");
const fc = p.featured.find((f) => f.slug === "c")!;
assert(fc.filed && fc.moves.length === 0, "c 已申报但无上季 → 无动作");
assert(!p.featured.some((f) => f.slug === "zzz-not-tracked"), "名单里不在活跃列表的 slug 跳过");

// 空季度
const empty = buildQuarterlyReport({ ...base, managers: base.managers.map((m) => ({ ...m, current: null })) });
assert(empty.coverage.filed === 0, "无人申报");
assert(empty.bought.emptyReason === "no_filers" && empty.mostHeld.emptyReason === "no_filers", "无人申报 → no_filers");
assert(empty.strikeZone.emptyReason === "no_filers", "击球区 no_filers");

// 无估值数据(valuation_snapshot 没有任何 reliable 行)
const noVal = buildQuarterlyReport({ ...base, bargains: new Map(), valuationAvailable: false });
assert(noVal.strikeZone.items.length === 0 && noVal.strikeZone.emptyReason === "no_valuation", "无估值 → no_valuation");

// 估值可用、只是没有一只票在击球区/价值带以下:不能说“估值暂不可用”
const noBargain = buildQuarterlyReport({ ...base, bargains: new Map(), valuationAvailable: true });
assert(noBargain.strikeZone.items.length === 0 && noBargain.strikeZone.emptyReason === "no_qualifying", `估值可用但无便宜票 → no_qualifying, got ${noBargain.strikeZone.emptyReason}`);

// 有估值但无交集
const noHit = buildQuarterlyReport({ ...base, bargains: new Map([["KO", { inStrikeZone: true, marginPct: 0.4 }]]) });
assert(noHit.strikeZone.emptyReason === "no_qualifying", "无交集 → no_qualifying");

// 拆股:上季股数先换算到报告季口径。e 只是 5 拆 1(股数 ×5)→ 不进共识买入;f 是真加仓 → 进。
{
  const input: ReportInput = {
    ...base,
    managers: [
      { ...mgr("e", [h("C_AAPL", 500, 1)], [h("C_AAPL", 100, 1)]), priorPeriod: "2026-06-30" },
      { ...mgr("f", [h("C_AAPL", 600, 1)], [h("C_AAPL", 100, 1)]), priorPeriod: "2026-06-30" },
    ],
    splits: factorLookup([{ cusip: "C_AAPL", fromPeriod: "2026-06-30", toPeriod: "2026-09-30", factor: 5 }]),
  };
  const r = buildQuarterlyReport(input);
  const aapl = r.bought.items.find((x) => x.key === "AAPL");
  assert(aapl?.managerCount === 1, `拆股后只有 f 算买入,got ${aapl?.managerCount}`);
}

console.log("build.check OK");
