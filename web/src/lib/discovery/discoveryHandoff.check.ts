// 跑法(裸跑, 无需 server-only 桩): cd web && npx tsx src/lib/discovery/discoveryHandoff.check.ts
import { strict as assert } from "node:assert";
import { stockHandoffFor, investorHandoffFor } from "./discoveryHandoff";
import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";

const v = (over: Partial<ValuationVerdict>): ValuationVerdict => ({
  bucket: "below", inStrikeZone: false, rangeLo: 1, rangeHi: 2, price: 1,
  priceDate: "2026-01-01", marginPct: 0.2, coverage: "full", reliable: true,
  methods: { zeroGrowthEpv: true, oeDcf: true, greenwaldGrowthCeilings: true },
  ...over,
});

// 1) 进击球区 → strike_zone 视图, 大写 ticker
let c = stockHandoffFor(v({ inStrikeZone: true }), "aapl", "zh");
assert.equal(c.href, "/zh/stocks/screener?view=strike_zone", "in-zone → strike_zone");
assert.ok(c.line.includes("AAPL"), "ticker uppercased");

// 2) below 非 inStrikeZone → below 视图
c = stockHandoffFor(v({ inStrikeZone: false, bucket: "below" }), "MSFT", "en");
assert.equal(c.href, "/stocks/screener?view=below", "below → below view");

// 3) within/above → 邀请看击球区
c = stockHandoffFor(v({ bucket: "above", inStrikeZone: false }), "NVDA", "zh");
assert.equal(c.href, "/zh/stocks/screener?view=strike_zone", "above → strike_zone invite");

// 4) null → 兜底根链接
c = stockHandoffFor(null, "X", "en");
assert.equal(c.href, "/stocks/screener", "null → generic");

// 5) 不可信优先于 inStrikeZone → 兜底
c = stockHandoffFor(v({ reliable: false, inStrikeZone: true }), "X", "zh");
assert.equal(c.href, "/zh/stocks/screener", "unreliable → generic (beats in-zone)");

// 6) 投资人 k>0 → strike_zone, 含只数
c = investorHandoffFor(3, "Warren Buffett", "zh");
assert.equal(c.href, "/zh/stocks/screener?view=strike_zone", "k>0 → strike_zone");
assert.ok(c.line.includes("3"), "count shown");

// 7) 投资人 k=0 → below; 英文单复数
c = investorHandoffFor(0, "X", "en");
assert.equal(c.href, "/stocks/screener?view=below", "k=0 → below");
c = investorHandoffFor(1, "X", "en");
assert.ok(c.line.includes("1 position ") && !c.line.includes("positions"), "singular position");

console.log("discoveryHandoff.check.ts: all assertions passed");
