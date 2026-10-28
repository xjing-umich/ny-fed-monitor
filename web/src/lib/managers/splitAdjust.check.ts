// 运行: cd web && npx tsx src/lib/managers/splitAdjust.check.ts
import assert from "node:assert/strict";
import { isRealSplit, dedupeSplitEvents, deriveSplitFactor, deriveSplitFactors, factorLookup, NO_SPLITS } from "./splitAdjust";

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

console.log("splitAdjust.check OK");
