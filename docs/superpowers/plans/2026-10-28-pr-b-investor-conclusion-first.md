# PR B：投资人页先结论后证据 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 投资人页首屏 10 秒内回答“这季他主要买了什么、卖了什么、净买还是净卖”。持仓表能看全，重复信息删掉；列表页的判定与详情页统一为按金额。

**Architecture:** 展示决策全部放进纯函数模块 `investorConclusion.ts`（结论徽章、结论句、涨跌拆分、拆股说明、“本季”单元格、锚点、持仓表分段），数据来自 PR A 的 `summarizeQuarter`。页面只做装配：新组件 `QuarterMovesBlock`（本季动作块）、`InvestorHoldingsTable`（从 page.tsx 抽出并改造），锚点导航复用个股页组件（泛化为 `PageAnchorNav`）。全部 RSC，展开用原生 `<details>`，零 hydration。

**Tech Stack:** Next.js 16 App Router（RSC、ISR）、Tailwind v4、`react-dom/server` 的 `renderToStaticMarkup` 做渲染检查、`tsx` 跑 `*.check.ts(x)`。

**Spec:** `docs/superpowers/specs/2026-10-28-investor-conclusion-first-design.md`（§四 PR B、§五、§六、§七）

**前置：** PR A（`docs/superpowers/plans/2026-10-28-pr-a-13f-split-adjust.md`）已合入 `db-foundation` 并上线，两张新表已建好、已跑过一次共识。spec §七要求的个股页 PR 2 也应已合入。本计划从最新的 `db-foundation` 开分支 `feat/investor-conclusion-first`。

## Global Constraints

- URL、SSR、JSON-LD、`generateMetadata`、埋点事件名不变；零 hydration：不新增客户端组件，展开用原生 `<details>`。
- 列表页筛选参数 `vf` 的取值仍是 `buying | selling | mixed`，只改判定口径和文字。
- 不新增 Supabase 查询：详情页的季度汇总用页面已加载的 `d.changes / d.latest / d.prior` 现算，与入库时写表的是同一个 `summarizeQuarter`。
- 颜色：绿色只表达估值（个股页 spec §6）。13F 动作用字形 ● 新建 ▲ 增持 ▼ 减持 ○ 清仓，文字用正文色或灰色，不用红绿。用词统一为“增持 / 减持”。
- 金额按季末价估算、只算正股，页面要写明；合规上只说动作和金额估算，不评价好坏。
- 中英文文案各自按 `docs/copy-voice.md` 核对：具体、带数字，不写空泛营销腔。
- 锚点导航与个股页同一做法：`md:sticky md:top-14 lg:top-[60px]`；区块用 `scroll-mt-32`；区块没有数据就不出现在锚点里。
- 持仓表：默认 10 行，`<details>` 展开到最多 100 行，超出部分链接 SEC 原文。
- 代码注释用中文、风格同周边；检查脚本用 `node:assert/strict`，运行方式 `cd web && npx tsx --tsconfig scripts/tsconfig.json <path>`。
- git 命令前导出 `PATH=/private/tmp/claude-501/-Users-junlinzhu-Desktop-TheCompounder/a7c1da3e-a981-4649-8f27-6ea4dc306a59/scratchpad/gitshim:$PATH`。

**相对 spec 的细化（以本计划为准）：**
1. **关键事实只有 2 项**（组合市值、持仓数）。spec 小标题写“3 项”，正文只列了 2 项，另一项是“删掉的东西”。
2. **滞后一句不重复日期来源。** 标题下的 `FreshnessBadge` 已经写了“数据截至 2026-06-30（2026-08-14 提交）”，所以本季动作块里只写“13F 只披露季末持仓，2026-06-30 之后的买卖这里看不到。”

## Review Focus

1. **持仓超过 100 只**（Bridgewater 上千只）：展开区最多 90 行，其余给 SEC 原文链接，页面 HTML 不能因此膨胀。→ Task 2（`holdingsSplit`）、Task 5（渲染）加检查。
2. **本季动作很少或只有清仓**（只清了 1 只、没有买入）：结论句、前 5 笔、计数行都要通顺，不出现空括号或“最大一笔是undefined”。→ Task 2 加检查。
3. **上季正股市值为 0**（上季只有期权）：涨跌拆分和“约占组合 X%”都不显示，不出现 NaN / Infinity。→ Task 2 加检查。
4. **长公司名在 375px**：前 5 笔每行名字截断，金额与幅度不被挤掉，无横向滚动。→ Task 7 预览核对逐项看。
5. **零持仓季、无上季、本季无任何变化**：不显示本季动作块、不显示徽章，锚点里也没有“本季动作”。→ Task 2（`summaryForDetail`）加检查，Task 6 页面用它。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `web/src/lib/entity/moveWords.ts`（新） | 动作字形与词：`MOVE_GLYPH`、`moveWord`、`moveLabel`。个股页 PR 2 若已提供同等导出，则复用它，不新建 |
| `web/src/components/common/qoqDirection.tsx` | `MOVE_LABEL` 改为引用 `moveWord`（去重） |
| `web/src/lib/managers/investorConclusion.ts`（新） | 投资人页展示决策纯函数 |
| `web/src/lib/managers/investorConclusion.check.ts`（新） | 断言 |
| `web/src/components/common/PageAnchorNav.tsx`（新） | 通用页内锚点导航（由 `StockAnchorNav` 泛化） |
| `web/src/components/stocks/StockAnchorNav.tsx` | 改为 `PageAnchorNav` 的薄封装 |
| `web/src/components/investor/QuarterMovesBlock.tsx`（新） | 本季动作块 |
| `web/src/components/investor/InvestorHoldingsTable.tsx`（新） | 持仓表（从 page.tsx 抽出，改列、改分段） |
| `web/src/components/investor/InvestorBlocks.check.tsx`（新） | 两个组件的渲染检查 |
| `web/src/app/[lang]/investors/[slug]/page.tsx` | 装配；删四格、清仓行、隐含预期、独门小节、旧持仓表 |
| `web/src/app/[lang]/investors/[slug]/movesCount.ts`、`movesCount.check.ts` | 删除（由 `summary.counts` 取代） |
| `web/src/lib/managers/rowSignals.ts` | “连续加仓 / 从不减仓”改为“连续增持 / 从不减持” |
| `web/src/lib/managers/supabase.ts`、`supabaseMap.check.ts` | 列表页 `verdict` 改用金额判定 |
| `web/src/app/[lang]/investors/InvestorListClient.tsx` | 列表页判定文字、中性色、动作字形 |

---

### Task 1：动作字形与词

**Files:**
- Create: `web/src/lib/entity/moveWords.ts`
- Modify: `web/src/components/common/qoqDirection.tsx:8-11`
- Test: `web/src/lib/managers/investorConclusion.check.ts`（本任务先建文件，只放字形断言）

**Interfaces:**
- Produces:
  - `type MoveKind = "new" | "increased" | "decreased" | "exited"`
  - `MOVE_GLYPH: Record<MoveKind, string>`
  - `moveWord(kind: MoveKind, lang: Lang): string`
  - `moveLabel(kind: MoveKind, lang: Lang): string`（`"▲ 增持"`）

- [ ] **Step 0: 先看 PR 2 是否已提供**

Run: `cd web && grep -rn "MOVE_GLYPH\|\"▲\"" src --include='*.ts' --include='*.tsx' | head`

如果 PR 2 已导出等价的字形表与词，就改用它的路径和名字，跳过本任务的 Step 1–3，并把后续任务里的 `@/lib/entity/moveWords` 换成 PR 2 的模块。字形与用词以 spec 为准：● 新建 ▲ 增持 ▼ 减持 ○ 清仓 / New · Added · Trimmed · Exited。

- [ ] **Step 1: 写失败的检查**

`web/src/lib/managers/investorConclusion.check.ts`：

```ts
// 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/managers/investorConclusion.check.ts
import assert from "node:assert/strict";
import { MOVE_GLYPH, moveLabel, moveWord } from "../entity/moveWords";

assert.deepEqual(MOVE_GLYPH, { new: "●", increased: "▲", decreased: "▼", exited: "○" });
assert.equal(moveLabel("increased", "zh"), "▲ 增持");
assert.equal(moveLabel("exited", "en"), "○ Exited");
assert.equal(moveWord("decreased", "zh"), "减持");
console.log("investorConclusion.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/managers/investorConclusion.check.ts`
Expected: FAIL，找不到模块 `../entity/moveWords`

- [ ] **Step 3: 实现**

`web/src/lib/entity/moveWords.ts`：

```ts
import type { Lang } from "@/lib/nav";

// 13F 动作的唯一说法(个股页 spec 2026-10-25 §6):用字形,不用颜色 —— 绿色只给估值。
export type MoveKind = "new" | "increased" | "decreased" | "exited";
export const MOVE_GLYPH: Record<MoveKind, string> = { new: "●", increased: "▲", decreased: "▼", exited: "○" };
const WORD: Record<Lang, Record<MoveKind, string>> = {
  zh: { new: "新建", increased: "增持", decreased: "减持", exited: "清仓" },
  en: { new: "New", increased: "Added", decreased: "Trimmed", exited: "Exited" },
};
export function moveWord(kind: MoveKind, lang: Lang): string {
  return WORD[lang][kind];
}
export function moveLabel(kind: MoveKind, lang: Lang): string {
  return `${MOVE_GLYPH[kind]} ${moveWord(kind, lang)}`;
}
```

`qoqDirection.tsx`：删除 `MOVE_LABEL` 常量，`moveMarkText` 里 `return MOVE_LABEL[lang][kind];` 改为 `return moveWord(kind, lang);`，顶部加 `import { moveWord } from "@/lib/entity/moveWords";`。`MoveMark` 的显示不变（是否加字形由 PR 2 决定）。

- [ ] **Step 4: 运行，确认通过**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/managers/investorConclusion.check.ts && npx tsc --noEmit -p . | head`
Expected: `investorConclusion.check OK`；tsc 无输出

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/entity/moveWords.ts web/src/components/common/qoqDirection.tsx web/src/lib/managers/investorConclusion.check.ts
git commit -m "feat(investor): 13F 动作字形与用词单一来源"
```

---

### Task 2：投资人页展示决策（纯函数）

**Files:**
- Create: `web/src/lib/managers/investorConclusion.ts`
- Test: `web/src/lib/managers/investorConclusion.check.ts`

**Interfaces:**
- Consumes:
  - PR A：`summarizeQuarter`、`QuarterSummary`、`QuarterMove`（`@/lib/managers/quarterSummary`）；`ManagerDetail`、`HoldingChange`（`@/lib/managers/types`）
  - Task 1：`moveWord`、`moveLabel`、`MOVE_GLYPH`
  - `formatUSD`（`@/lib/format`）；`splitNames`（`@/lib/entity/quarterMovesText`）
- Produces:
  - `summaryForDetail(d: ManagerDetail): QuarterSummary | null`
  - `investorVerdictChip(s: QuarterSummary | null, lang: Lang): { label: string; tone: "neutral" } | undefined`
  - `type ValueSplit = { totalPct: number; tradePct: number; pricePct: number }`
  - `valueChangeSplit(s: QuarterSummary): ValueSplit | null`
  - `valueSplitNote(sp: ValueSplit, lang: Lang): string`
  - `conclusionSentence(s: QuarterSummary, quarter: string, nameOf: (m: QuarterMove) => string, lang: Lang): string`
  - `moveDeltaText(m: Pick<QuarterMove, "kind" | "deltaPct">, lang: Lang): string`
  - `movesCountsLine(c: QuarterSummary["counts"], lang: Lang): string`
  - `splitNote(factor: number, lang: Lang): string`
  - `quarterCell(change: HoldingChange | undefined, hasPrior: boolean, lang: Lang): { text: string; title?: string }`
  - `type InvestorAnchor = { id: "moves" | "holdings" | "valuation" | "about"; label: string }`
  - `investorAnchors(has: { moves: boolean; holdings: boolean; valuation: boolean }, lang: Lang): InvestorAnchor[]`
  - `HOLDINGS_VISIBLE = 10`、`HOLDINGS_MAX = 100`
  - `holdingsSplit<T>(rows: T[]): { shown: T[]; folded: T[]; overflow: number }`
  - `top5Share(values: number[]): number | null`

- [ ] **Step 1: 写失败的检查**

把以下内容追加到 `investorConclusion.check.ts`（`console.log` 之前；import 放文件顶部）：

```ts
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
  "Q2 2026 净买入约 $1.20B（约占组合 4%）；最大一笔是新建 Uber，约 $400.0M。",
);
assert.equal(
  conclusionSentence(big({ netFlowUsd: -1.2 * B, priorValue: 30 * B, verdict: "selling", topMoves: [{ cusip: "X", issuer: "XCO", kind: "exited", flowUsd: -900 * M, deltaPct: -1, weightAfter: null }] }), "Q2 2026", name, "en"),
  "Q2 2026: net seller of about $1.20B (about 4% of the portfolio); the biggest move was exiting XCO, about $900.0M.",
);
assert.equal(
  conclusionSentence(big({ netFlowUsd: 0.1 * B, priorValue: 30 * B, verdict: "mixed" }), "Q2 2026", name, "zh"),
  "Q2 2026 买卖大致相抵（净额约 $100.0M，不到组合的 1%）；最大一笔是新建 Uber，约 $2。",
);
assert.equal(conclusionSentence(big({ priorValue: 0, topMoves: [] }), "Q2", name, "zh"), "Q2 净买入约 $3。", "上季 0、无前 5 笔:不出括号与后半句");

// 幅度、计数、拆股说明。
assert.equal(moveDeltaText({ kind: "increased", deltaPct: 0.354 }, "zh"), "+35%");
assert.equal(moveDeltaText({ kind: "decreased", deltaPct: -0.2 }, "en"), "−20%");
assert.equal(moveDeltaText({ kind: "increased", deltaPct: 0.004 }, "zh"), "+<1%");
assert.equal(moveDeltaText({ kind: "new", deltaPct: null }, "zh"), "新建");
assert.equal(moveDeltaText({ kind: "exited", deltaPct: -1 }, "en"), "Exited");
assert.equal(movesCountsLine(base.counts, "zh"), "共 ● 新建 1 · ▲ 增持 2 · ▼ 减持 3 · ○ 清仓 1");
assert.equal(movesCountsLine(base.counts, "en"), "In all: ● 1 new · ▲ 2 added · ▼ 3 trimmed · ○ 1 exited");
assert.equal(splitNote(5, "zh"), "已按 1 拆 5 调整");
assert.equal(splitNote(1.5, "zh"), "已按 2 拆 3 调整");
assert.equal(splitNote(0.1, "zh"), "已按 10 并 1 调整");
assert.equal(splitNote(5, "en"), "Adjusted for a 5-for-1 split");
assert.equal(splitNote(0.1, "en"), "Adjusted for a 1-for-10 reverse split");

// “本季”列。
const ch = (kind: "new" | "increased" | "decreased", deltaPct: number | null, splitFactor?: number) =>
  ({ cusip: "C", issuer: "C", kind, prevShares: 1, shares: 1, value: 1, deltaPct, splitFactor });
assert.deepEqual(quarterCell(ch("new", null), true, "zh"), { text: "● 新建" });
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/managers/investorConclusion.check.ts`
Expected: FAIL，找不到模块 `./investorConclusion`

- [ ] **Step 3: 实现**

`web/src/lib/managers/investorConclusion.ts`：

```ts
// investorConclusion.ts — 投资人页"先结论后证据"的展示决策(纯函数,无 I/O)。
// 数字全部来自 summarizeQuarter(与入库写 manager_quarter_summary 的是同一个函数),这里只决定怎么说。
import type { Lang } from "@/lib/nav";
import type { HoldingChange, ManagerDetail } from "@/lib/managers/types";
import { summarizeQuarter, type QuarterMove, type QuarterSummary } from "@/lib/managers/quarterSummary";
import { MOVE_GLYPH, moveLabel, moveWord } from "@/lib/entity/moveWords";
import { formatUSD } from "@/lib/format";

/** 本季动作块与徽章的数据;零持仓季 / 无上季 / 本季无正股变化 → null(块、徽章、锚点都不出)。 */
export function summaryForDetail(d: ManagerDetail): QuarterSummary | null {
  if (!d.prior || d.latest.holdings.length === 0) return null;
  if (!d.changes.some((c) => !c.putCall)) return null;
  return summarizeQuarter({ period: d.latest.period, priorPeriod: d.prior.period, latest: d.latest.holdings, prior: d.prior.holdings, changes: d.changes });
}

const CHIP: Record<Lang, Record<QuarterSummary["verdict"], string>> = {
  zh: { buying: "▲ 本季净买入", selling: "▼ 本季净卖出", mixed: "基本持平" },
  en: { buying: "▲ Net buyer this quarter", selling: "▼ Net seller this quarter", mixed: "Roughly unchanged" },
};
/** 标题徽章:按金额判定,中性色(绿色只给估值)。 */
export function investorVerdictChip(s: QuarterSummary | null, lang: Lang): { label: string; tone: "neutral" } | undefined {
  return s ? { label: CHIP[lang][s.verdict], tone: "neutral" } : undefined;
}

export type ValueSplit = { totalPct: number; tradePct: number; pricePct: number };
/** 组合市值变化 = 交易部分(净额)+ 价格部分(其余)。上季正股市值为 0 → null。 */
export function valueChangeSplit(s: QuarterSummary): ValueSplit | null {
  if (!(s.priorValue > 0)) return null;
  const totalPct = (s.latestValue - s.priorValue) / s.priorValue;
  const tradePct = s.netFlowUsd / s.priorValue;
  return { totalPct, tradePct, pricePct: totalPct - tradePct };
}

const signedPct = (x: number): string => {
  const r = Math.round(x * 100);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}%`;
};
export function valueSplitNote(sp: ValueSplit, lang: Lang): string {
  return lang === "zh"
    ? `较上季 ${signedPct(sp.totalPct)}：交易约 ${signedPct(sp.tradePct)}，股价约 ${signedPct(sp.pricePct)}`
    : `${signedPct(sp.totalPct)} vs last quarter: trading ≈${signedPct(sp.tradePct)}, prices ≈${signedPct(sp.pricePct)}`;
}

const EN_VERB: Record<QuarterMove["kind"], string> = { new: "a new position in", increased: "adding to", decreased: "trimming", exited: "exiting" };

/** 首屏结论句:"Q2 2026 净买入约 $1.20B（约占组合 4%）；最大一笔是新建 Uber，约 $400.0M。" */
export function conclusionSentence(s: QuarterSummary, quarter: string, nameOf: (m: QuarterMove) => string, lang: Lang): string {
  const amt = formatUSD(Math.abs(s.netFlowUsd));
  const share = s.priorValue > 0 ? Math.abs(s.netFlowUsd) / s.priorValue : null;
  const shareTxt = share == null ? null
    : share < 0.01 ? (lang === "zh" ? "不到组合的 1%" : "under 1% of the portfolio")
    : lang === "zh" ? `约占组合 ${Math.round(share * 100)}%` : `about ${Math.round(share * 100)}% of the portfolio`;
  const top = s.topMoves[0];
  if (lang === "zh") {
    const head = s.verdict === "mixed"
      ? `${quarter} 买卖大致相抵（净额约 ${amt}${shareTxt ? `，${shareTxt}` : ""}）`
      : `${quarter} ${s.verdict === "buying" ? "净买入" : "净卖出"}约 ${amt}${shareTxt ? `（${shareTxt}）` : ""}`;
    return top ? `${head}；最大一笔是${moveWord(top.kind, "zh")} ${nameOf(top)}，约 ${formatUSD(Math.abs(top.flowUsd))}。` : `${head}。`;
  }
  const head = s.verdict === "mixed"
    ? `${quarter}: buys and sells roughly offset (net about ${amt}${shareTxt ? `, ${shareTxt}` : ""})`
    : `${quarter}: net ${s.verdict === "buying" ? "buyer" : "seller"} of about ${amt}${shareTxt ? ` (${shareTxt})` : ""}`;
  return top ? `${head}; the biggest move was ${EN_VERB[top.kind]} ${nameOf(top)}, about ${formatUSD(Math.abs(top.flowUsd))}.` : `${head}.`;
}

/** 前 5 笔与"本季"列的幅度:+35% / −20% / 不到 1% 写 <1%;新建 / 清仓直接写词。 */
export function moveDeltaText(m: Pick<QuarterMove, "kind" | "deltaPct">, lang: Lang): string {
  if (m.kind === "new" || m.kind === "exited" || m.deltaPct == null) return moveWord(m.kind, lang);
  const r = Math.round(Math.abs(m.deltaPct) * 100);
  return `${m.deltaPct > 0 ? "+" : "−"}${r === 0 ? "<1" : r}%`;
}

export function movesCountsLine(c: QuarterSummary["counts"], lang: Lang): string {
  const g = MOVE_GLYPH;
  return lang === "zh"
    ? `共 ${g.new} 新建 ${c.opened} · ${g.increased} 增持 ${c.added} · ${g.decreased} 减持 ${c.trimmed} · ${g.exited} 清仓 ${c.exited}`
    : `In all: ${g.new} ${c.opened} new · ${g.increased} ${c.added} added · ${g.decreased} ${c.trimmed} trimmed · ${g.exited} ${c.exited} exited`;
}

/** 拆股说明:系数写成小整数比。5 → "1 拆 5"、1.5 → "2 拆 3"、0.1 → "10 并 1"。 */
export function splitNote(factor: number, lang: Lang): string {
  const near = (x: number) => Math.abs(x - Math.round(x)) < 1e-3;
  let num = 0, den = 0;
  for (const d of [1, 2, 3, 4]) if (!num && near(factor * d)) { num = Math.round(factor * d); den = d; }
  for (const n of [1, 2, 3, 4]) if (!num && near(n / factor)) { num = n; den = Math.round(n / factor); }
  if (!num) return lang === "zh" ? `已按拆股调整（×${factor}）` : `Adjusted for a split (×${factor})`;
  if (lang === "zh") return num > den ? `已按 ${den} 拆 ${num} 调整` : `已按 ${den} 并 ${num} 调整`;
  return num > den ? `Adjusted for a ${num}-for-${den} split` : `Adjusted for a ${num}-for-${den} reverse split`;
}

/** 持仓表"本季"列。hasPrior=false(无上季可比)→ "—",不说"未变"。 */
export function quarterCell(change: HoldingChange | undefined, hasPrior: boolean, lang: Lang): { text: string; title?: string } {
  if (!hasPrior) return { text: "—" };
  if (!change) return { text: lang === "zh" ? "未变" : "Unchanged" };
  const text = change.kind === "new" ? moveLabel("new", lang) : `${MOVE_GLYPH[change.kind]} ${moveDeltaText(change, lang)}`;
  return change.splitFactor ? { text, title: splitNote(change.splitFactor, lang) } : { text };
}

export type InvestorAnchor = { id: "moves" | "holdings" | "valuation" | "about"; label: string };
const ANCHOR_LABEL: Record<Lang, Record<InvestorAnchor["id"], string>> = {
  zh: { moves: "本季动作", holdings: "持仓", valuation: "估值", about: "关于" },
  en: { moves: "This quarter", holdings: "Holdings", valuation: "Valuation", about: "About" },
};
export function investorAnchors(has: { moves: boolean; holdings: boolean; valuation: boolean }, lang: Lang): InvestorAnchor[] {
  const ids: InvestorAnchor["id"][] = [];
  if (has.moves) ids.push("moves");
  if (has.holdings) ids.push("holdings");
  if (has.valuation) ids.push("valuation");
  ids.push("about");
  return ids.map((id) => ({ id, label: ANCHOR_LABEL[lang][id] }));
}

// 持仓表:默认 10 行;<details> 展开到最多 100 行(Tweedy 91 只全可见);再多的给 SEC 原文链接,不撑大 HTML。
export const HOLDINGS_VISIBLE = 10;
export const HOLDINGS_MAX = 100;
export function holdingsSplit<T>(rows: T[]): { shown: T[]; folded: T[]; overflow: number } {
  return { shown: rows.slice(0, HOLDINGS_VISIBLE), folded: rows.slice(HOLDINGS_VISIBLE, HOLDINGS_MAX), overflow: Math.max(0, rows.length - HOLDINGS_MAX) };
}

/** 前 5 大持仓占正股市值的比例;无持仓 → null。 */
export function top5Share(values: number[]): number | null {
  const total = values.reduce((s, v) => s + v, 0);
  if (!(total > 0)) return null;
  return [...values].sort((a, b) => b - a).slice(0, 5).reduce((s, v) => s + v, 0) / total;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/managers/investorConclusion.check.ts`
Expected: `investorConclusion.check OK`

断言里结论句的期望值是按 `formatUSD` 的现有输出（`$1.20B`、`$400.0M`、`$2`）写的。若某条因 `formatUSD` 的格式不一致而失败，以 `formatUSD` 的实际输出为准改期望值，不改 `formatUSD`。

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/managers/investorConclusion.ts web/src/lib/managers/investorConclusion.check.ts
git commit -m "feat(investor): 先结论后证据的展示决策纯函数"
```

---

### Task 3：通用页内锚点导航

**Files:**
- Create: `web/src/components/common/PageAnchorNav.tsx`
- Modify: `web/src/components/stocks/StockAnchorNav.tsx`
- Test: `web/src/components/stocks/StockConclusionBand.check.tsx`（已有，跑通即可）

**Interfaces:**
- Produces: `PageAnchorNav({ ariaLabel, anchors }: { ariaLabel: string; anchors: { id: string; label: string }[] })`

- [ ] **Step 1: 实现**

`web/src/components/common/PageAnchorNav.tsx`：

```tsx
// 页内锚点:≥768px 纯 CSS sticky,避开顶栏(768–1023px 56px / ≥1024px 60px);手机不吸顶,免得两条常驻栏挤占阅读空间。零 JS,不做当前区块高亮。
// 个股页、投资人页共用。
export function PageAnchorNav({ ariaLabel, anchors }: { ariaLabel: string; anchors: { id: string; label: string }[] }) {
  return (
    <nav
      aria-label={ariaLabel}
      className="md:sticky md:top-14 lg:top-[60px] z-20 border-b border-[var(--tt-border)] bg-[var(--tt-bg)]"
    >
      <ul className="flex list-none gap-1 overflow-x-auto p-0">
        {anchors.map((a) => (
          <li key={a.id}>
            <a
              href={`#${a.id}`}
              className="inline-flex min-h-[44px] items-center whitespace-nowrap px-2 text-sm text-[var(--tt-muted)] no-underline transition-colors hover:text-[var(--tt-text)]"
            >
              {a.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

（与现在 `StockAnchorNav` 的 JSX 逐字相同，只把 `aria-label` 和 `anchors` 类型参数化。若 PR 2 已给它加了横向滚动提示，以 PR 2 合入后的版本为准搬过来。）

`StockAnchorNav.tsx` 改为：

```tsx
import type { Lang } from "@/lib/nav";
import { BAND_COPY, type StockAnchor } from "@/lib/stocks/stockConclusion";
import { PageAnchorNav } from "@/components/common/PageAnchorNav";

export function StockAnchorNav({ lang, anchors }: { lang: Lang; anchors: StockAnchor[] }) {
  return <PageAnchorNav ariaLabel={BAND_COPY[lang].anchorsAria} anchors={anchors} />;
}
```

- [ ] **Step 2: 运行既有检查**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/components/stocks/StockConclusionBand.check.tsx`
Expected: OK（输出 HTML 与重构前一致）

- [ ] **Step 3: Commit**

```bash
git add web/src/components/common/PageAnchorNav.tsx web/src/components/stocks/StockAnchorNav.tsx
git commit -m "refactor: 页内锚点导航泛化为 PageAnchorNav"
```

---

### Task 4：本季动作块组件

**Files:**
- Create: `web/src/components/investor/QuarterMovesBlock.tsx`
- Test: `web/src/components/investor/InvestorBlocks.check.tsx`

**Interfaces:**
- Consumes: Task 2 的 `conclusionSentence`、`moveDeltaText`、`movesCountsLine`、`splitNote`；Task 1 的 `moveLabel`、`MOVE_GLYPH`；`splitNames`；`fmtPct1`（`@/components/common/qoqDirection`）；`formatUSD`；`SectionHeading`
- Produces: `QuarterMovesBlock(props: { lang: Lang; summary: QuarterSummary; quarter: string; nameOf: (cusip: string, issuer: string) => string; hrefOf: (cusip: string) => string })`，根元素 `<section id="moves" className="scroll-mt-32">`

- [ ] **Step 1: 写失败的渲染检查**

`web/src/components/investor/InvestorBlocks.check.tsx`：

```tsx
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
  assert.ok(t.includes(lang === "zh" ? "净买入约 $1.20B" : "net buyer of about $1.20B"), `${lang} 结论句`);
  assert.ok(t.includes(lang === "zh" ? "● 新建" : "● New") && t.includes("−16%"), `${lang} 前几笔`);
  if (lang === "zh") assert.ok(t.includes("已按 1 拆 10 调整"), "zh 拆股说明");
  assert.ok(t.includes(lang === "zh" ? "共 ● 新建 3" : "In all: ● 3 new"), `${lang} 计数行`);
  assert.ok(t.includes("E1 CO") && !t.includes("E4 CO") && t.includes(lang === "zh" ? "等 1 只" : "+1 more"), `${lang} 清仓前 3 + 其余`);
  assert.ok(t.includes(lang === "zh" ? "2026-06-30 之后的买卖这里看不到" : "after 2026-06-30 aren't visible here"), `${lang} 滞后一句`);
  assert.ok(t.includes(lang === "zh" ? "金额按季末价估算，只算正股" : "estimated at quarter-end prices"), `${lang} 口径注`);
  assert.ok(html.includes('href="/stocks/U"'), `${lang} 链接到个股页`);
  assert.ok(!/text-\[var\(--tt-(positive|negative|warn)\)\]/.test(html), `${lang} 不用红绿`);
}
// 英文拆股说明(10 拆 1 正向)
assert.ok(text(renderToStaticMarkup(<QuarterMovesBlock lang="en" {...props} />)).includes("Adjusted for a 10-for-1 split"));
console.log("InvestorBlocks.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/components/investor/InvestorBlocks.check.tsx`
Expected: FAIL，找不到模块 `./QuarterMovesBlock`

- [ ] **Step 3: 实现**

`web/src/components/investor/QuarterMovesBlock.tsx`：

```tsx
import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { QuarterSummary } from "@/lib/managers/quarterSummary";
import { conclusionSentence, moveDeltaText, movesCountsLine, splitNote } from "@/lib/managers/investorConclusion";
import { MOVE_GLYPH, moveLabel } from "@/lib/entity/moveWords";
import { splitNames } from "@/lib/entity/quarterMovesText";
import { fmtPct1 } from "@/components/common/qoqDirection";
import { formatUSD } from "@/lib/format";
import { SectionHeading } from "@/components/common/SectionHeading";

const COPY = {
  zh: {
    eyebrow: "SEC 13F · 本季对上季",
    title: "本季动作",
    approx: (v: string) => `约 ${v}`,
    weight: (w: string) => `现占 ${w}`,
    exited: "清仓：",
    rest: (n: number) => ` 等 ${n} 只`,
    lag: (p: string) => `13F 只披露季末持仓，${p} 之后的买卖这里看不到。`,
    method: "金额按季末价估算，只算正股。",
    sep: "、",
  },
  en: {
    eyebrow: "SEC 13F · quarter over quarter",
    title: "This quarter",
    approx: (v: string) => `≈${v}`,
    weight: (w: string) => `now ${w}`,
    exited: "Exited: ",
    rest: (n: number) => ` +${n} more`,
    lag: (p: string) => `13F shows quarter-end positions only; trades after ${p} aren't visible here.`,
    method: "Dollar amounts are estimated at quarter-end prices, stocks only (no options).",
    sep: ", ",
  },
} as const;

// 投资人页首屏:一句按金额的结论 + 金额最大的几笔 + 一行计数 + 清仓名单 + 滞后与口径。
// 动作用字形不用颜色(绿色只给估值);数字来自 summarizeQuarter,与列表页同源。
export function QuarterMovesBlock({ lang, summary, quarter, nameOf, hrefOf }: {
  lang: Lang;
  summary: QuarterSummary;
  quarter: string;
  nameOf: (cusip: string, issuer: string) => string;
  hrefOf: (cusip: string) => string;
}): React.ReactElement {
  const c = COPY[lang];
  const { shown, rest } = splitNames(summary.exits);
  return (
    <section id="moves" aria-label={c.title} className="scroll-mt-32">
      <SectionHeading eyebrow={c.eyebrow} title={c.title} />
      <p className="mt-3 text-base text-[var(--tt-text)]">
        {conclusionSentence(summary, quarter, (m) => nameOf(m.cusip, m.issuer), lang)}
      </p>
      {summary.topMoves.length > 0 && (
        <ul className="mt-4 list-none divide-y divide-[var(--tt-border)] border-y border-[var(--tt-border)] p-0">
          {summary.topMoves.map((m) => (
            <li key={`${m.cusip}|${m.kind}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
              <span className="w-14 shrink-0 font-data text-xs text-[var(--tt-muted)]">{moveLabel(m.kind, lang)}</span>
              <Link href={hrefOf(m.cusip)} className="min-w-0 flex-1 truncate text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                {nameOf(m.cusip, m.issuer)}
              </Link>
              <span className="font-data tabular-nums text-[var(--tt-text)]">{c.approx(formatUSD(Math.abs(m.flowUsd)))}</span>
              {m.kind !== "new" && m.kind !== "exited" && (
                <span className="font-data tabular-nums text-[var(--tt-muted)]">{moveDeltaText(m, lang)}</span>
              )}
              {m.weightAfter != null && (
                <span className="font-data tabular-nums text-[var(--tt-faint)]">{c.weight(fmtPct1(m.weightAfter))}</span>
              )}
              {m.splitFactor && <span className="basis-full text-xs text-[var(--tt-faint)]">{splitNote(m.splitFactor, lang)}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-[var(--tt-muted)]">{movesCountsLine(summary.counts, lang)}</p>
      {shown.length > 0 && (
        <p className="mt-1 text-xs text-[var(--tt-muted)]">
          {`${MOVE_GLYPH.exited} ${c.exited}`}
          {shown.map((e, i) => (
            <React.Fragment key={e.cusip}>
              {i > 0 && c.sep}
              <Link href={hrefOf(e.cusip)} className="text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                {nameOf(e.cusip, e.issuer)}
              </Link>
            </React.Fragment>
          ))}
          {rest > 0 && c.rest(rest)}
        </p>
      )}
      <p className="mt-2 text-xs text-[var(--tt-faint)]">{c.lag(summary.period)} {c.method}</p>
    </section>
  );
}
```

> 前 5 笔里新建和清仓不再重复写“新建 / 清仓”幅度（左侧动作词已说明），只有增持 / 减持写百分比。

- [ ] **Step 4: 运行，确认通过**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/components/investor/InvestorBlocks.check.tsx`
Expected: `InvestorBlocks.check OK`

- [ ] **Step 5: Commit**

```bash
git add web/src/components/investor/QuarterMovesBlock.tsx web/src/components/investor/InvestorBlocks.check.tsx
git commit -m "feat(investor): 本季动作块(按金额的结论 + 前 5 笔)"
```

---

### Task 5：持仓表组件（10 行 + 展开 + SEC 原文）

**Files:**
- Create: `web/src/components/investor/InvestorHoldingsTable.tsx`
- Modify: `web/src/lib/managers/rowSignals.ts:12-25`（中文词）
- Test: `web/src/components/investor/InvestorBlocks.check.tsx`

**Interfaces:**
- Consumes: Task 2 的 `quarterCell`、`holdingsSplit`；`holdingKey`；`DataTable`、`Column`；`EntityName`；`WeightBar`；`ValuationBadge`；`valuationAsOfText`、`latestIsoDate`；`stockPath`；`RowSignal`；`SnapshotVerdict`
- Produces:

```ts
InvestorHoldingsTable(props: {
  holdings: Holding[]; lang: Lang; cusipToTicker: Map<string, string>;
  verdicts: Map<string, SnapshotVerdict>; holderCounts: Map<string, number>;
  rowSignals: Map<string, RowSignal>; changeByKey: Map<string, HoldingChange>;
  hasPrior: boolean; lonelyTickers: Set<string>; filingUrl: string;
})
```

根元素 `<section id="holdings" className="scroll-mt-32">`。

- [ ] **Step 1: 写失败的渲染检查**

追加到 `InvestorBlocks.check.tsx`（`console.log` 之前；import 放顶部）：

```tsx
import { InvestorHoldingsTable } from "./InvestorHoldingsTable";

{
  const holdings = Array.from({ length: 105 }, (_, i) => ({ cusip: `C${i}`, issuer: `CO ${i}`, value: 1000 - i, shares: 10, weight: (1000 - i) / 1e5 }));
  holdings.push({ cusip: "C0", issuer: "CO 0", value: 5, shares: 1, weight: 0, putCall: "Call" } as any);
  const changeByKey = new Map([
    ["C0|", { cusip: "C0", issuer: "CO 0", kind: "decreased" as const, prevShares: 100, shares: 10, value: 1000, deltaPct: -0.9, splitFactor: 10 }],
    ["C1|", { cusip: "C1", issuer: "CO 1", kind: "new" as const, prevShares: 0, shares: 10, value: 999, deltaPct: null }],
  ]);
  const rowSignals = new Map([
    ["C2", { conviction: { label: "连续增持·4季", signal: "accumulating" as const } }],
    ["C3", { conviction: { label: "重磅新建", signal: "fresh_conviction" as const } }],
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
  assert.ok(t.includes("● 新建") && t.includes("未变"), "新建 / 未变");
  assert.ok(t.includes("连续增持·4季") && !t.includes("重磅新建"), "长期信号保留,重磅新建/增持不再重复");
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/components/investor/InvestorBlocks.check.tsx`
Expected: FAIL，找不到模块 `./InvestorHoldingsTable`

- [ ] **Step 3: 实现**

`rowSignals.ts` 的 `CONV_LABEL.zh`：`accumulating` 改为 `` `连续增持·${s}季` ``，`never_trimmed` 改为 `` `从不减持·${q}季` ``（与“增持 / 减持”统一）。英文不变。

`web/src/components/investor/InvestorHoldingsTable.tsx`：从 `page.tsx` 现有 `HOLD_COPY` 与 `HoldingsTable` 搬过来，按下面改：

```tsx
import React from "react";
import type { Holding, HoldingChange } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { holdingKey } from "@/lib/managers/assemble";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityName } from "@/components/common/EntityName";
import { WeightBar } from "@/components/investor/WeightBar";
import { ValuationBadge } from "@/components/valuation/ValuationBadge";
import { SectionHeading } from "@/components/common/SectionHeading";
import type { RowSignal } from "@/lib/managers/rowSignals";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import { latestIsoDate, valuationAsOfText } from "@/lib/valuation/asOf";
import { holdingsSplit, quarterCell } from "@/lib/managers/investorConclusion";
import { stockPath } from "@/lib/urls";
import { formatUSD } from "@/lib/format";

const HOLD_COPY = {
  zh: {
    title: "持仓明细",
    cols: { issuer: "标的", quarter: "本季", value: "市值", weight: "占比", valuation: "估值", consensus: "持有人数" },
    lonely: "独门",
    more: (n: number) => `展开其余 ${n} 只`,
    overflow: (n: number) => `其余 ${n} 只见 SEC 原文`,
  },
  en: {
    title: "Holdings",
    cols: { issuer: "Security", quarter: "This qtr", value: "Value", weight: "Weight", valuation: "Valuation", consensus: "Holders" },
    lonely: "Rarely held",
    more: (n: number) => `Show ${n} more`,
    overflow: (n: number) => `${n} more in the SEC filing`,
  },
} as const;

export function InvestorHoldingsTable({ holdings, lang, cusipToTicker, verdicts, holderCounts, rowSignals, changeByKey, hasPrior, lonelyTickers, filingUrl }: {
  holdings: Holding[];
  lang: Lang;
  cusipToTicker: Map<string, string>;
  verdicts: Map<string, SnapshotVerdict>;
  holderCounts: Map<string, number>;
  rowSignals: Map<string, RowSignal>;
  changeByKey: Map<string, HoldingChange>;
  hasPrior: boolean;
  lonelyTickers: Set<string>;
  filingUrl: string;
}): React.ReactElement {
  const t = HOLD_COPY[lang];
  // 估值列读的是估值快照:标出它用的是哪天的收盘价(快照 + ISR 可能落后页面其余数据几天)。
  const valuationAsOf = valuationAsOfText(lang, latestIsoDate([...verdicts.values()].map((v) => v.priceDate)));
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const { shown, folded, overflow } = holdingsSplit(sorted);

  const columns: Column<Holding>[] = [
    {
      key: "issuer",
      header: t.cols.issuer,
      role: "primary",
      cell: (h) => {
        const tk = cusipToTicker.get(h.cusip);
        // 名字下方小标签:长期信号(连续增持/长期核心/从不减持)+ 独门。"重磅新建/增持"与本季列重复,不再写。
        const sig = rowSignals.get(h.cusip)?.conviction;
        const tags = [
          ...(sig && sig.signal !== "fresh_conviction" && !h.putCall ? [sig.label] : []),
          ...(tk && !h.putCall && lonelyTickers.has(tk.toUpperCase()) ? [t.lonely] : []),
        ];
        return (
          <span className="inline-flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1.5">
              <EntityName issuer={h.issuer} ticker={tk ?? h.cusip} lang={lang} />
              {h.putCall && (
                <span
                  className={`rounded-sm px-1 py-0.5 font-data text-xs border border-current/40 ${h.putCall === "Put" ? "text-[var(--tt-warn)]" : "text-[var(--tt-muted)]"}`}
                  title={lang === "zh" ? "期权:市值为标的名义价值,非权利金" : "Option: value is notional, not premium"}
                >
                  {h.putCall === "Put" ? "PUT" : "CALL"}
                </span>
              )}
            </span>
            {tags.length > 0 && <span className="font-data text-xs text-[var(--tt-faint)]">{tags.join(" · ")}</span>}
          </span>
        );
      },
    },
    {
      key: "quarter",
      header: t.cols.quarter,
      align: "right",
      width: "w-24",
      cell: (h) => {
        const q = quarterCell(changeByKey.get(holdingKey(h)), hasPrior, lang);
        return <span className="font-data text-xs tabular-nums text-[var(--tt-muted)]" title={q.title}>{q.text}</span>;
      },
    },
    {
      key: "value",
      header: t.cols.value,
      align: "right",
      width: "w-32",
      cell: (h) => formatUSD(h.value),
    },
    {
      key: "weight",
      header: t.cols.weight,
      align: "right",
      width: "w-40",
      cell: (h) => h.putCall ? <span className="text-[var(--tt-faint)]">—</span> : <WeightBar weight={h.weight ?? null} />,
    },
    {
      key: "valuation",
      header: t.cols.valuation,
      align: "right",
      width: "w-32",
      cell: (h) => {
        const tk = cusipToTicker.get(h.cusip);
        // 无代码(非美股/未映射)→ 估值列不适用,写 —,不写“未评估”
        if (!tk) return <span className="text-[var(--tt-faint)]">—</span>;
        return <ValuationBadge verdict={verdicts.get(tk.toUpperCase())} lang={lang} density="table" />;
      },
    },
    {
      key: "consensus",
      header: t.cols.consensus,
      align: "right",
      width: "w-24",
      cell: (h) => {
        const tk = cusipToTicker.get(h.cusip);
        const c = tk ? holderCounts.get(tk.toUpperCase()) : undefined;
        return c != null
          ? <span className="font-data tabular-nums text-[var(--tt-muted)]">{c}</span>
          : <span className="text-[var(--tt-faint)]">—</span>;
      },
    },
  ];

  const table = (rows: Holding[]) => (
    <DataTable
      columns={columns}
      rows={rows}
      getKey={(h) => holdingKey(h)}
      rowHref={(h) => {
        const tk = cusipToTicker.get(h.cusip);
        if (tk) return stockPath(lang, tk);
        return h.cusip ? stockPath(lang, h.cusip) : "";
      }}
      breakpoint="lg"
    />
  );

  return (
    <section id="holdings" aria-label={t.title} className="scroll-mt-32">
      <SectionHeading
        eyebrow={lang === "zh" ? "SEC 13F · 最新持仓" : "SEC 13F · latest filing"}
        title={t.title}
        trailing={valuationAsOf ? <span className="font-data text-xs text-[var(--tt-faint)]">{valuationAsOf}</span> : undefined}
      />
      <div className="mt-3">{table(shown)}</div>
      {folded.length > 0 && (
        <details className="mt-2">
          <summary className="flex min-h-[44px] cursor-pointer items-center text-sm text-[var(--tt-muted)] hover:text-[var(--tt-text)]">
            {t.more(folded.length)}
          </summary>
          <div className="mt-2">{table(folded)}</div>
        </details>
      )}
      {overflow > 0 && (
        <p className="mt-2 text-xs text-[var(--tt-muted)]">
          <a href={filingUrl} className="text-[var(--tt-text)]" rel="noopener noreferrer" target="_blank">{t.overflow(overflow)}</a>
        </p>
      )}
    </section>
  );
}
```

PUT/CALL 小标与 `value`、`weight`、`valuation`、`consensus` 四列与 `page.tsx` 现有 `HoldingsTable` 逐字相同，只调整了列顺序（证券 · 本季 · 市值 · 占比 · 估值 · 持有人数），并删掉 `shares`、`signal` 两列。

- [ ] **Step 4: 运行，确认通过**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/components/investor/InvestorBlocks.check.tsx && npx tsx src/lib/managers/rowSignals.check.ts`
Expected: 两个 OK

- [ ] **Step 5: Commit**

```bash
git add web/src/components/investor/InvestorHoldingsTable.tsx web/src/components/investor/InvestorBlocks.check.tsx web/src/lib/managers/rowSignals.ts
git commit -m "feat(investor): 持仓表 10 行 + 展开 + 本季列,删股数与信号列"
```

---

### Task 6：投资人页装配

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`
- Delete: `web/src/app/[lang]/investors/[slug]/movesCount.ts`、`movesCount.check.ts`

**Interfaces:**
- Consumes: Task 2 的 `summaryForDetail`、`investorVerdictChip`、`valueChangeSplit`、`valueSplitNote`、`investorAnchors`、`top5Share`；Task 3 的 `PageAnchorNav`；Task 4 的 `QuarterMovesBlock`；Task 5 的 `InvestorHoldingsTable`；`BAND_COPY`（锚点 aria 文案，复用个股页的“本页目录 / On this page”）

- [ ] **Step 1: 删旧代码**

在 `page.tsx` 中删除：
- `MAX_HOLDINGS`、`HOLD_COPY`、`function HoldingsTable`（已搬到 Task 5 组件）、`function QuarterMovesExited`
- `import { countMoves } from "./movesCount";`，以及 `const moves = countMoves(longChanges);`
- 四格大数字 `<div className="grid grid-cols-2 gap-4 sm:grid-cols-4 ...">` 整段
- `{prior && longChanges.length > 0 && moves.exited > 0 && (<QuarterMovesExited .../>)}`
- 隐含预期那段 IIFE（`demanding` / `modest`）
- “独门重仓”整个 `<section aria-label=... "Lonely conviction">`
- `buying` / `selling` 两个计数，以及按只数构造 `verdict` 的 `if` 链
- `valueNode`（被 note 取代）
- keyFacts 里“第一大持仓”“低于内在价值”两项

然后删掉随之不再使用的 import：`Display`、`LONELY_MAX_HOLDERS`、`MIN_CONVICTION_WEIGHT`、`LONELY_LIMIT`、`splitNames`、`DataTable`、`Column`、`EntityName`、`WeightBar`、`ValuationBadge`、`holdingKey`、`Holding`，以及其他 eslint 报未使用的。`topHolding` 仍供分享文案使用，保留。

同时删除文件 `movesCount.ts`、`movesCount.check.ts`（用 `git rm`）。

- [ ] **Step 2: 加新的计算**

在 `const longChanges = ...` 之后、Verdict 位置加入：

```ts
  // 本季汇总(按金额;与列表页 manager_quarter_summary 同一个 summarizeQuarter,零新增 IO)。
  const summary = summaryForDetail(d);
  const verdict = investorVerdictChip(summary, lang);
  const changeByKey = new Map(changes.map((c) => [holdingKey(c), c]));
```

（`holdingKey` 若已在 Step 1 删了 import，在此保留其 import。）

keyFacts 改为：

```ts
  const split = summary && !isScopeChange(valDeltaPct) ? valueChangeSplit(summary) : null;
  const top5 = top5Share(longHoldings.map((h) => h.value));
  const keyFacts = [
    {
      label: lang === "zh" ? "组合市值" : "Portfolio value",
      value: formatUSD(longTotalValue),
      // 涨跌拆成交易与股价两部分,免得把股价上涨读成加仓;申报范围突变时不拆(另有 scopeNote 说明)。
      note: split ? valueSplitNote(split, lang)
        : valDeltaPct != null && valDeltaPct !== 0 ? (lang === "zh" ? `较上季 ${sign(valDeltaPct)}${Math.abs(valDeltaPct * 100).toFixed(0)}%` : `${sign(valDeltaPct)}${Math.abs(valDeltaPct * 100).toFixed(0)}% vs last quarter`)
        : undefined,
    },
    {
      label: lang === "zh" ? "持仓数" : "Holdings",
      value: String(longHoldings.length),
      node: countNode,
      note: top5 != null ? (lang === "zh" ? `前 5 大占 ${Math.round(top5 * 100)}%` : `Top 5: ${Math.round(top5 * 100)}%`) : undefined,
    },
  ];
```

锚点与 SEC 原文链接：

```ts
  const hasPosture = posture.cheap.length > 0 || posture.pending.length > 0;
  const anchors = investorAnchors({ moves: !!summary, holdings: !zeroReport, valuation: hasPosture }, lang);
  const lonelyTickers = new Set(lonely.map((h) => h.ticker.toUpperCase()));
```

`zeroFilingUrl` 改名为 `filingUrl`（零持仓说明里的引用同步改名），它同时供持仓表超出 100 行时链接。

- [ ] **Step 3: 重排正文**

`<EntityPage ...>` 的 children 改为（`verdict={verdict}`、`keyFacts={keyFacts}` 两个 prop 名不变）：

```tsx
        <>
          <PageAnchorNav ariaLabel={BAND_COPY[lang].anchorsAria} anchors={anchors} />
          {summary && (
            <QuarterMovesBlock
              lang={lang}
              summary={summary}
              quarter={quarterLabel(latest.period)}
              nameOf={stockName}
              hrefOf={(cusip) => stockPath(lang, cusipToTicker.get(cusip) ?? cusip)}
            />
          )}
          {!zeroReport && (
            <InvestorHoldingsTable
              holdings={latest.holdings}
              lang={lang}
              cusipToTicker={cusipToTicker}
              verdicts={verdicts}
              holderCounts={holderCounts}
              rowSignals={rowSignals}
              changeByKey={changeByKey}
              hasPrior={!!prior}
              lonelyTickers={lonelyTickers}
              filingUrl={filingUrl}
            />
          )}
          {hasPosture && (
            <section id="valuation" aria-label={lang === "zh" ? "估值姿态" : "Valuation posture"} className="scroll-mt-32">
              {/* 估值姿态小节内部原样保留 */}
            </section>
          )}
          <div id="about" className="scroll-mt-32">
            {/* 原 <FoldedSection title="关于这位投资者"> 整段原样移入 */}
          </div>
          {/* 原 <DiscoveryHandoff .../> 原样保留在最后 */}
        </>
```

- 估值姿态 `<section>` 原有的 `aria-label` 与内部内容都不改，只加 `id="valuation"` 和 `className="scroll-mt-32"`，并把条件换成 `hasPosture`。
- `FoldedSection` 整段放进 `<div id="about">`。
- import 增加：

```ts
import { summaryForDetail, investorVerdictChip, valueChangeSplit, valueSplitNote, investorAnchors, top5Share } from "@/lib/managers/investorConclusion";
import { QuarterMovesBlock } from "@/components/investor/QuarterMovesBlock";
import { InvestorHoldingsTable } from "@/components/investor/InvestorHoldingsTable";
import { PageAnchorNav } from "@/components/common/PageAnchorNav";
import { BAND_COPY } from "@/lib/stocks/stockConclusion";
```

- [ ] **Step 4: 检查与构建**

Run: `cd web && npx eslint "src/app/[[]lang]/investors/[[]slug]/page.tsx" src/components/investor src/lib/managers/investorConclusion.ts && npx tsc --noEmit -p .`
Expected: 无输出

Run: `cd web && npx next build 2>&1 | tail -15`
Expected: 构建成功。本地无数据库凭据导致无法预渲染时，改在 Vercel 预览上验证，如实记录。

- [ ] **Step 5: Commit**

```bash
git add -A "web/src/app/[lang]/investors/[slug]/"
git commit -m "feat(investor): 投资人页先结论后证据(本季动作首屏、持仓上移、锚点)"
```

---

### Task 7：列表页判定改为按金额

**Files:**
- Modify: `web/src/lib/managers/supabase.ts`（`SummaryRow`、`mapSummaryRows`、`getManagerQoQ` 的 select）
- Modify: `web/src/lib/managers/supabaseMap.check.ts`
- Modify: `web/src/app/[lang]/investors/InvestorListClient.tsx`

**Interfaces:**
- Consumes: PR A 的 `manager_quarter_summary.verdict` 列；Task 1 的 `moveLabel`
- Produces: `ManagerQoQ.verdict` 的含义变为按金额（取值仍是 `buying | selling | mixed`）

- [ ] **Step 1: 改检查（先失败）**

`supabaseMap.check.ts` 中两行输入各加 `verdict` 字段：第一行 `verdict: "selling"`（与 `count_verdict: "buying"` 相反），第二行 `verdict: "mixed"`。第一条期望改为 `verdict: "selling"`。

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/managers/supabaseMap.check.ts`
Expected: FAIL（`verdict` 仍取自 `count_verdict`）

- [ ] **Step 2: 实现**

`supabase.ts`：
- `SummaryRow` 增加 `verdict: string`。
- `mapSummaryRows` 里改为 `verdict: (r.verdict as ManagerQoQ["verdict"]) ?? null`。
- 注释改为：“verdict 按金额判定（净额 < 上季正股市值 2% → mixed），与详情页徽章同源。”
- `getManagerQoQ` 的 select 加上 `verdict`。

`InvestorListClient.tsx`：
- `COPY.zh.verdict` → `{ buying: "▲ 净买入", selling: "▼ 净卖出", mixed: "基本持平" }`
- `COPY.en.verdict` → `{ buying: "▲ Net buyer", selling: "▼ Net seller", mixed: "Roughly unchanged" }`
- `COPY.zh.kind` → `{ new: "● 新建", exited: "○ 清仓", increased: "▲ 增持", decreased: "▼ 减持" }`
  - 写法：`kind: { new: moveLabel("new", "zh"), ... }`，从 `@/lib/entity/moveWords` 导入。
- `COPY.en.kind` 同理用 `moveLabel(..., "en")`。
- 筛选文字：
  - zh：`filterBuying: "净买入"`、`filterSelling: "净卖出"`、`filterMixed: "基本持平"`
  - en：`filterBuying: "Net buyers"`、`filterSelling: "Net sellers"`、`filterMixed: "Roughly unchanged"`
- `VERDICT_TONE` 三项都改为 `"neutral"`。
- `KIND_CLASS` 四项都改为 `"text-[var(--tt-muted)]"`。
- 文件顶部注释（若写了“按只数”之类的口径）同步改为按金额。

- [ ] **Step 3: 运行**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/managers/supabaseMap.check.ts && npx eslint "src/app/[[]lang]/investors/InvestorListClient.tsx" src/lib/managers/supabase.ts && npx tsc --noEmit -p .`
Expected: OK；无输出

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/managers/supabase.ts web/src/lib/managers/supabaseMap.check.ts "web/src/app/[lang]/investors/InvestorListClient.tsx"
git commit -m "feat(investors): 列表页判定改为按金额,动作用字形、中性色"
```

---

### Task 8：全量检查、预览核对、开 PR

- [ ] **Step 1: 全量检查**

Run（`web/` 下）：

```bash
for f in $(git ls-files '*.check.ts' '*.check.tsx' | grep -v '^scripts/codemods/'); do npx tsx --tsconfig scripts/tsconfig.json "$f" >/dev/null 2>&1 || echo "FAIL $f"; done; echo done
npm run check:tokens && npm run check:type && npm run check:revalidate-paths && npm run check:color
```

Expected: 只打印 `done`，其余全部通过。基线就失败的检查要如实写进 PR 描述，不要掩盖。

- [ ] **Step 2: 推送、开 PR（目标 `db-foundation`），等 Vercel 预览**

PR 描述写清：
- 对应 spec §四
- 依赖 PR A
- 删了什么、移了什么
- 26 位经理徽章方向会变（引用 spec §一）
- 末尾加 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

开 PR 后调用 `ccd_pr` 的 `get_status` / `bind_pr`。

- [ ] **Step 3: 预览核对**

在预览上逐页核对。每页三个宽度（375 / 768 / 1440px）× 中英文；深浅色至少在 1440px 各看一次。英文页路径是根路径：`/investors/x`，不是 `/en/investors/x`。

| 页面 | 看什么 |
|---|---|
| `/investors/dodge-and-cox` | BKNG 在前 5 笔中，是“▲ 增持 +2%”左右并带“已按 1 拆 25 调整”；徽章按金额 |
| `/investors/cas-investment-partners` | CVNA 是减持，不是增持 |
| `/investors/gmo` | KLAC 是减持约 16% |
| `/investors/tweedy-browne` | 10 行 + “展开其余 81 只”，展开后 91 只全可见 |
| `/investors/bridgewater-associates` | 展开 90 行 + “其余 N 只见 SEC 原文”，链接可点 |
| `/investors/berkshire-hathaway`（以实际 slug 为准） | 结论句、前 5 笔、计数、清仓名单都通顺 |
| 一位零持仓经理（如 `olstein-capital`） | 无本季动作块、无徽章、锚点里没有“本季动作”，零持仓说明照旧 |
| 一位无上季的经理 | 同上；持仓表“本季”列写 — |
| `/investors` 列表 | 徽章与筛选文字为净买入 / 净卖出 / 基本持平，中性色；`?vf=buying` 等旧链接仍可用 |

每页还要确认：
- 375px 无横向溢出：`document.documentElement.scrollWidth <= innerWidth`。
- ≥768px 锚点吸顶，点击后标题不被顶栏遮挡（标题 top ≥ 导航底部）。
- 首屏能看到结论句。
- 全页没有 `--tt-positive` / `--tt-negative` 用在 13F 动作上。

- [ ] **Step 4: 【停，问用户】合并**

把核对结果（含截图）交给用户，得到明确同意后再合并（`gh pr merge --merge --match-head-commit <完整 SHA>`），再核对正式站同一批页面。
