// 运行: npx tsx src/components/home/StrikeLeadersCard.check.tsx
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import StrikeLeadersCard from "./StrikeLeadersCard";

const leaders: import("@/lib/valuation/valuationSnapshot").StrikeLeader[] = [{ intrinsicValue:300,referenceValue:300,referenceKind:"oe_dcf_neutral",publication:{identityKey:"fixture",revisionId:"a".repeat(64),ticker:"PDD",priceDate:"2026-10-22",computedAt:"2026-10-23",attributes:{}},bucket:"below",inStrikeZone:true,reliable:true,coverage:"full", ticker: "PDD", rangeLo: 66, rangeHi: 424, price: 79, marginPct: 0.77, computedAt: "2026-10-23", priceDate: "2026-10-22" }];
const en = renderToStaticMarkup(<StrikeLeadersCard lang="en" leaders={leaders} total={17} />);
const zh = renderToStaticMarkup(<StrikeLeadersCard lang="zh" leaders={leaders} total={17} />);
assert.ok(en.includes("at shown prices") && zh.includes("按所示价格"), "aggregate membership remains dated even when visible rows verify");
assert.ok(en.includes("$300") && !en.includes("$343"), "raw IV must not be reconstructed from rounded margin");
assert.ok(!en.includes("。"), "英文卡片不出现中文句号");
assert.ok(/close\.\s/.test(en.replace(/<[^>]+>/g, "")), "英文日期句以英文句号结束");
assert.ok(zh.replace(/<[^>]+>/g, "").includes("收盘价。"), "中文日期句仍以中文句号结束");
const withPending = renderToStaticMarkup(<StrikeLeadersCard lang="zh" leaders={leaders} total={19} pending={12} />).replace(/<[^>]+>/g, "");
assert.ok(withPending.includes("19 只在击球区") && withPending.includes("另 12 只待确认"), "标题只计已确认,待确认单独说");
assert.ok(!en.includes("pending review"), "pending=0 时不出现待确认一行");
console.log("StrikeLeadersCard.check OK");
