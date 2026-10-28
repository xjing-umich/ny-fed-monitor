// 运行: cd web && npx tsx src/lib/managers/splitAdjust.check.ts
import assert from "node:assert/strict";
import { isRealSplit, dedupeSplitEvents, deriveSplitFactor, deriveSplitFactors, factorLookup, NO_SPLITS, rescaleToLatestBasis } from "./splitAdjust";
import { assembleManagerDetail } from "./assemble";
import { deriveConviction } from "./conviction";
import type { Holding } from "./types";

// ── 真拆股 vs 价格复权(Yahoo 把分拆上市/股票股息也记成小数"拆股",股数并不变) ──
for (const r of [2, 3, 4, 5, 10, 25, 1.5, 4 / 3, 0.5, 0.25, 0.1, 0.05, 1 / 12, 0.333333]) assert.ok(isRealSplit(r), `真拆股 ${r}`);
for (const r of [1.067, 1.241, 1.272, 1.01, 0.9535, 2.793, 6.665, 2.39, 1.472, 1.327, 0, -2, NaN, Infinity]) assert.ok(!isRealSplit(r), `非真拆股 ${r}`);

// ── 去重:同 ticker、同比例、30 天内只留最早一条;不同比例、不同 ticker、超过 30 天都保留 ──
const ev = dedupeSplitEvents([
  { ticker: "WLFC", date: "2026-07-21", ratio: 3 },
  { ticker: "WLFC", date: "2026-07-20", ratio: 3 },
  { ticker: "BRCC", date: "2026-08-21", ratio: 0.1 },
  { ticker: "BRCC", date: "2026-08-24", ratio: 0.1 },
  { ticker: "APH", date: "2026-05-01", ratio: 2 },
  { ticker: "APH", date: "2026-09-03", ratio: 2 },
  { ticker: "X", date: "2026-07-01", ratio: 2 },
  { ticker: "X", date: "2026-07-05", ratio: 3 },
]);
assert.deepEqual(
  ev.map((e) => `${e.ticker}@${e.date}x${e.ratio}`),
  ["APH@2026-05-01x2", "APH@2026-09-03x2", "BRCC@2026-08-21x0.1", "WLFC@2026-07-20x3", "X@2026-07-01x2", "X@2026-07-05x3"],
);
const pair = { cusip: "C", ticker: "T", fromPeriod: "2026-03-31", toPeriod: "2026-06-30" };
const H = (...ratios: number[]) => ratios.map((r) => ({ prevShares: 1000, shares: 1000 * r }));

// 表内 5 拆 1(CVNA 形态):单价 ÷5 附近,持有人股数各有增减 → 采用 5,来源 table。
{
  const f = deriveSplitFactor({ ...pair, priceRatio: 0.21, both: H(4.97, 4.43, 6.0, 6.75), events: [{ ticker: "T", date: "2026-05-01", ratio: 5 }] });
  assert.equal(f?.factor, 5); assert.equal(f?.source, "table");
  assert.equal(f?.evidence.bothHolders, 4);
}
// 表内只有一位持有人也可以(价格证据 + 表事件)。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.11, both: H(8.44), events: [{ ticker: "T", date: "2026-06-30", ratio: 10 }] })?.factor, 10, "除权日=季末当天算在本季");
// 表内伪拆股(分拆复权 1.067)→ 不调整。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.9, both: H(1.0, 1.02), events: [{ ticker: "T", date: "2026-05-01", ratio: 1.067 }] }), null);
// 表内重复事件(同比例 30 天内两条)→ 只算一次,系数 3 而不是 9。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.34, both: H(3, 3), events: [{ ticker: "T", date: "2026-05-20", ratio: 3 }, { ticker: "T", date: "2026-05-21", ratio: 3 }] })?.factor, 3);
// 表事件与价格矛盾(单价没跳变)→ 不采用表事件;推断也不成立 → null。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 1.05, both: H(1.1, 0.9), events: [{ ticker: "T", date: "2026-05-01", ratio: 2 }] }), null);
// 反向拆股 1:10:单价 ×10、股数 ×0.1 → 系数 0.1。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 9.5, both: H(0.1), events: [{ ticker: "T", date: "2026-05-01", ratio: 0.1 }] })?.factor, 0.1);
// 表外推断:单价减半、3 位持有人里 2 位股数恰好翻倍 → inferred 2。
{
  const f = deriveSplitFactor({ ...pair, priceRatio: 0.52, both: H(2.0, 2.005, 1.3), events: [] });
  assert.equal(f?.factor, 2); assert.equal(f?.source, "inferred"); assert.equal(f?.evidence.matching, 2);
}
// 表事件日期落在窗口外(表记错到下季初),但 13F 已体现 → 走推断。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.26, both: H(4, 4, 4), events: [{ ticker: "T", date: "2026-07-02", ratio: 4 }] })?.source, "inferred");
// 表外、只有一位持有人 → 无法交叉验证,不调整。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.5, both: H(2), events: [] }), null);
// 表外、恰好一半人翻倍(不过半)→ 不调整。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.5, both: H(2, 2, 1, 1), events: [] }), null);
// 股价腰斩但股数没变(崩盘,不是拆股)→ 不调整。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.5, both: H(1, 1, 1.01), events: [] }), null);
// 单价缺失(NaN / 0)→ 不调整。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: NaN, both: H(2, 2), events: [] }), null);
// 3:2(1.5)也在推断表里。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.67, both: H(1.5, 1.497, 1.5), events: [] })?.factor, 1.5);

{
  // 三位经理持有 C(表里 2 拆 1,发生在 Q2);C 的季末单价 Q1 100、Q2 51。
  // m3 漏报 Q2:它的季度对是 (Q1, Q3),单独成组,不能套用 (Q1, Q2) 的系数。
  const h = (cusip: string, shares: number, px: number, putCall?: string) => ({ cusip, shares, value: shares * px, putCall });
  const Q1 = "2026-03-31", Q2 = "2026-06-30", Q3 = "2026-09-30";
  const histories = [
    { slug: "m1", filings: [{ period: Q1, holdings: [h("C", 100, 100), h("D", 10, 50)] }, { period: Q2, holdings: [h("C", 210, 51), h("D", 10, 55), h("C", 5, 51, "Call")] }] },
    { slug: "m2", filings: [{ period: Q2, holdings: [h("C", 400, 51)] }, { period: Q1, holdings: [h("C", 200, 100)] }] },
    { slug: "m3", filings: [{ period: Q1, holdings: [h("C", 50, 100)] }, { period: Q3, holdings: [h("C", 50, 100)] }] },
  ];
  const fs = deriveSplitFactors(histories, (c) => (c === "C" ? "CC" : null), [{ ticker: "CC", date: "2026-05-15", ratio: 2 }]);
  assert.deepEqual(fs.map((f) => `${f.cusip}|${f.fromPeriod}|${f.toPeriod}|${f.factor}|${f.source}`), [`C|${Q1}|${Q2}|2|table`], "只有 (Q1,Q2) 的 C;D 未拆、m3 的 (Q1,Q3) 价格未跳变");
  assert.equal(fs[0].evidence.bothHolders, 2, "期权行不计入持有人证据");

  const look = factorLookup(fs);
  assert.equal(look("C", Q1, Q2), 2);
  assert.equal(look("C", Q1, Q3), 1, "断季的季度对查不到 → 1");
  assert.equal(look("D", Q1, Q2), 1);
  assert.equal(NO_SPLITS("C", Q1, Q2), 1);
}

// 期权行不进证据(E):mA 在 Q2 的 Call 行若混入正股口径,单价中位数与股数比都会变。
{
  const h = (cusip: string, shares: number, px: number, putCall?: string) => ({ cusip, shares, value: shares * px, putCall });
  const Q1 = "2026-03-31", Q2 = "2026-06-30";
  // mA:Q2 同券有正股 200 股 @50 与 Call 100 股 @80。正股口径单价 50;若 Call 混入,mA 变 (10000+8000)/300=60,中位数 55 → q=0.55。
  // mB:Q2 只有正股 200 股 @50。
  const histories = [
    { slug: "mA", filings: [{ period: Q1, holdings: [h("E", 100, 100)] }, { period: Q2, holdings: [h("E", 200, 50), h("E", 100, 80, "Call")] }] },
    { slug: "mB", filings: [{ period: Q1, holdings: [h("E", 100, 100)] }, { period: Q2, holdings: [h("E", 200, 50)] }] },
  ];
  const fe = deriveSplitFactors(histories, (c) => (c === "E" ? "EE" : null), [{ ticker: "EE", date: "2026-05-15", ratio: 2 }]);
  assert.equal(fe.length, 1);
  assert.equal(fe[0].evidence.q, 0.5, "Call 行不进单价中位数");
  assert.equal(fe[0].evidence.bothHolders, 2);
  assert.equal(fe[0].evidence.matching, 2, "Call 行不改正股股数比");
}

// 期权行不进持有人判定(F):mC 在 Q2 只有 Call(无正股),不能算作两季都持有的经理。
{
  const h = (cusip: string, shares: number, px: number, putCall?: string) => ({ cusip, shares, value: shares * px, putCall });
  const Q1 = "2026-03-31", Q2 = "2026-06-30";
  const histories = [
    { slug: "mC", filings: [{ period: Q1, holdings: [h("F", 100, 100)] }, { period: Q2, holdings: [h("F", 50, 50, "Call")] }] },
    { slug: "mD", filings: [{ period: Q1, holdings: [h("F", 100, 100)] }, { period: Q2, holdings: [h("F", 200, 50)] }] },
    { slug: "mE", filings: [{ period: Q1, holdings: [h("F", 100, 100)] }, { period: Q2, holdings: [h("F", 200, 50)] }] },
  ];
  const ff = deriveSplitFactors(histories, (c) => (c === "F" ? "FF" : null), [{ ticker: "FF", date: "2026-05-15", ratio: 2 }]);
  assert.equal(ff.length, 1);
  assert.equal(ff[0].evidence.bothHolders, 2, "只有 Call 的经理不计入两季持有人");
  assert.equal(ff[0].evidence.matching, 2);
}

// 输出顺序确定(G):同一 CUSIP、同一起点季的两个季度对(Q1→Q2 与 Q1→Q3),输出顺序不依赖经理输入顺序。
{
  const h = (cusip: string, shares: number, px: number, putCall?: string) => ({ cusip, shares, value: shares * px, putCall });
  const Q1 = "2026-03-31", Q2 = "2026-06-30", Q3 = "2026-09-30";
  const gA = { slug: "gA", filings: [{ period: Q1, holdings: [h("G", 100, 100)] }, { period: Q2, holdings: [h("G", 200, 50)] }] };
  const gB = { slug: "gB", filings: [{ period: Q1, holdings: [h("G", 100, 100)] }, { period: Q3, holdings: [h("G", 200, 50)] }] };
  const tickerOf = (c: string) => (c === "G" ? "GG" : null);
  const evs = [{ ticker: "GG", date: "2026-05-15", ratio: 2 }];
  const key = (fs: ReturnType<typeof deriveSplitFactors>) => fs.map((f) => `${f.cusip}|${f.fromPeriod}|${f.toPeriod}|${f.factor}|${f.source}`);
  const ab = key(deriveSplitFactors([gA, gB], tickerOf, evs));
  const ba = key(deriveSplitFactors([gB, gA], tickerOf, evs));
  assert.deepEqual(ba, ab, "输入顺序不影响输出顺序");
  assert.deepEqual(ab, [`G|${Q1}|${Q2}|2|table`, `G|${Q1}|${Q3}|2|table`]);
}

// ── 较早季股数换算到最新季口径 + 变动/8 季信号联动 ──
{
  const Q0 = "2025-12-31", Q1 = "2026-03-31", Q2 = "2026-06-30", Q3 = "2026-09-30";
  // B:Q2 拆 3:2、Q3 拆 2:1;零碎股换现金 → Q2 只有 ×1.497。A:无拆股。B 的 Call 行同 CUSIP。
  const look = factorLookup([
    { cusip: "B", fromPeriod: Q1, toPeriod: Q2, factor: 1.5 },
    { cusip: "B", fromPeriod: Q2, toPeriod: Q3, factor: 2 },
  ]);
  const hold = (cusip: string, shares: number, putCall?: string): Holding => ({ cusip, issuer: cusip, shares, value: shares, putCall, weight: 0.1 });
  // Q0(Q0→Q1 无拆股):B 900→1000→1497→2994,未换算时是"连续 3 季加仓";换算后 Q0=2700、其后三季都是 2994,不是连续增持。
  const filings = [
    { period: Q0, filedAt: "", accession: "0", totalValue: 0, holdings: [hold("A", 100), hold("B", 900)] },
    { period: Q1, filedAt: "", accession: "1", totalValue: 0, holdings: [hold("A", 100), hold("B", 1000), hold("B", 10, "Call")] },
    { period: Q3, filedAt: "", accession: "3", totalValue: 0, holdings: [hold("A", 120), hold("B", 2994), hold("B", 30, "Call")] },
    { period: Q2, filedAt: "", accession: "2", totalValue: 0, holdings: [hold("A", 100), hold("B", 1497), hold("B", 15, "Call")] },
  ];
  const r = rescaleToLatestBasis(filings, look);
  assert.deepEqual(r.map((f) => f.period), [Q3, Q2, Q1, Q0], "降序");
  assert.equal(r[0].holdings.find((h) => h.cusip === "B" && !h.putCall)!.shares, 2994, "最新季不动");
  assert.equal(r[0].holdings[0].splitFactor, undefined);
  const q2b = r[1].holdings.find((h) => h.cusip === "B" && !h.putCall)!;
  assert.equal(q2b.shares, 2994); assert.equal(q2b.splitFactor, 2);
  const q1b = r[2].holdings.find((h) => h.cusip === "B" && !h.putCall)!;
  assert.equal(q1b.shares, 2994, "1000×1.5×2=3000,与 Q2 换算后的 2994 差 0.2%(<0.5%)→ 贴齐为未变");
  assert.equal(r[2].holdings.find((h) => h.cusip === "B" && h.putCall)!.shares, 30, "期权行同样换算");
  assert.equal(r[2].holdings.find((h) => h.cusip === "A")!.shares, 100, "无拆股不动");
  assert.equal(filings[1].holdings[1].shares, 1000, "不改入参"); // filings[1] = Q1(加 Q0 后下标后移)

  // 同券两行(子账户):按 CUSIP+期权类型汇总后与下一季比较,贴齐后两行合计 = 下一季合计。
  const multi = rescaleToLatestBasis([
    { period: Q1, holdings: [hold("M", 500), hold("M", 500)] },
    { period: Q2, holdings: [hold("M", 1996)] },
  ], factorLookup([{ cusip: "M", fromPeriod: Q1, toPeriod: Q2, factor: 2 }]));
  const mSum = multi[1].holdings.reduce((t, x) => t + x.shares, 0);
  assert.ok(Math.abs(mSum - 1996) < 1e-9, `多行汇总贴齐,got ${mSum}`);

  // 联动:投资人页的本季变动与 8 季信号。B 只是拆股 → 不是增持;A 是真增持。
  const mgr = { cik: "1", slug: "m", name: "M", person: "M" };
  const d = assembleManagerDetail(mgr, filings, look);
  assert.deepEqual(d.changes.filter((c) => !c.putCall).map((c) => `${c.cusip}:${c.kind}`), ["A:increased"]);
  const raw = assembleManagerDetail(mgr, filings);
  assert.ok(raw.changes.some((c) => c.cusip === "B" && c.kind === "increased"), "不传系数 = 旧行为(对照)");
  const isAccB = (fs: typeof d.filings) => deriveConviction(fs, 12).some((p) => p.cusip === "B" && p.signal === "accumulating");
  assert.ok(isAccB(raw.filings), "对照:不换算时 B 被误判为连续增持(证明本 fixture 能检出问题)");
  assert.ok(!isAccB(d.filings), "拆股季不算连续增持");
}
{
  // 贴齐只对有系数的行:无拆股的 0.05% 小变动仍记为增持。
  // (0.5% 边界本身不在此测;下方 K 例验证拆股后的大幅真减仓不会被贴齐吞掉。)
  const look = factorLookup([]);
  const hold = (shares: number) => ({ cusip: "Z", issuer: "Z", shares, value: shares, weight: 0.1 });
  const d = assembleManagerDetail({ cik: "1", slug: "m", name: "M", person: "M" }, [
    { period: "2026-03-31", filedAt: "", accession: "1", totalValue: 0, holdings: [hold(10000)] },
    { period: "2026-06-30", filedAt: "", accession: "2", totalValue: 0, holdings: [hold(10005)] },
  ], look);
  assert.equal(d.changes[0]?.kind, "increased");
}
{
  // 拆股后真减仓:10 拆 1,股数 ×8.44 → 实际 −15.6%,必须是减持并带 splitFactor。
  const look = factorLookup([{ cusip: "K", fromPeriod: "2026-03-31", toPeriod: "2026-06-30", factor: 10 }]);
  const hold = (shares: number) => ({ cusip: "K", issuer: "K", shares, value: shares, weight: 0.1 });
  const d = assembleManagerDetail({ cik: "1", slug: "m", name: "M", person: "M" }, [
    { period: "2026-03-31", filedAt: "", accession: "1", totalValue: 0, holdings: [hold(1000)] },
    { period: "2026-06-30", filedAt: "", accession: "2", totalValue: 0, holdings: [hold(8440)] },
  ], look);
  assert.equal(d.changes[0].kind, "decreased");
  assert.equal(d.changes[0].prevShares, 10000);
  assert.equal(d.changes[0].splitFactor, 10);
  assert.ok(Math.abs(d.changes[0].deltaPct! + 0.156) < 1e-9);
}

console.log("splitAdjust.check OK");
