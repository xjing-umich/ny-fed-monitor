import { deriveRowSignals } from "./rowSignals";
import type { FilingData, Holding } from "./types";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const filing = (period: string, holdings: Holding[]): FilingData => ({
  period, filedAt: period, accession: period, holdings, totalValue: 0,
});

// NEW: 上一季没有 → 本季 10% 权重新建。ADD: 上一季已有 → 本季加到 10%(只加这一季, 不触发 accumulating)。
const filings: FilingData[] = [
  filing("2026-06-30", [
    { cusip: "NEW", issuer: "Newco", value: 100, shares: 1000, weight: 0.1 },
    { cusip: "ADD", issuer: "Addco", value: 100, shares: 2000, weight: 0.1 },
  ]),
  filing("2026-03-31", [
    { cusip: "ADD", issuer: "Addco", value: 50, shares: 1000, weight: 0.05 },
  ]),
];

for (const [lang, newLabel, addLabel] of [
  ["en", "Big new position", "Big add"],
  ["zh", "重磅新建", "重磅加仓"],
] as const) {
  const sig = deriveRowSignals({ filings, lang });
  const n = sig.get("NEW")?.conviction;
  const a = sig.get("ADD")?.conviction;
  assert(n?.signal === "fresh_conviction" && n.label === newLabel, `${lang} NEW → ${newLabel}, got ${JSON.stringify(n)}`);
  assert(a?.signal === "fresh_conviction" && a.label === addLabel, `${lang} ADD → ${addLabel}, got ${JSON.stringify(a)}`);
}

console.log("rowSignals.check.ts: all assertions passed ✓ (fresh_conviction 新建/加仓分标)");
