import { deriveValuationPosture, type CheapHolding } from "./valuationPosture";
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

console.log("valuationPosture.check OK");
