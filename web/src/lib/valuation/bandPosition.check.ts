// 运行: npx tsx src/lib/valuation/bandPosition.check.ts
import assert from "node:assert/strict";
import { bandPosition, priceVsBandAndIv } from "./bandPosition";

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// 带位置:看 rangeLo/rangeHi,与 IV 无关
assert.equal(bandPosition(79, 66, 424), "inside");
assert.equal(bandPosition(50, 66, 424), "below");
assert.equal(bandPosition(500, 66, 424), "above");
assert.equal(bandPosition(66, 66, 424), "inside", "下沿算带内");
assert.equal(bandPosition(424, 66, 424), "inside", "上沿算带内");

const at = (price: number, lo: number, hi: number, iv: number, lang: "zh" | "en", date?: string) =>
  priceVsBandAndIv({ price, rangeLo: lo, rangeHi: hi, iv, date, lang, fmt });

// PDD:带内 + 低于中枢(旧文案误写“低于这条带”)
assert.equal(at(79, 66, 424, 343, "zh", "2026-10-22"), "今天的价格 $79（截至 2026-10-22）落在价值带内，低于中枢约 $343。");
assert.equal(at(79, 66, 424, 343, "en", "2026-10-22"), "Today’s price ($79, as of 2026-10-22) sits inside the band, below the central read of about $343.");
// 带内 + 高于中枢
assert.equal(at(300, 66, 424, 200, "zh"), "今天的价格 $300 落在价值带内，高于中枢约 $200。");
assert.equal(at(300, 66, 424, 200, "en"), "Today’s price ($300) sits inside the band, above the central read of about $200.");
// 低于带 + 低于中枢
assert.equal(at(50, 66, 424, 343, "zh"), "今天的价格 $50 低于价值带，低于中枢约 $343。");
assert.equal(at(50, 66, 424, 343, "en"), "Today’s price ($50) sits below the band, below the central read of about $343.");
// 低于带 + 高于中枢(IV 落在带下沿之下,如 WB)
assert.equal(at(15, 17, 17, 12, "zh"), "今天的价格 $15 低于价值带，高于中枢约 $12。");
assert.equal(at(15, 17, 17, 12, "en"), "Today’s price ($15) sits below the band, above the central read of about $12.");
// 高于带 + 高于中枢
assert.equal(at(500, 66, 424, 343, "zh"), "今天的价格 $500 高于价值带，高于中枢约 $343。");
assert.equal(at(500, 66, 424, 343, "en", "2026-10-22"), "Today’s price ($500, as of 2026-10-22) sits above the band, above the central read of about $343.");
// 高于带 + 低于中枢(IV 高于带上沿,罕见但须照实)
assert.equal(at(500, 66, 424, 600, "en"), "Today’s price ($500) sits above the band, below the central read of about $600.");
// 与中枢持平
assert.equal(at(343, 66, 424, 343, "zh"), "今天的价格 $343 落在价值带内，与中枢约 $343 持平。");
assert.equal(at(343, 66, 424, 343, "en"), "Today’s price ($343) sits inside the band, level with the central read of about $343.");

console.log("bandPosition.check OK");
