import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ValueBandGauge } from "@/components/valuation/EarningsPowerFloorCard";

// 价格在 [66,424] 内但低于 IV=343:引擎 below 不得被标尺误画成“低于区间”。
for (const lang of ["zh", "en"] as const) {
  const html = renderToStaticMarkup(<ValueBandGauge bucket="below" rangeLo={66} rangeHi={424} price={79} iv={343} lang={lang} />);
  assert.match(html, /data-price-position="inside"/, "标尺按区间上下沿定位");
  const percent = Number(html.match(/data-price-marker=""[^>]*style="left:([\d.]+)%/)?.[1]);
  assert.ok(percent > 34 && percent < 35, "价格游标实际位于中间区段,不能只改位置标签");
  assert.ok(html.includes(lang === "zh" ? "区间内" : "In range"));
  assert.ok(!/fair.value|\bIV\b/i.test(html), "公开标签不引入另一套术语");
}
for (const [price, lo, hi, position] of [
  [50, 66, 424, "below"], [500, 66, 424, "above"],
  [66, 66, 424, "inside"], [424, 66, 424, "inside"],
  [17, 17, 17, "inside"], [15, 17, 17, "below"], [19, 17, 17, "above"],
] as const) {
  const html = renderToStaticMarkup(<ValueBandGauge bucket="below" rangeLo={lo} rangeHi={hi} price={price} iv={12} lang="zh" />);
  assert.ok(html.includes(`data-price-position="${position}"`));
  assert.ok(!/NaN|Infinity/.test(html), "单点区间和带外内在价值都应有有限坐标");
}
const pending = renderToStaticMarkup(<ValueBandGauge bucket="below" rangeLo={17} rangeHi={17} price={15} iv={12} reliable={false} lang="zh" />);
assert.ok(!pending.includes("var(--val-below)"), "待确认标尺不能用已确认便宜的绿色区段");
console.log("rangeGauge.check OK");
