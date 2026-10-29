import React from "react";
// 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/components/investor/InvestorBlocks.check.tsx
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { QuarterMovesBlock } from "./QuarterMovesBlock";
import type { QuarterSummary } from "@/lib/managers/quarterSummary";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
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


import { InvestorHoldingsTable } from "./InvestorHoldingsTable";

{
  const holdings: import("@/lib/managers/types").Holding[] = Array.from({ length: 105 }, (_, i) => ({ cusip: `C${i}`, issuer: `CO ${i}`, value: 1000 - i, shares: 10, weight: (1000 - i) / 1e5 }));
  holdings.push({ cusip: "C0", issuer: "CO 0", value: 5, shares: 1, weight: 0, putCall: "Call" });
  const changeByKey = new Map([
    ["C0|", { cusip: "C0", issuer: "CO 0", kind: "decreased" as const, prevShares: 100, shares: 10, value: 1000, deltaPct: -0.9, splitFactor: 10 }],
    ["C1|", { cusip: "C1", issuer: "CO 1", kind: "new" as const, prevShares: 0, shares: 10, value: 999, deltaPct: null }],
  ]);
  const rowSignals = new Map([
    ["C2", { conviction: { label: "连续增持·4季", signal: "accumulating" as const } }],
    ["C3", { conviction: { label: "重磅新进", signal: "fresh_conviction" as const } }],
  ]);
  const html = renderToStaticMarkup(
    <InvestorHoldingsTable holdings={holdings} lang="zh" cusipToTicker={new Map([["C4", "LONE"]])} verdicts={new Map()} holderCounts={new Map()}
      rowSignals={rowSignals} changeByKey={changeByKey} hasPrior lonelyTickers={new Set(["LONE"])} filingUrl="https://www.sec.gov/x/" />,
  );
  const t = text(html);
  assert.ok(html.includes('id="holdings"') && html.includes("scroll-mt-32"), "锚点 id");
  assert.ok(html.includes("<details") && t.includes("展开其余 90 只"), "10 行之外折叠,展开到 100 行(含期权行共 106 行)");
  assert.ok(t.includes("其余 6 只见 SEC 原文") && html.includes('href="https://www.sec.gov/x/"'), "超出 100 行给原文链接");
  assert.ok(t.includes("▼ −90%") && html.includes('title="已按 1 拆 10 调整"'), "本季列 + 拆股提示");
  assert.ok(t.includes("● 新进") && t.includes("未变"), "新进 / 未变");
  assert.ok(t.includes("连续增持·4季") && !t.includes("重磅新进"), "长期信号保留,重磅新进/增持不再重复");
  assert.ok(t.includes("独门"), "独门标签");
  for (const h of ["标的", "本季", "市值", "占比", "估值", "持有人数"]) assert.ok(t.includes(h), `列 ${h}`);
  assert.ok(!t.includes("持股数") && !t.includes("信号"), "删掉股数列与信号列");
  const few = renderToStaticMarkup(
    <InvestorHoldingsTable holdings={holdings.slice(0, 3)} lang="en" cusipToTicker={new Map()} verdicts={new Map()} holderCounts={new Map()}
      rowSignals={new Map()} changeByKey={new Map()} hasPrior={false} lonelyTickers={new Set()} filingUrl="u" />,
  );
  assert.ok(!few.includes("<details") && !text(few).includes("SEC filing"), "少于 10 行:无折叠、无原文链接");
  assert.ok(text(few).includes("This qtr") && !text(few).includes("Unchanged"), "无上季:本季列写 —");
}

console.log("InvestorBlocks.check OK");
