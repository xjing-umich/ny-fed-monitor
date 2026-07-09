import { deriveLonelyConviction } from "./lonelyConviction";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const cusipToTicker = new Map([
  ["ACUSIP", "A"], ["BCUSIP", "B"], ["CCUSIP", "C"], ["DCUSIP", "D"], ["ECUSIP", "E"],
]);
// A: 1 家持(独门), B: 2 家(独门), C: 5 家(拥挤), D: 1 家(独门但小仓); E: 共持数缺失
const holderCounts = new Map([["A", 1], ["B", 2], ["C", 5], ["D", 1]]);
const holdings = [
  { cusip: "ACUSIP", issuer: "Alpha", value: 200 },   // 20% 权重, 独门 → 入选
  { cusip: "BCUSIP", issuer: "Bravo", value: 40 },    // 4% 权重, 独门 → 入选
  { cusip: "CCUSIP", issuer: "Charlie", value: 300 }, // 30% 但 5 家持 → 排除
  { cusip: "DCUSIP", issuer: "Delta", value: 20 },    // 2% (<3%) 独门但小仓 → 排除
  { cusip: "ECUSIP", issuer: "Echo", value: 500 },    // 共持数 undefined → 保守跳过
];
const r = deriveLonelyConviction({ holdings, cusipToTicker, holderCounts, totalValue: 1000 });
assert(r.length === 2, `双闸命中 2, got ${r.length}: ${JSON.stringify(r.map((x) => x.ticker))}`);
assert(r[0].ticker === "A" && r[1].ticker === "B", `按 weight 降序应 A,B, got ${r.map((x) => x.ticker)}`);
assert(Math.abs(r[0].weight - 0.2) < 1e-9, `A weight=0.2, got ${r[0].weight}`);
assert(r[0].holderCount === 1, `A holderCount=1, got ${r[0].holderCount}`);
assert(!r.some((x) => ["C", "D", "E"].includes(x.ticker)), `C(拥挤)/D(小仓)/E(共持缺失)不应入选`);

// totalValue<=0 → [](降级)
assert(deriveLonelyConviction({ holdings, cusipToTicker, holderCounts, totalValue: 0 }).length === 0, `totalValue=0 → []`);

// limit 截断: 10 只都独门够重 → 只取 6
const many = Array.from({ length: 10 }, (_, i) => ({ cusip: `X${i}`, issuer: `X${i}`, value: 100 }));
const c2t = new Map(many.map((h) => [h.cusip, h.cusip]));
const hc = new Map(many.map((h) => [h.cusip.toUpperCase(), 1]));
const rl = deriveLonelyConviction({ holdings: many, cusipToTicker: c2t, holderCounts: hc, totalValue: 1000 });
assert(rl.length === 6, `limit=6 截断, got ${rl.length}`);

console.log("lonelyConviction.check OK");
