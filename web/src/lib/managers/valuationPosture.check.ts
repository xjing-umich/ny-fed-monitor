import { deriveValuationPosture, postureLeadIn, strikePendingIssuers, type CheapHolding, type ValuationPosture } from "./valuationPosture";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

// 造 verdict 的小工厂(只填被 deriveValuationPosture 读到的字段, 其余给合法占位)
function v(partial: Partial<SnapshotVerdict>): SnapshotVerdict {
  return {
    ticker: "X", bucket: "within", inStrikeZone: false, rangeLo: 1, rangeHi: 2,
    price: 1.5, priceDate: "2026-06-30", marginPct: null, coverage: "full",
    reliable: true, computedAt: "2026-07-01", ...partial,
  };
}

const cusipToTicker = new Map([
  ["ACUSIP", "A"], ["BCUSIP", "B"], ["CCUSIP", "C"],
  ["DCUSIP", "D"], ["ECUSIP", "E"], ["FCUSIP", "F"],
]);
// A: 击球区+可信(margin 0.30, priceDate 07-01) → cheap+strike
// B: below+可信(margin 0.10) → cheap(非击球区)
// C: below 但 reliable=false → 信心闸滤掉, 不计
// D: within → 不 cheap
// E: above → 不 cheap
// F: 击球区但 marginPct=null → cheap, 排序垫底
const verdicts = new Map<string, SnapshotVerdict>([
  ["A", v({ ticker: "A", bucket: "below", inStrikeZone: true, marginPct: 0.30, priceDate: "2026-07-01" })],
  ["B", v({ ticker: "B", bucket: "below", inStrikeZone: false, marginPct: 0.10, priceDate: "2026-06-30" })],
  ["C", v({ ticker: "C", bucket: "below", inStrikeZone: true, marginPct: 0.50, reliable: false })],
  ["D", v({ ticker: "D", bucket: "within", inStrikeZone: false, marginPct: 0.02 })],
  ["E", v({ ticker: "E", bucket: "above", inStrikeZone: false })],
  ["F", v({ ticker: "F", bucket: "below", inStrikeZone: true, marginPct: null, priceDate: "2026-06-20" })],
]);
const holdings = [
  { cusip: "ACUSIP", issuer: "Alpha" }, { cusip: "BCUSIP", issuer: "Bravo" },
  { cusip: "CCUSIP", issuer: "Charlie" }, { cusip: "DCUSIP", issuer: "Delta" },
  { cusip: "ECUSIP", issuer: "Echo" }, { cusip: "FCUSIP", issuer: "Foxtrot" },
];

const p = deriveValuationPosture({ holdings, cusipToTicker, verdicts });
// (a) 信心闸: C(reliable=false) 不计入任何计数、不进 cheap
assert(!p.cheap.some((x) => x.ticker === "C"), "C(reliable=false) 不应进 cheap");
// (b) 计数: covered = A,B,D,E,F = 5(C 被闸掉); strike = A,F = 2; below = A,B,F = 3
assert(p.covered === 5, `covered=5, got ${p.covered}`);
assert(p.strikeCount === 2, `strikeCount=2(A,F), got ${p.strikeCount}`);
assert(p.belowCount === 3, `belowCount=3(A,B,F), got ${p.belowCount}`);
// (c) cheap 判据 = inStrikeZone ∪ below → A,B,F(D within/E above 不进)
assert(p.cheap.length === 3, `cheap=3(A,B,F), got ${p.cheap.length}: ${p.cheap.map((x) => x.ticker)}`);
assert(!p.cheap.some((x) => ["D", "E"].includes(x.ticker)), "within/above 不应进 cheap");
// (d) 降序 + null 垫底: A(0.30), B(0.10), F(null)
assert(p.cheap.map((x: CheapHolding) => x.ticker).join(",") === "A,B,F", `排序应 A,B,F, got ${p.cheap.map((x) => x.ticker)}`);
// (e) asOf = 参与行(covered)最大 priceDate = 2026-07-01(A)
assert(p.asOf === "2026-07-01", `asOf=2026-07-01, got ${p.asOf}`);
// (f) 空输入 / verdicts 空 → 全 0 + cheap:[] + asOf:""
const empty = deriveValuationPosture({ holdings, cusipToTicker, verdicts: new Map() });
assert(empty.covered === 0 && empty.strikeCount === 0 && empty.belowCount === 0 && empty.cheap.length === 0 && empty.asOf === "", "verdicts 空 → 全 0 降级");
assert(deriveValuationPosture({ holdings: [], cusipToTicker, verdicts }).covered === 0, "空 holdings → covered 0");

// (g) 不截断: 10 只都便宜 → cheap 返回全部 10(截断在展示层, 非纯函数)
const many = Array.from({ length: 10 }, (_, i) => ({ cusip: `M${i}`, issuer: `M${i}` }));
const manyC2T = new Map(many.map((h) => [h.cusip, h.cusip]));
const manyV = new Map<string, SnapshotVerdict>(
  many.map((h, i) => [h.cusip.toUpperCase(), v({ ticker: h.cusip, bucket: "below", inStrikeZone: true, marginPct: (10 - i) / 100 })]),
);
const rMany = deriveValuationPosture({ holdings: many, cusipToTicker: manyC2T, verdicts: manyV });
assert(rMany.cheap.length === 10, `cheap 返回全部 10(不截断), got ${rMany.cheap.length}`);

// C 是 below+击球区但 reliable=false → 不进 covered/cheap,但进 pending
const pr = deriveValuationPosture({ holdings, cusipToTicker, verdicts });
assert(pr.pending.length === 1 && pr.pending[0].ticker === "C", `pending 只含 C, got ${JSON.stringify(pr.pending)}`);
assert(!pr.cheap.some((c) => c.ticker === "C"), "C 不在 cheap");

// 底部 handoff 讲的是击球区:只把击球区的待确认名字传过去,below-待确认不进(final-fix B #1)
const sp = deriveValuationPosture({
  holdings: [{ cusip: "SP", issuer: "Strike Pending Inc" }, { cusip: "BP", issuer: "Below Pending Inc" }],
  cusipToTicker: new Map([["SP", "SP"], ["BP", "BP"]]),
  verdicts: new Map<string, SnapshotVerdict>([
    ["SP", v({ ticker: "SP", bucket: "below", inStrikeZone: true, marginPct: 0.4, reliable: false })],
    ["BP", v({ ticker: "BP", bucket: "below", inStrikeZone: false, marginPct: 0.1, reliable: false })],
  ]),
});
assert(sp.pending.length === 2, `两只都进 pending, got ${sp.pending.length}`);
assert(JSON.stringify(strikePendingIssuers(sp)) === JSON.stringify(["Strike Pending Inc"]), `只剩击球区待确认, got ${JSON.stringify(strikePendingIssuers(sp))}`);

// 估值姿态引语:分母写明“估值无红旗”(final-fix B #2)
const ch = (over: Partial<CheapHolding>): CheapHolding => ({ issuer: "I", ticker: "T", marginPct: 0.2, inStrikeZone: false, bucket: "below", ...over });
const pp = (over: Partial<ValuationPosture>): ValuationPosture => ({ covered: 12, strikeCount: 0, belowCount: 0, cheap: [], pending: [], asOf: "", ...over });
const eq = (got: string, want: string, m: string) => assert(got === want, `${m}\n  got:  ${got}\n  want: ${want}`);
// cheap>0 + strike>0 + pending + asOf
const full = pp({ strikeCount: 1, cheap: [ch({ inStrikeZone: true }), ch({})], pending: [ch({})], asOf: "2026-10-22" });
eq(postureLeadIn(full, "zh"), "这只基金 12 只估值无红旗的美股持仓中，有 2 只现价低于内在价值（其中 1 只落在击球区）；另有 1 只待确认（估值截至 2026-10-22）：", "zh full");
eq(postureLeadIn(full, "en"), "Of 12 valued US positions without red flags, 2 trade below intrinsic value (1 in the strike zone); 1 more pending (as of 2026-10-22):", "en full");
// cheap>0, 无 strike, 无 pending
const plain = pp({ cheap: [ch({})], asOf: "2026-10-22" });
eq(postureLeadIn(plain, "zh"), "这只基金 12 只估值无红旗的美股持仓中，有 1 只现价低于内在价值（估值截至 2026-10-22）：", "zh no pending");
eq(postureLeadIn(plain, "en"), "Of 12 valued US positions without red flags, 1 trade below intrinsic value (as of 2026-10-22):", "en no pending");
// cheap=0, 只有待确认, 无 asOf
const onlyPending = pp({ covered: 5, pending: [ch({}), ch({})] });
eq(postureLeadIn(onlyPending, "zh"), "这只基金 5 只估值无红旗的美股持仓中，没有现价低于内在价值的；另有 2 只待确认：", "zh only pending");
eq(postureLeadIn(onlyPending, "en"), "Of 5 valued US positions without red flags, none trade below intrinsic value; 2 more pending:", "en only pending");

console.log("valuationPosture.check OK");
