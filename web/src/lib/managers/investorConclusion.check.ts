import assert from "node:assert/strict";
import {
  summaryForDetail, investorVerdictChip, valueChangeSplit, valueSplitNote, conclusionSentence, moveDeltaText,
  movesCountsLine, splitNote, quarterCell, investorAnchors, holdingsSplit, top5Share, HOLDINGS_MAX,
} from "./investorConclusion";
import { assembleManagerDetail } from "./assemble";
import type { QuarterSummary } from "./quarterSummary";

const base: QuarterSummary = {
  period: "2026-06-30", priorPeriod: "2026-03-31", latestValue: 108, priorValue: 100, latestCount: 3, priorCount: 3,
  netFlowUsd: 3, verdict: "buying", countVerdict: "selling",
  counts: { opened: 1, added: 2, trimmed: 3, exited: 1 },
  topMoves: [{ cusip: "U", issuer: "UBER", kind: "new", flowUsd: 2, deltaPct: null, weightAfter: 0.04 }],
  exits: [{ cusip: "X", issuer: "XCO", priorValue: 1 }],
};
const big = (s: Partial<QuarterSummary>): QuarterSummary => ({ ...base, ...s });

// 净额不足 2% 仍需说清方向;只有清仓时不能写成买卖相抵。
const exitOnly = big({ netFlowUsd: -1, priorValue: 1000, verdict: "mixed", counts: { opened: 0, added: 0, trimmed: 0, exited: 1 }, topMoves: [{ cusip: "X", issuer: "XCO", kind: "exited", flowUsd: -1, deltaPct: -1, weightAfter: null }] });
assert.match(conclusionSentence(exitOnly, "Q2", (m) => m.issuer, "zh"), /净卖出约 1美元/);
assert.match(conclusionSentence(exitOnly, "Q2", (m) => m.issuer, "en"), /net seller of about \$1/);

// 徽章:按金额,中性色。
assert.deepEqual(investorVerdictChip(base, "zh"), { label: "▲ 本季净买入", tone: "neutral" });
assert.equal(investorVerdictChip(big({ verdict: "selling" }), "en")!.label, "▼ Net seller this quarter");
assert.equal(investorVerdictChip(big({ verdict: "mixed" }), "zh")!.label, "基本持平");
assert.equal(investorVerdictChip(null, "zh"), undefined);

// 涨跌拆分:+8% = 交易 +3% + 股价 +5%;上季 0 → null。
const sp = valueChangeSplit(base)!;
assert.ok(Math.abs(sp.totalPct - 0.08) < 1e-12 && Math.abs(sp.tradePct - 0.03) < 1e-12 && Math.abs(sp.pricePct - 0.05) < 1e-12);
assert.equal(valueSplitNote(sp, "zh"), "较上季 +8%：交易约 +3%，股价约 +5%");
assert.equal(valueSplitNote(sp, "en"), "+8% vs last quarter: trading ≈+3%, prices ≈+5%");
assert.equal(valueSplitNote({ totalPct: -0.004, tradePct: -0.02, pricePct: 0.016 }, "zh"), "较上季 0%：交易约 −2%，股价约 +2%", "四舍五入到 0 不带符号");
assert.equal(valueChangeSplit(big({ priorValue: 0 })), null);

// 结论句。
const name = (m: { issuer: string }) => (m.issuer === "UBER" ? "Uber" : m.issuer);
const B = 1e9, M = 1e6;
assert.equal(
  conclusionSentence(big({ netFlowUsd: 1.2 * B, priorValue: 30 * B, topMoves: [{ ...base.topMoves[0], flowUsd: 400 * M }] }), "Q2 2026", name, "zh"),
  "Q2 2026 净买入约 12亿美元（约占组合 4%）；最大一笔是新进 Uber，约 4亿美元。",
);
assert.equal(
  conclusionSentence(big({ netFlowUsd: -1.2 * B, priorValue: 30 * B, verdict: "selling", topMoves: [{ cusip: "X", issuer: "XCO", kind: "exited", flowUsd: -900 * M, deltaPct: -1, weightAfter: null }] }), "Q2 2026", name, "en"),
  "Q2 2026: net seller of about $1.2B (about 4% of the portfolio); the biggest move was exiting XCO, about $900M.",
);
assert.equal(
  conclusionSentence(big({ netFlowUsd: 0.1 * B, priorValue: 30 * B, verdict: "mixed" }), "Q2 2026", name, "zh"),
  "Q2 2026 净买入约 1亿美元（不到组合的 1%）；最大一笔是新进 Uber，约 2美元。",
);
assert.equal(conclusionSentence(big({ priorValue: 0, topMoves: [] }), "Q2", name, "zh"), "Q2 净买入约 3美元。", "上季 0、无前 5 笔:不出括号与后半句");

// 幅度、计数、拆股说明。
assert.equal(moveDeltaText({ kind: "increased", deltaPct: 0.354 }, "zh"), "+35%");
assert.equal(moveDeltaText({ kind: "decreased", deltaPct: -0.2 }, "en"), "−20%");
assert.equal(moveDeltaText({ kind: "increased", deltaPct: 0.004 }, "zh"), "+<1%");
assert.equal(moveDeltaText({ kind: "new", deltaPct: null }, "zh"), "新进");
assert.equal(moveDeltaText({ kind: "exited", deltaPct: -1 }, "en"), "Exited");
assert.equal(movesCountsLine(base.counts, "zh"), "共 ● 新进 1 · ▲ 增持 2 · ▼ 减持 3 · ○ 清仓 1");
assert.equal(movesCountsLine(base.counts, "en"), "In all: ● 1 new · ▲ 2 added · ▼ 3 trimmed · ○ 1 exited");
assert.equal(splitNote(5, "zh"), "已按 1 拆 5 调整");
assert.equal(splitNote(1.5, "zh"), "已按 2 拆 3 调整");
assert.equal(splitNote(0.1, "zh"), "已按 10 并 1 调整");
assert.equal(splitNote(5, "en"), "Adjusted for a 5-for-1 split");
assert.equal(splitNote(0.1, "en"), "Adjusted for a 1-for-10 reverse split");

// “本季”列。
const ch = (kind: "new" | "increased" | "decreased", deltaPct: number | null, splitFactor?: number) =>
  ({ cusip: "C", issuer: "C", kind, prevShares: 1, shares: 1, value: 1, deltaPct, splitFactor });
assert.deepEqual(quarterCell(ch("new", null), true, "zh"), { text: "● 新进" });
assert.deepEqual(quarterCell(ch("increased", 0.354), true, "zh"), { text: "▲ +35%" });
assert.deepEqual(quarterCell(ch("decreased", -0.156, 10), true, "zh"), { text: "▼ −16%", title: "已按 1 拆 10 调整" });
assert.deepEqual(quarterCell(undefined, true, "en"), { text: "Unchanged" });
assert.deepEqual(quarterCell(undefined, false, "zh"), { text: "—" }, "无上季:不说未变");

// 锚点:没有数据的区块不出现;“关于”总在。
assert.deepEqual(investorAnchors({ moves: true, holdings: true, valuation: true }, "zh").map((a) => `${a.id}:${a.label}`), ["moves:本季动作", "holdings:持仓", "valuation:估值", "about:关于"]);
assert.deepEqual(investorAnchors({ moves: false, holdings: true, valuation: false }, "en").map((a) => a.id), ["holdings", "about"]);

// 持仓表分段:10 + 最多 90 + 其余链接。
const rows = Array.from({ length: 1234 }, (_, i) => i);
const hs = holdingsSplit(rows);
assert.equal(hs.shown.length, 10); assert.equal(hs.folded.length, HOLDINGS_MAX - 10); assert.equal(hs.overflow, 1234 - HOLDINGS_MAX);
assert.deepEqual(holdingsSplit([1, 2, 3]), { shown: [1, 2, 3], folded: [], overflow: 0 });
assert.equal(holdingsSplit(Array.from({ length: 91 }, (_, i) => i)).folded.length, 81, "Tweedy 91 只:展开后全部可见");

// 前 5 大占比。
assert.equal(top5Share([50, 20, 10, 10, 5, 5]), 0.95);
assert.equal(top5Share([]), null);

// 页面是否显示本季动作:零持仓 / 无上季 / 无变化 → null。
{
  const mgr = { cik: "1", slug: "m", name: "M", person: "M" };
  const f = (period: string, holdings: { cusip: string; shares: number }[]) => ({ period, filedAt: "", accession: period, totalValue: 0, holdings: holdings.map((h) => ({ ...h, issuer: h.cusip, value: h.shares, weight: 0.5 })) });
  assert.equal(summaryForDetail(assembleManagerDetail(mgr, [f("2026-06-30", [{ cusip: "A", shares: 1 }])])), null, "无上季");
  assert.equal(summaryForDetail(assembleManagerDetail(mgr, [f("2026-03-31", [{ cusip: "A", shares: 1 }]), f("2026-06-30", [])])), null, "零持仓");
  assert.equal(summaryForDetail(assembleManagerDetail(mgr, [f("2026-03-31", [{ cusip: "A", shares: 1 }]), f("2026-06-30", [{ cusip: "A", shares: 1 }])])), null, "无变化");
  const s = summaryForDetail(assembleManagerDetail(mgr, [f("2026-03-31", [{ cusip: "A", shares: 1 }]), f("2026-06-30", [{ cusip: "A", shares: 2 }])]));
  assert.equal(s?.verdict, "buying"); assert.equal(s?.priorPeriod, "2026-03-31");
}

assert.equal(valueChangeSplit(big({ latestValue: 1, priorValue: 100 })), null, "范围剧变不将余额变化说成股价贡献");
console.log("investorConclusion.check OK");
