# 引导线 块③：stock 共识信号块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在个股页（`/[lang]/stocks/[ticker]`）加一个与估值结论上下并置的「持仓 · 13F 共识」信号面板，把平铺持有人表抬成一个判断块（N 位超投持有 · 合计市值 · 本季净方向 · 头号重仓人），形成"值不值 × 谁在买"两个判断并列。

**Architecture:** 一个纯函数 helper（派生自足可引用的共识句，可单测）+ 一个零 hydration 的 RSC 展示组件 `OwnershipConsensusPanel`（复用 `EarningsPowerFloorCard` 的 `Panel` 款式 + 复用既有 `QuarterMovesPill` 渲染本季动向 chips）+ 个股页装配（面板置于估值 section 之下、持有人表之上，并收编原页眉的 `QuarterMovesPill`，去重）。零外部新数据、零新查询——全部用页面已算出的 `moves`/`n`/`totalValue`/`topHolder`/`latestPeriod`。

**Tech Stack:** Next.js 16 App Router（RSC，无 "use client"）、TypeScript、Tailwind（仅 `--tt-*` 令牌）、tsx（`.check.ts` 跑纯函数）。

## Global Constraints

- 令牌只用 `--tt-*`，**禁 shadcn 别名**（`text-foreground`/`bg-card`/`border-border` 等）；明暗双模式必须等价。
- 字体：标题 Fraunces（`font-display`）；数字 + 眉标/标签 Geist Mono（`font-mono` + `tabular-nums`）。
- 段节奏：绿 mono 眉标（`text-[10px] uppercase tracking-[0.12–0.14em] text-[var(--tt-accent)]`）→ Fraunces 标题 → 可选 muted intro → 内容。
- 绿色克制：accent 只用于眉标/链接/chip；**不要整列/整块数字全绿、不要实心绿按钮**。
- 卡片/面板：`rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 sm:p-6`；圆角 `rounded-md`，禁 `rounded-full`/`rounded-lg`/渐变/glow/shadcn `Card`。
- 文案合规（[[valuation-philosophy-constraint]]）：纯陈述持仓/滞后变动，**禁 BUY/SELL/HOLD/目标价/评级/"最佳"**；13F 为自报、可滞后 45 天，显式标 as-of。
- 文案禁中英混排（[[no-mixed-language-copy]]）：每个 locale 纯单语。
- 全 RSC 零 hydration，内容进服务端 HTML（爬虫可见）。
- 验证（[[no-tests-solo-dev]]）：纯函数 = `npx tsx <file>.check.ts`；全局门 = `cd web && npx tsc --noEmit`；外加 curl view-source + 人工 QA（明暗双模 + 390/768/1280 三宽）。**本机 google fonts 被墙，`next build` 必失败，不要用它当门**（见 [[local-build-google-fonts-blocked]]）。

---

## File Structure

- **Create** `web/src/lib/stocks/consensusSummary.ts` — 纯函数 `buildConsensusSentence(...)`：把 `{ issuer, ticker, n, moves, period }` 派生成一句自足、带实体计数 + 日期的英文/中文事实句（GEO 可引用）。无 I/O、可单测。
- **Create** `web/src/lib/stocks/consensusSummary.check.ts` — tsx 断言（多 moves 形态 + 全零退化 + 合规无禁词）。
- **Create** `web/src/components/entity/OwnershipConsensusPanel.tsx` — RSC 展示组件，复用 `Panel` 款式 + `QuarterMovesPill`，渲染共识强度行 + 本季动向 + 头号重仓人链 + as-of + 合规脚注。
- **Modify** `web/src/app/[lang]/stocks/[ticker]/page.tsx` — 在估值 `<section>` 之后、`<HoldersTable>` 之前装入面板；从 `<EntityPage>` 移除 `notice={<QuarterMovesPill .../>}`（收编进面板，去重）；清理不再使用的 `QuarterMovesPill` import。

数据来源（均为页面 `StockTickerPage` 已算出的局部量，零新查询）：`n`（= `holders.length`）、`totalValue`、`moves: { opened, added, trimmed, exited }`、`topHolder`（`{ person, slug, value, ... }`）、`latestPeriod`、`issuer`、`ticker`、`lang`。

---

## Task 1: 纯函数 `buildConsensusSentence` + .check.ts

**Files:**
- Create: `web/src/lib/stocks/consensusSummary.ts`
- Test: `web/src/lib/stocks/consensusSummary.check.ts`

**Interfaces:**
- Consumes: `QuarterMoves`（`{ opened: number; added: number; trimmed: number; exited: number }`，从 `@/components/entity/QuarterMovesPill` 导出）；`Lang`（`@/lib/nav`）。
- Produces: `buildConsensusSentence(input: { issuer: string; ticker: string; n: number; moves: QuarterMoves; period: string }, lang: Lang): string` —— 一句自足事实句。Task 2 调用它。

- [ ] **Step 1: 写失败的 check（先断言行为）**

Create `web/src/lib/stocks/consensusSummary.check.ts`:

```ts
import { strict as assert } from "node:assert";
import { buildConsensusSentence } from "./consensusSummary";

const base = { issuer: "Apple Inc", ticker: "AAPL", n: 12, period: "2026Q1" };

// 1) 有动向: 英文句含计数、各动作、as-of, 无禁词
const en = buildConsensusSentence(
  { ...base, moves: { opened: 3, added: 2, trimmed: 1, exited: 0 } },
  "en",
);
assert.ok(en.includes("12 superinvestors"), `en count: ${en}`);
assert.ok(en.includes("Apple Inc") && en.includes("AAPL"), `en entity: ${en}`);
assert.ok(/3 opened/.test(en) && /2 added/.test(en) && /1 trimmed/.test(en), `en moves: ${en}`);
assert.ok(en.includes("2026Q1"), `en as-of: ${en}`);

// 2) 全零动向 → 退化句(无变动), 仍含计数 + as-of
const flat = buildConsensusSentence(
  { ...base, moves: { opened: 0, added: 0, trimmed: 0, exited: 0 } },
  "en",
);
assert.ok(/no .*change/i.test(flat), `flat phrasing: ${flat}`);
assert.ok(flat.includes("12 superinvestors") && flat.includes("2026Q1"), `flat keeps facts: ${flat}`);

// 3) 中文句: 纯中文(无英文动作词), 含计数 + as-of
const zh = buildConsensusSentence(
  { ...base, moves: { opened: 1, added: 0, trimmed: 0, exited: 2 } },
  "zh",
);
assert.ok(/12 位超级投资者/.test(zh), `zh count: ${zh}`);
assert.ok(/1 家新进/.test(zh) && /2 家清仓/.test(zh), `zh moves: ${zh}`);
assert.ok(!/opened|added|trimmed|exited|hold/i.test(zh), `zh no english: ${zh}`);

// 4) 合规: 任一句都不含买卖/目标价/评级词元
for (const s of [en, flat, zh]) {
  assert.ok(!/\b(buy|sell|hold|target|rating|recommend)\b/i.test(s), `compliance: ${s}`);
}

// 5) 单数: n=1 用单数 superinvestor
const one = buildConsensusSentence(
  { ...base, n: 1, moves: { opened: 0, added: 1, trimmed: 0, exited: 0 } },
  "en",
);
assert.ok(/\b1 superinvestor\b/.test(one) && !/superinvestors/.test(one), `singular: ${one}`);

console.log("consensusSummary.check.ts: all assertions passed");
```

- [ ] **Step 2: 跑 check 确认失败**

Run: `cd web && npx tsx src/lib/stocks/consensusSummary.check.ts`
Expected: 失败（`Cannot find module './consensusSummary'` 或导出不存在）。

- [ ] **Step 3: 写最小实现**

Create `web/src/lib/stocks/consensusSummary.ts`:

```ts
import type { Lang } from "@/lib/nav";
import type { QuarterMoves } from "@/components/entity/QuarterMovesPill";

// 纯函数:把已聚合的本季动向派生成一句自足、带实体计数 + as-of 的事实句(GEO 可引用)。
// 中性陈述,描述机构动作,非买卖建议。全零动向 → 退化为"本季无披露变动"。

export function buildConsensusSentence(
  input: { issuer: string; ticker: string; n: number; moves: QuarterMoves; period: string },
  lang: Lang,
): string {
  const { issuer, ticker, n, moves, period } = input;

  if (lang === "zh") {
    const parts: string[] = [];
    if (moves.opened > 0) parts.push(`${moves.opened} 家新进`);
    if (moves.added > 0) parts.push(`${moves.added} 家加仓`);
    if (moves.trimmed > 0) parts.push(`${moves.trimmed} 家减仓`);
    if (moves.exited > 0) parts.push(`${moves.exited} 家清仓`);
    const head = `${n} 位超级投资者持有 ${issuer}（${ticker}）`;
    const body = parts.length > 0 ? `本季 ${parts.join("、")}` : "本季无披露变动";
    return `${head}；${body}（截至 ${period}）。`;
  }

  const parts: string[] = [];
  if (moves.opened > 0) parts.push(`${moves.opened} opened`);
  if (moves.added > 0) parts.push(`${moves.added} added`);
  if (moves.trimmed > 0) parts.push(`${moves.trimmed} trimmed`);
  if (moves.exited > 0) parts.push(`${moves.exited} exited`);
  const noun = n === 1 ? "superinvestor" : "superinvestors";
  const head = `Held by ${n} ${noun} of ${issuer} (${ticker})`;
  const body = parts.length > 0 ? `this quarter ${parts.join(", ")}` : "no disclosed position changes this quarter";
  return `${head}; ${body} (as of ${period}).`;
}
```

- [ ] **Step 4: 跑 check 确认通过**

Run: `cd web && npx tsx src/lib/stocks/consensusSummary.check.ts`
Expected: `consensusSummary.check.ts: all assertions passed`

- [ ] **Step 5: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出（exit 0）。

- [ ] **Step 6: 提交**

```bash
cd web && git add src/lib/stocks/consensusSummary.ts src/lib/stocks/consensusSummary.check.ts
git commit -m "feat(stock): 共识句纯函数 buildConsensusSentence + check"
```

---

## Task 2: `OwnershipConsensusPanel` 展示组件

**Files:**
- Create: `web/src/components/entity/OwnershipConsensusPanel.tsx`

**Interfaces:**
- Consumes: `buildConsensusSentence`（Task 1）；`QuarterMovesPill` + `QuarterMoves`（`@/components/entity/QuarterMovesPill`）；`formatUSD`（`@/lib/format`）；`investorPath`（`@/lib/urls`）；`Lang`（`@/lib/nav`）。
- Produces: `OwnershipConsensusPanel(props: { issuer: string; ticker: string; n: number; totalValue: number; moves: QuarterMoves; topHolder: { person: string; slug: string }; period: string; lang: Lang }): React.ReactElement` —— 默认导出。Task 3 装配它。

- [ ] **Step 1: 写组件**

Create `web/src/components/entity/OwnershipConsensusPanel.tsx`:

```tsx
import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { formatUSD } from "@/lib/format";
import { investorPath } from "@/lib/urls";
import { QuarterMovesPill, type QuarterMoves } from "@/components/entity/QuarterMovesPill";
import { buildConsensusSentence } from "@/lib/stocks/consensusSummary";

// 持仓 · 13F 共识信号面板(RSC, 零 hydration)。与估值面板同款式(rounded-md Panel),
// 上下并置 = "值不值 × 谁在买" 两个判断并列。中性陈述,非买卖建议。

const COPY = {
  zh: {
    eyebrow: "持仓 · 13F 共识",
    title: "谁在买",
    intro: "跨基金聚合的机构持仓——共识强度与本季动向,描述动作、不下判决。",
    strength: (n: number, total: string) => `${n} 位超级投资者持有 · 合计 ${total}`,
    largest: "头号重仓",
    flat: "本季无披露变动。",
    disclaimer: "13F 持仓为机构自行申报,可能滞后最多 45 天;仅供信息参考,非买卖建议。",
  },
  en: {
    eyebrow: "Ownership · 13F consensus",
    title: "Who's buying it",
    intro: "Institutional ownership aggregated across funds — consensus strength and this quarter's moves. Describes actions, not advice.",
    strength: (n: number, total: string) => `${n} superinvestor${n === 1 ? "" : "s"} hold it · ${total} combined`,
    largest: "Largest holder",
    flat: "No disclosed position changes this quarter.",
    disclaimer: "13F positions are self-reported and can lag up to 45 days. Informational only — not investment advice.",
  },
} as const;

export default function OwnershipConsensusPanel({
  issuer,
  ticker,
  n,
  totalValue,
  moves,
  topHolder,
  period,
  lang,
}: {
  issuer: string;
  ticker: string;
  n: number;
  totalValue: number;
  moves: QuarterMoves;
  topHolder: { person: string; slug: string };
  period: string;
  lang: Lang;
}): React.ReactElement {
  const t = COPY[lang];
  const hasMoves = moves.opened + moves.added + moves.trimmed + moves.exited > 0;
  const sentence = buildConsensusSentence({ issuer, ticker, n, moves, period }, lang);

  return (
    <section className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 sm:p-6">
      <header className="border-b border-[var(--tt-border-strong)] pb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{t.eyebrow}</p>
        <h2 className="mt-1.5 font-display text-lg font-medium leading-tight tracking-tight text-[var(--tt-text)]">
          {t.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">{t.intro}</p>
      </header>

      <div className="mt-4 space-y-3">
        {/* 共识强度: 数字克制(text, 非整块绿) */}
        <p className="text-sm text-[var(--tt-text)]">
          <span className="font-mono tabular-nums">{n}</span>{" "}
          <span className="text-[var(--tt-muted)]">{t.strength(n, formatUSD(totalValue)).replace(/^\d+\s*/, "")}</span>
        </p>

        {/* 本季动向: 复用 QuarterMovesPill(全零自返 null) + 退化句 */}
        {hasMoves ? <QuarterMovesPill moves={moves} lang={lang} /> : (
          <p className="text-sm text-[var(--tt-muted)]">{t.flat}</p>
        )}

        {/* 头号重仓人 → investor 页(接力棒回拉) */}
        <p className="text-sm text-[var(--tt-text)]">
          <span className="text-[var(--tt-faint)]">{t.largest} </span>
          <Link
            href={investorPath(lang, topHolder.slug)}
            className="text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]"
          >
            {topHolder.person}
          </Link>
        </p>

        {/* 自足 GEO 事实句(SSR, 可引用) */}
        <p className="sr-only">{sentence}</p>

        <p className="text-[10px] text-[var(--tt-faint)]">{t.disclaimer}</p>
      </div>
    </section>
  );
}
```

> 说明：共识强度行避免整块绿（遵绿色克制），数字用 `font-mono tabular-nums` 但不上 accent 色。`buildConsensusSentence` 的完整句以 `sr-only` 进 DOM 供爬虫/AI 引用，可视区用更紧凑的强度行 + chips 表达同一事实（不重复噪声）。

- [ ] **Step 2: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出（exit 0）。

- [ ] **Step 3: 提交**

```bash
cd web && git add src/components/entity/OwnershipConsensusPanel.tsx
git commit -m "feat(stock): OwnershipConsensusPanel 共识信号面板(复用 Panel 款式+QuarterMovesPill)"
```

---

## Task 3: 装配进个股页 + 收编页眉 Pill

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`

**Interfaces:**
- Consumes: `OwnershipConsensusPanel`（Task 2，默认导出）。
- 复用页面已算出的局部量：`issuer`, `ticker`, `n`, `totalValue`, `moves`, `topHolder`, `latestPeriod`, `lang`。

- [ ] **Step 1: 加 import**

在 page.tsx 顶部 import 区加：

```tsx
import OwnershipConsensusPanel from "@/components/entity/OwnershipConsensusPanel";
```

- [ ] **Step 2: 装入面板（估值 section 之后、HoldersTable 之前）**

在 return 的 JSX 中，估值 `<section>…<EarningsPowerFloorCard …/></section>` 块之后、`<HoldersTable holders={holders} exited={exitedHolders} lang={lang} />` 之前，插入：

```tsx
          {/* 支柱② 谁在买 — 共识信号块(与估值结论并置) */}
          <OwnershipConsensusPanel
            issuer={issuer}
            ticker={ticker}
            n={n}
            totalValue={totalValue}
            moves={moves}
            topHolder={{ person: topHolder.person, slug: topHolder.slug }}
            period={latestPeriod}
            lang={lang}
          />
```

- [ ] **Step 3: 从 EntityPage 移除 notice 的 QuarterMovesPill（收编去重）**

把 `<EntityPage>` 的 prop `notice={<QuarterMovesPill moves={moves} lang={lang} />}` 整行删除（动向已进面板）。

- [ ] **Step 4: 清理不再使用的 import**

删除 page.tsx 顶部对 `QuarterMovesPill` 的 import（确认页内已无其它引用：`grep -n QuarterMovesPill src/app/\[lang\]/stocks/\[ticker\]/page.tsx` 应只剩被删处之外为空）。

- [ ] **Step 5: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出（exit 0）。无 "unused QuarterMovesPill" 之类报错。

- [ ] **Step 6: SSR view-source 核验（不依赖浏览器渲染）**

启动 dev（worktree 跑 next 需先 `npm ci`，见 [[worktree-build-needs-real-node-modules]]）：

```bash
cd web && npm ci && npm run dev &
# 待启动后:
curl -s http://localhost:3000/en/stocks/AAPL | grep -iE "Ownership · 13F consensus|superinvestor|Largest holder"
```

Expected: 三处关键文本在 payload 中（面板眉标、共识强度句、头号重仓人标签）；自足句（`Held by … as of …`）也应在 HTML。若本机无 Supabase env 导致 `/stocks/AAPL` 数据为空 → 改用任一已知有持仓的 ticker，或在已部署预览环境复验。

- [ ] **Step 7: 人工 QA（明暗双模 + 三宽）**

浏览器开 `/en/stocks/AAPL` 与 `/zh/stocks/AAPL`：
- 共识面板与估值面板**同款式、上下并置**；眉标绿→Fraunces→muted intro 节奏一致。
- 共识强度行 + 本季动向 chips（`MoveTag`/Pill 既有色）+ 头号重仓人链（hover 转绿）。
- 页眉**不再**出现重复的 QuarterMovesPill。
- 持有人表仍在面板下方作明细。
- 全零动向的票：退化句"本季无披露变动 / No disclosed position changes"出现，面板仍渲染强度。
- 暗色模式等价、390/768/1280 三宽不塌、纯单语无中英混排。

- [ ] **Step 8: 提交**

```bash
cd web && git add src/app/\[lang\]/stocks/\[ticker\]/page.tsx
git commit -m "feat(stock): 装入共识信号面板, 收编页眉 QuarterMovesPill 去重"
```

---

## Self-Review

**1. Spec coverage（对 spec §2 块③ + §5/§6）：**
- 共识信号面板复用 Panel 款式、与估值并置 → Task 2 + Task 3 ✓
- 共识强度（N 位 + 合计市值）→ Task 2 强度行 ✓
- 本季净方向（升级 QuarterMovesPill 进面板）→ Task 2 复用 Pill + Task 3 收编页眉去重 ✓
- 头号重仓人链（接力棒回拉）→ Task 2 topHolder Link ✓
- 持有人表保留为明细 → Task 3 未删 HoldersTable ✓
- as-of / 自足 GEO 句 → Task 1 helper + Task 2 `sr-only` 句 ✓
- 合规话术（无荐股、滞后标注）→ Task 1 check §4 + Task 2 disclaimer ✓
- 降级（moves 全零）→ Task 1 退化句 + Task 2 `hasMoves` 分支 + Task 3 QA ✓
- 设计语言（`--tt-*`/Fraunces/mono/rounded-md/绿色克制/禁 shadcn Card）→ Global Constraints + Task 2 类名 ✓
- 零新查询/零外部数据 → 全用页面已算局部量 ✓

**2. Placeholder scan：** 无 TBD/TODO；每步含真码或真命令 + 期望输出。✓

**3. Type consistency：** `QuarterMoves` 统一从 `@/components/entity/QuarterMovesPill` 导入（Task 1/2/页面同源）；`buildConsensusSentence` 签名 Task 1 定义、Task 2 调用一致；`topHolder` 在面板按 `{ person, slug }` 取用，页面 `topHolder`（HolderRow）含此二字段，Task 3 显式只传该二字段，匹配。✓

**4. 注意点：** `period`（`latestPeriod`）按原字符串显示（如 `2026Q1`），与站内既有 period 展示一致（如 ConvictionPicks `asOfPeriod`）；若后续要本地化季度标签，另起小任务，不在本块范围。

---

## Execution Handoff

执行在独立 thread/worktree：从 `db-foundation` 切 `feat/guided-line-stock-consensus`，逐 task 走 subagent-driven 或 executing-plans，每 task 末提交，完成后走 [[finishing-a-development-branch]] 开 PR 到 db-foundation。本块是引导线倒序的第一块（③）；②/① 各自独立 plan。
