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

// 8) 待确认:零已确认 + 有待确认 → 照实写明名单
c = investorHandoffFor(0, "Warren Buffett", "zh", ["Macy's"]);
assert.equal(c.line, "Warren Buffett 目前没有已确认的击球区持仓，另有 1 只待确认（Macy's）。", `zh pending, got ${c.line}`);
c = investorHandoffFor(0, "X", "en", ["A", "B", "C", "D"]);
assert.equal(c.line, "X has no confirmed strike-zone positions right now; 4 more are pending (A, B, C and 1 more).", `en pending 截断, got ${c.line}`);
c = investorHandoffFor(0, "X", "en");
assert.equal(c.line, "X has no confirmed strike-zone positions right now.", `en 无待确认, got ${c.line}`);

// 9) 文案: 内在价值 / 买入线 口径(见 task 9)
assert.equal(stockHandoffFor(v({ bucket: "below" }), "AAPL", "en").line, "AAPL's price is below its intrinsic value.");
assert.equal(stockHandoffFor(v({ inStrikeZone: true }), "PDD", "zh").line, "PDD 现价低于买入线（内在价值扣除安全边际）。");
assert.equal(stockHandoffFor(v({ bucket: "above" }), "AAPL", "zh").line, "AAPL 现价不低于内在价值。");
assert.equal(
  stockHandoffFor(v({ inStrikeZone: true }), "PDD", "en").line,
  "PDD's price is below the buy line (intrinsic value minus a margin of safety).",
);
assert.equal(stockHandoffFor(v({ bucket: "above" }), "AAPL", "en").line, "AAPL's price is not below its intrinsic value.");
assert.equal(investorHandoffFor(0, "X", "zh").ctaLabel, "按安全边际浏览低于内在价值的股票");
assert.equal(investorHandoffFor(0, "X", "en").ctaLabel, "Browse stocks below intrinsic value by margin of safety");

// 10) 有已确认击球区 + 击球区待确认 → 同一个尾巴(final-fix B #1)
c = investorHandoffFor(1, "Warren Buffett", "zh", ["Macy's"]);
assert.equal(c.line, "Warren Buffett 有 1 只持仓现价落在击球区，另有 1 只待确认（Macy's）。", `zh strike+pending, got ${c.line}`);
assert.equal(c.href, "/zh/stocks/screener?view=strike_zone");
c = investorHandoffFor(1, "Warren Buffett", "en", ["Macy's"]);
assert.equal(c.line, "Warren Buffett holds 1 position now in the strike zone; 1 more is pending (Macy's).", `en strike+pending, got ${c.line}`);
c = investorHandoffFor(2, "X", "en", ["A", "B"]);
assert.equal(c.line, "X holds 2 positions now in the strike zone; 2 more are pending (A and B).", `en strike+2 pending, got ${c.line}`);
// 无待确认时原句不变
assert.equal(investorHandoffFor(3, "X", "zh").line, "X 有 3 只持仓现价落在击球区。");
assert.equal(investorHandoffFor(3, "X", "en").line, "X holds 3 positions now in the strike zone.");

console.log("discoveryHandoff.check.ts: all assertions passed");
