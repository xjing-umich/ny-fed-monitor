// 运行: npx tsx src/components/stocks/StockConclusionBand.check.tsx
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { StockConclusionBand } from "./StockConclusionBand";
import { StockAnchorNav } from "./StockAnchorNav";
import { stockAnchors } from "@/lib/stocks/stockConclusion";

const html = renderToStaticMarkup(
  <StockConclusionBand
    lang="zh"
    left={<p>LEFT-SLOT</p>}
    marginText="安全边际 77%"
    holders={{
      count: 27, total: "$76.77B",
      leaders: [{ name: "巴菲特与阿贝尔", href: "/zh/investors/berkshire-hathaway" }, { name: "段永平", href: "/zh/investors/hh-international" }],
      snapshotNote: "持仓为2026-06-30、2026-09-30混合快照",
      quarter: "Q2 2026",
      moves: { opened: 0, added: 4, trimmed: 12, exited: 1 },
      exited: [{ name: "Andreas Halvorsen", href: "/zh/investors/viking" }],

    }}
  />,
);
const plain = html.replace(/<[^>]+>/g, " ");
for (const s of ["LEFT-SLOT", "安全边际 77%", "27 位超级投资者持有", "$76.77B", "巴菲特与阿贝尔", "段永平", "Andreas Halvorsen"]) {
  assert.ok(plain.includes(s), `结论带含 ${s}`);
}
const noMargin = renderToStaticMarkup(
  <StockConclusionBand lang="en" left={null} marginText={null}
    holders={{ count: 1, total: "$5M", leaders: [], snapshotNote: "Snapshot as of 2026-06-30", quarter: "Q2 2026", moves: { opened: 1, added: 0, trimmed: 0, exited: 0 }, exited: [] }} />,
).replace(/<[^>]+>/g, " ");
assert.ok(!noMargin.includes("Margin"), "无安全边际时不渲染");

assert.ok(html.indexOf("混合快照") < html.indexOf("Q2 2026"), "快照口径紧邻摘要,动作季度另组");
assert.ok(!html.includes("md:grid-cols-[3fr_2fr]"), "不再左右分栏");
assert.ok(!noMargin.includes("Major holders"), "无姓名不造身份行");
const nav = renderToStaticMarkup(<StockAnchorNav lang="zh" anchors={stockAnchors({ valuation: true, quality: false, coOwned: false }, "zh")} />);
assert.ok(nav.includes('href="#holders"') && nav.includes('href="#valuation"') && nav.includes('href="#sources"'), "锚点链接");
assert.ok(!nav.includes('href="#quality"'), "没有的区块不出现");
assert.ok(nav.includes("md:sticky") && nav.includes("md:top-14") && nav.includes("lg:top-[60px]"), "≥768px 吸顶并避开顶栏");
assert.ok(!/class="[^"]*(?<![:\w-])sticky/.test(nav), "<768px 不吸顶(没有无前缀的 sticky)");
console.log("StockConclusionBand.check OK");
