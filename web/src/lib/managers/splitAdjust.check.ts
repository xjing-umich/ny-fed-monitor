// 运行: cd web && npx tsx src/lib/managers/splitAdjust.check.ts
import assert from "node:assert/strict";
import { isRealSplit, dedupeSplitEvents, deriveSplitFactor, deriveSplitFactors, deriveSplitFactorsWithRejections, factorLookup, NO_SPLITS, rescaleToLatestBasis } from "./splitAdjust";
import { assembleManagerDetail, computeChanges } from "./assemble";
import { deriveConviction } from "./conviction";
import { summarizeQuarter } from "./quarterSummary";
import { consensusChangesFor } from "../../../scripts/lib/splitStore";
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
// 表内真拆股,价格校验不过但持有人股数比中位数更接近 r → 仍采用(2026-10 生产库三例,数字取自 13F)。
{
  // KLAC 10:1(2026Q2):当季股价约翻倍,q·r=2.05>1.67;两位持有人 ×3.019、×8.443,中位数 5.73 更接近 10。
  const klac = deriveSplitFactor({ ...pair, priceRatio: 0.205, both: H(3.019, 8.443), events: [{ ticker: "T", date: "2026-05-01", ratio: 10 }] });
  assert.equal(klac?.factor, 10); assert.equal(klac?.source, "table"); assert.equal(klac?.evidence.via, "holders");
  // PEGA 2:1(2025Q2):q·r=1.56 在区间内但不比不调整更平滑;持有人 ×1.766、×2.000。
  assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.779, both: H(1.766, 2.0), events: [{ ticker: "T", date: "2026-05-01", ratio: 2 }] })?.factor, 2);
  // SNEX 3:2(2026Q1):只有一位持有人,拆股同时加仓 ×2.383,仍比 1 更接近 1.5。
  assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.848, both: H(2.383), events: [{ ticker: "T", date: "2026-05-01", ratio: 1.5 }] })?.factor, 1.5);
  // 价格校验通过的照旧标 price。
  assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.21, both: H(4.97, 4.43), events: [{ ticker: "T", date: "2026-05-01", ratio: 5 }] })?.evidence.via, "price");
  // 表事件日期记错(13F 股数没变)且价格也不支持 → 拒绝。
  assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.45, both: H(1, 1.01), events: [{ ticker: "T", date: "2026-05-01", ratio: 4 }] }), null);
  // 没有两季都持有的人、价格又不过 → 拒绝(没有持有人证据可用)。
  assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.205, both: [], events: [{ ticker: "T", date: "2026-05-01", ratio: 10 }] }), null);
  // 反向拆股同样适用:1:10,价格不过,持有人 ×0.1 附近。
  assert.equal(deriveSplitFactor({ ...pair, priceRatio: 5, both: H(0.1, 0.12), events: [{ ticker: "T", date: "2026-05-01", ratio: 0.1 }] })?.factor, 0.1);
}
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
  assert.equal(q1b.splitFactor, 3, "贴齐的行仍带累计系数(1.5×2)");
  assert.equal(r[3].holdings.find((h) => h.cusip === "B")!.splitFactor, 3, "最老一季(Q0→Q1 无拆股)也带 Q1→最新的累计系数 3");
  assert.equal(r[3].holdings.find((h) => h.cusip === "B")!.shares, 2700, "900×3");
  assert.equal(r[2].holdings.find((h) => h.cusip === "B" && h.putCall)!.shares, 30, "期权行同样换算");
  assert.equal(r[2].holdings.find((h) => h.cusip === "A")!.shares, 100, "无拆股不动");
  assert.equal(filings[1].holdings[1].shares, 1000, "不改入参"); // filings[1] = Q1(加 Q0 后下标后移)

  // 同券两行(子账户):按 CUSIP+期权类型汇总后与下一季比较,贴齐后两行合计 = 下一季合计。
  const multi = rescaleToLatestBasis([
    { period: Q1, holdings: [hold("M", 500), hold("M", 500)] },
    { period: Q2, holdings: [hold("M", 1996)] },
  ], factorLookup([{ cusip: "M", fromPeriod: Q1, toPeriod: Q2, factor: 2 }]));
  const mSum = multi[1].holdings.reduce((t, x) => t + x.shares, 0);
  assert.equal(mSum, 1996, "多行汇总贴齐,合计与下一季精确相等(不是近似)");

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
  // (拆股行的 0.5% 容差边界见后面的"贴齐边界"一例;K 例验证拆股后的大幅真减仓不会被贴齐吞掉。)
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

// ── 贴齐必须"精确":浮点乘除不能让纯拆股在 computeChanges 的 `delta !== 0` 下留下 ±1e-16 的假增减 ──
{
  const Q1 = "2026-03-31", Q2 = "2026-06-30";
  const mgr = { cik: "1", slug: "m", name: "M", person: "M" };
  const hold = (cusip: string, shares: number): Holding => ({ cusip, issuer: cusip, shares, value: shares * 10, weight: 0.1 });
  const row = (cusip: string, shares: number) => ({ cusip, issuer: cusip, shares: String(shares), value: String(shares * 10), weight: "0.1" });
  // BN 形态 3:2,零碎股换现金:上季 ×1.5 与本季差 <0.1%。这两组数在旧实现下 shares*(next/adj) 落不到 next 上(分别被判 decreased / increased)。
  for (const [prior, latest] of [[1212493, 1819447], [953752, 1431471]]) {
    const look = factorLookup([{ cusip: "BN", fromPeriod: Q1, toPeriod: Q2, factor: 1.5 }]);
    const filings = [
      { period: Q2, filedAt: "", accession: "2", totalValue: 0, holdings: [hold("BN", latest), hold("ZZ", 500)] },
      { period: Q1, filedAt: "", accession: "1", totalValue: 0, holdings: [hold("BN", prior), hold("ZZ", 500)] },
    ];
    const d = assembleManagerDetail(mgr, filings, look);
    assert.equal(d.prior!.holdings.find((h) => h.cusip === "BN")!.shares, latest, `${prior}→${latest}:贴齐后精确等于本季股数`);
    assert.equal(d.prior!.holdings.find((h) => h.cusip === "BN")!.splitFactor, 1.5, "贴齐的行保留系数");
    assert.deepEqual(d.changes.filter((c) => c.cusip === "BN"), [], `${prior}→${latest}:投资人页无变动`);
    assert.deepEqual(consensusChangesFor([row("BN", latest)], [row("BN", prior)], Q2, Q1, look), [], `${prior}→${latest}:共识无动作`);
    const s = summarizeQuarter({ period: Q2, priorPeriod: Q1, latest: d.latest.holdings, prior: d.prior!.holdings, changes: d.changes });
    assert.equal(s.counts.trimmed, 0); assert.equal(s.counts.added, 0);
    assert.equal(s.netFlowUsd, 0);
  }

  // 批量:各种股数 × 1.5 贴齐后全部精确等于本季股数(旧实现约 14% 落不到)。
  {
    const look = factorLookup([{ cusip: "BN", fromPeriod: Q1, toPeriod: Q2, factor: 1.5 }]);
    let bad = 0;
    for (let p = 100001; p < 100001 + 5000; p += 7) {
      const latest = Math.round(p * 1.5);
      const [lat, pri] = rescaleToLatestBasis([{ period: Q2, holdings: [hold("BN", latest)] }, { period: Q1, holdings: [hold("BN", p)] }], look);
      if (pri.holdings[0].shares !== lat.holdings[0].shares) bad++;
    }
    assert.equal(bad, 0, "批量贴齐全部精确");
  }

  // 同券多行(子账户):按行等比换算,余数落在该键最后一行,合计精确 = 本季合计。
  {
    const look = factorLookup([{ cusip: "MR", fromPeriod: Q1, toPeriod: Q2, factor: 1.5 }]);
    const [lat, pri] = rescaleToLatestBasis([
      { period: Q2, holdings: [hold("MR", 1519447)] },
      { period: Q1, holdings: [hold("MR", 600001), hold("MR", 412492), hold("MZ", 5)] },
    ], look);
    const mr = pri.holdings.filter((h) => h.cusip === "MR");
    assert.equal(mr.reduce((t, h) => t + h.shares, 0), 1519447, "多行合计精确 = 本季");
    assert.ok(mr.every((h) => h.splitFactor === 1.5));
    assert.ok(Math.abs(mr[0].shares - 600001 * 1.5 * (1519447 / 1518739.5)) < 1e-6, "非末行按比例换算");
    assert.equal(pri.holdings.find((h) => h.cusip === "MZ")!.shares, 5, "无拆股不动");
    assert.equal(lat.holdings[0].shares, 1519447);
  }

  // 贴齐边界(0.5%):拆股后差 0.45% 贴齐为未变;差 0.55% 不贴齐 → 仍是增持(真加仓)。
  {
    const look = factorLookup([{ cusip: "E", fromPeriod: Q1, toPeriod: Q2, factor: 2 }]);
    const chg = (latest: number) => assembleManagerDetail(mgr, [
      { period: Q2, filedAt: "", accession: "2", totalValue: 0, holdings: [hold("E", latest)] },
      { period: Q1, filedAt: "", accession: "1", totalValue: 0, holdings: [hold("E", 1000)] },
    ], look).changes;
    assert.deepEqual(chg(2009), [], "差 0.45% → 贴齐");
    assert.equal(chg(2011)[0]?.kind, "increased", "差 0.55% → 不贴齐");
  }
}

// ── 断季保链:持有 Q1、Q2 缺席、Q3 持有,Q1→Q2、Q2→Q3 各拆 2:1(系数来自其他经理的季度对)→ Q1 应 ×4 ──
{
  const Q1 = "2026-03-31", Q2 = "2026-06-30", Q3 = "2026-09-30";
  const hold = (cusip: string, shares: number): Holding => ({ cusip, issuer: cusip, shares, value: shares, weight: 0.1 });
  const look = factorLookup([
    { cusip: "G", fromPeriod: Q1, toPeriod: Q2, factor: 2 },
    { cusip: "G", fromPeriod: Q2, toPeriod: Q3, factor: 2 },
  ]);
  const [, q2, q1] = rescaleToLatestBasis([
    { period: Q3, holdings: [hold("G", 400), hold("A", 10)] },
    { period: Q2, holdings: [hold("A", 10)] },
    { period: Q1, holdings: [hold("G", 100), hold("A", 10)] },
  ], look);
  const g1 = q1.holdings.find((h) => h.cusip === "G")!;
  assert.equal(g1.shares, 400, "Q2 缺席也不丢累计系数");
  assert.equal(g1.splitFactor, 4);
  assert.deepEqual(q2.holdings.map((h) => h.cusip), ["A"]);
}

// ── 被价格校验拒掉的真拆股要有记录(只加可见性,阈值不变) ──
{
  const h = (cusip: string, shares: number, px: number) => ({ cusip, shares, value: shares * px, putCall: null });
  const Q1 = "2026-03-31", Q2 = "2026-06-30";
  const tickerOf = (c: string) => (c === "R" ? "RR" : c === "OK" ? "OKT" : c === "UP" ? "UPT" : null);
  // R:表里 4:1(窗口内),但 13F 股数没变(表日期记错)、单价却 ×0.45 → 价格校验(q·r=1.8>1.67)与持有人校验都不过 → 被拒。
  // UP:同样 4:1、当季股价 +80%(q=0.45),两位持有人股数 ×4 → 价格校验不过,持有人校验通过 → 采用。
  // OK:同样 4:1、单价比 0.26 → 价格校验通过,正常采用。
  const histories = [
    { slug: "a", filings: [{ period: Q1, holdings: [h("R", 100, 100), h("UP", 100, 100), h("OK", 100, 100)] }, { period: Q2, holdings: [h("R", 100, 45), h("UP", 400, 45), h("OK", 400, 26)] }] },
    { slug: "b", filings: [{ period: Q1, holdings: [h("R", 50, 100), h("UP", 50, 100), h("OK", 50, 100)] }, { period: Q2, holdings: [h("R", 50, 45), h("UP", 200, 45), h("OK", 200, 26)] }] },
  ];
  const events = [{ ticker: "RR", date: "2026-05-15", ratio: 4 }, { ticker: "UPT", date: "2026-05-15", ratio: 4 }, { ticker: "OKT", date: "2026-05-15", ratio: 4 }];
  const res = deriveSplitFactorsWithRejections(histories, tickerOf, events);
  assert.deepEqual(res.factors.map((f) => `${f.cusip}:${f.factor}:${f.evidence.via}`), ["OK:4:price", "UP:4:holders"]);
  assert.equal(res.rejected.length, 1);
  const rj = res.rejected[0];
  assert.equal(rj.cusip, "R"); assert.equal(rj.ticker, "RR"); assert.equal(rj.fromPeriod, Q1); assert.equal(rj.toPeriod, Q2);
  assert.ok(Math.abs(rj.q - 0.45) < 1e-9); assert.equal(rj.r, 4);
  assert.deepEqual(deriveSplitFactors(histories, tickerOf, events), res.factors, "deriveSplitFactors 仍返回 factors");
  // 只有伪拆股(1.067)的表事件不算拒绝;没有表事件的 CUSIP 也不算。
  const none = deriveSplitFactorsWithRejections(histories, tickerOf, [{ ticker: "RR", date: "2026-05-15", ratio: 1.067 }]);
  assert.deepEqual(none.rejected, []);
}

// 换 CUSIP 换股(HON 2026 形态):旧码 A 消失、同 ticker 新码 B 出现,两位持有人股数比 1% 内一致 → 记在 A 上的系数;
// 再配合 canon 按 ticker 归并,两季比对不再记成"清仓 + 新建",也不记成减持。
{
  const tickerOf = (c: string) => ({ OLDHON001: "HON", NEWHON001: "HON", OLDXOM001: "XOM", NEWXOM001: "XOM" } as Record<string, string>)[c] ?? null;
  const h = (cusip: string, shares: number, price: number) => ({ cusip, shares, value: shares * price });
  const hist = (slug: string, a: number, b: number, extra: { period: string; holdings: ReturnType<typeof h>[] }[] = []) => ({
    slug,
    filings: [{ period: "2026-03-31", holdings: [h("OLDHON001", a, 200)] }, { period: "2026-06-30", holdings: [h("NEWHON001", b, 220)] }, ...extra],
  });
  const histories = [hist("cullen", 213_520, 106_631), hist("dodge", 8_019, 4_010), hist("trader", 25_656, 4_506)];
  const fs = deriveSplitFactors(histories, tickerOf, []);
  const f = fs.find((x) => x.cusip === "OLDHON001");
  assert.ok(f && Math.abs(f.factor - 0.4994) < 0.001 && f.evidence.matching === 2 && f.evidence.bothHolders === 3, `HON 换股系数,got ${JSON.stringify(fs)}`);
  // 1:1 换码(XOM 控股重组)不写系数。
  const xom = deriveSplitFactors(
    [["a", 3_749, 3_521], ["b", 1_499_613, 1_492_052]].map(([slug, x, y]) => ({
      slug: slug as string,
      filings: [{ period: "2026-03-31", holdings: [h("OLDXOM001", x as number, 110)] }, { period: "2026-06-30", holdings: [h("NEWXOM001", y as number, 112)] }],
    })),
    tickerOf,
    [],
  );
  assert.deepEqual(xom, [], "1:1 换码不写系数");
  // 只有一位持有人:无法区分换股与真实买卖 → 不写。
  assert.deepEqual(deriveSplitFactors([hist("cullen", 213_520, 106_631)], tickerOf, []), [], "单一持有人不推断");
  // 端到端:系数 + canon → cullen/dodge 未变,trader 真实减持。
  const lookup = factorLookup(fs);
  const canon = (c: string) => tickerOf(c);
  const changesFor = (slug: string) => {
    const hh = histories.find((x) => x.slug === slug)!;
    const [L, P] = rescaleToLatestBasis([{ period: "2026-06-30", holdings: hh.filings[1].holdings }, { period: "2026-03-31", holdings: hh.filings[0].holdings }], lookup);
    return computeChanges(L.holdings as Holding[], P.holdings as Holding[], canon);
  };
  assert.deepEqual(changesFor("cullen"), [], "cullen 换股后未变(零碎股折现差 <0.5% 贴齐)");
  assert.deepEqual(changesFor("dodge"), [], "dodge 换股后未变");
  const t = changesFor("trader");
  assert.ok(t.length === 1 && t[0].kind === "decreased", `trader 真实减持,got ${JSON.stringify(t)}`);
}

console.log("splitAdjust.check OK");
