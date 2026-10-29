import React from "react";
// 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/components/investor/InvestorBlocks.check.tsx
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { QuarterMovesBlock } from "./QuarterMovesBlock";
import type { QuarterSummary } from "@/lib/managers/quarterSummary";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const s: QuarterSummary = {
  period: "2026-06-30", priorPeriod: "2026-03-31", latestValue: 31e9, priorValue: 30e9, latestCount: 40, priorCount: 41,
  netFlowUsd: 1.2e9, verdict: "buying", countVerdict: "selling",
  counts: { opened: 3, added: 12, trimmed: 8, exited: 4 },
  topMoves: [
    { cusip: "U", issuer: "UBER TECHNOLOGIES INC", kind: "new", flowUsd: 4e8, deltaPct: null, weightAfter: 0.013 },
    { cusip: "K", issuer: "KLA CORP", kind: "decreased", flowUsd: -2e8, deltaPct: -0.156, weightAfter: 0.02, splitFactor: 10 },
  ],
  exits: [
    { cusip: "E1", issuer: "E1 CO", priorValue: 9 }, { cusip: "E2", issuer: "E2 CO", priorValue: 8 },
    { cusip: "E3", issuer: "E3 CO", priorValue: 7 }, { cusip: "E4", issuer: "E4 CO", priorValue: 6 },
  ],
};
const props = { summary: s, quarter: "Q2 2026", nameOf: (_c: string, i: string) => i, hrefOf: (c: string) => `/stocks/${c}` };
for (const lang of ["zh", "en"] as const) {
  const html = renderToStaticMarkup(<QuarterMovesBlock lang={lang} {...props} />);
  const t = text(html);
  assert.ok(html.includes('id="moves"') && html.includes("scroll-mt-32"), `${lang} 锚点 id`);
  assert.ok(t.includes(lang === "zh" ? "净买入约 12亿美元" : "net buyer of about $1.2B"), `${lang} 结论句`);
  assert.ok(t.includes(lang === "zh" ? "● 新进" : "● New") && t.includes("−16%"), `${lang} 前几笔`);
  if (lang === "zh") assert.ok(t.includes("已按 1 拆 10 调整"), "zh 拆股说明");
  assert.ok(t.includes(lang === "zh" ? "共 ● 新进 3" : "In all: ● 3 new"), `${lang} 计数行`);
  assert.ok(t.includes("E1 CO") && !t.includes("E4 CO") && t.includes(lang === "zh" ? "等 1 只" : "+1 more"), `${lang} 清仓前 3 + 其余`);
  assert.ok(t.includes(lang === "zh" ? "2026年6月30日 之后的买卖这里看不到" : "after Jun 30, 2026 aren't visible here"), `${lang} 滞后一句`);
  assert.ok(t.includes(lang === "zh" ? "金额按季末价估算，只算正股" : "estimated at quarter-end prices"), `${lang} 口径注`);
  assert.ok(html.includes('href="/stocks/U"'), `${lang} 链接到个股页`);
  assert.ok(!/text-\[var\(--tt-(positive|negative|warn)\)\]/.test(html), `${lang} 不用红绿`);
}
// 英文拆股说明(10 拆 1 正向)
assert.ok(text(renderToStaticMarkup(<QuarterMovesBlock lang="en" {...props} />)).includes("Adjusted for a 10-for-1 split"));
console.log("InvestorBlocks.check OK");
