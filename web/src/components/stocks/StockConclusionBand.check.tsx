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
      line: "27 位持有 · 合计 $76.77B",
      quarter: "Q2 2026",
      moves: { opened: 0, added: 4, trimmed: 12, exited: 1 },
      exited: [{ name: "Andreas Halvorsen", href: "/zh/investors/viking" }],
      trend: [26, 27, 27],
    }}
  />,
);
const plain = html.replace(/<[^>]+>/g, " ");
for (const s of ["价格相对价值带", "谁在持有", "LEFT-SLOT", "安全边际 77%", "27 位持有 · 合计 $76.77B", "Andreas Halvorsen"]) {
  assert.ok(plain.includes(s), `结论带含 ${s}`);
}
const noMargin = renderToStaticMarkup(
  <StockConclusionBand lang="en" left={null} marginText={null}
    holders={{ line: "1 holder · $5.0M combined", quarter: "Q2 2026", moves: { opened: 1, added: 0, trimmed: 0, exited: 0 }, exited: [], trend: [1] }} />,
).replace(/<[^>]+>/g, " ");
assert.ok(!noMargin.includes("Margin"), "无安全边际时不渲染");

const nav = renderToStaticMarkup(<StockAnchorNav lang="zh" anchors={stockAnchors({ valuation: true, quality: false, coOwned: false }, "zh")} />);
assert.ok(nav.includes('href="#holders"') && nav.includes('href="#valuation"') && nav.includes('href="#sources"'), "锚点链接");
assert.ok(!nav.includes('href="#quality"'), "没有的区块不出现");
assert.ok(nav.includes("md:sticky") && nav.includes("md:top-14") && nav.includes("lg:top-[60px]"), "≥768px 吸顶并避开顶栏");
assert.ok(!/class="[^"]*(?<![:\w-])sticky/.test(nav), "<768px 不吸顶(没有无前缀的 sticky)");
console.log("StockConclusionBand.check OK");
