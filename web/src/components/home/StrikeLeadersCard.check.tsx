// 运行: npx tsx src/components/home/StrikeLeadersCard.check.tsx
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import StrikeLeadersCard from "./StrikeLeadersCard";

const leaders = [{ ticker: "PDD", rangeLo: 66, rangeHi: 424, price: 79, marginPct: 0.77, computedAt: "2026-10-23", priceDate: "2026-10-22" }];
const en = renderToStaticMarkup(<StrikeLeadersCard lang="en" leaders={leaders} total={17} />);
const zh = renderToStaticMarkup(<StrikeLeadersCard lang="zh" leaders={leaders} total={17} />);
assert.ok(!en.includes("。"), "英文卡片不出现中文句号");
assert.ok(/close\.\s/.test(en.replace(/<[^>]+>/g, "")), "英文日期句以英文句号结束");
assert.ok(zh.replace(/<[^>]+>/g, "").includes("收盘价。"), "中文日期句仍以中文句号结束");
console.log("StrikeLeadersCard.check OK");
