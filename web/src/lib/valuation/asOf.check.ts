// 运行: npx tsx src/lib/valuation/asOf.check.ts
import assert from "node:assert/strict";
import { latestIsoDate, valuationAsOfText, priceSourceName, priceFactNote } from "./asOf";

assert.equal(latestIsoDate(["2026-10-21", "", null, "2026-10-22", undefined, "2026-10-16"]), "2026-10-22");
assert.equal(latestIsoDate([]), null);
assert.equal(latestIsoDate(["", null]), null);
assert.equal(latestIsoDate(["2026-10-22T16:57:57+00:00"]), "2026-10-22", "带时间也截到日期");

assert.equal(valuationAsOfText("zh", "2026-10-22"), "估值截至 2026-10-22 收盘价");
assert.equal(valuationAsOfText("en", "2026-10-22"), "Valuations as of the 2026-10-22 close");
assert.equal(valuationAsOfText("zh", null), null);

assert.equal(priceSourceName("zh", "yahoo"), "Yahoo Finance");
assert.equal(priceSourceName("zh", "eastmoney"), "东方财富");
assert.equal(priceSourceName("en", "EASTMONEY"), "Eastmoney");
assert.equal(priceSourceName("zh", undefined), "收盘价", "未知来源不编造");

// WBD 2026-10-23 线上实例:最新收盘 2026-10-06,已过期
assert.equal(priceFactNote("zh", { date: "2026-10-06", source: "yahoo", stale: true }), "2026-10-06 收盘 · 已过期 · Yahoo\u00a0Finance");
assert.equal(priceFactNote("en", { date: "2026-10-22", source: "yahoo", stale: false }), "2026-10-22 close · Yahoo\u00a0Finance");
assert.equal(priceFactNote("zh", null), null);

// 来源名内不可断行(窄屏不把 "Yahoo Finance" 拆两行),日期与来源之间仍可在「·」处换行
assert.ok(!/Yahoo Finance/.test(priceFactNote("zh", { date: "2026-10-22", source: "yahoo" })!), "来源名用不换行空格");

console.log("asOf.check OK");
