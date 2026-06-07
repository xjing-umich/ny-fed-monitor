# 超级投资者聚合落地页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在超投 section 下新增「共识持仓 / 本季最多人买 / 本季最多人卖」三个聚合落地页，质量超越 Dataroma/ValueSider（持有大佬数主数字 + 季度环比 + 规则解读句 + 数据截至徽标），并把 `/stocks` 转为薄目录页保留「个股」一级导航。

**Architecture:** 三页均为 Server Component + ISR 静态（与全站一致），数据来自已物化的 `consensus_*` 表（`mostHeld`/`notableMoves`），无 env 时回退扫描。唯一新数据工作是从 `scanAllManagers()` 的 changes(new/exited) 派生"持有人净增减 delta"。解读句为确定性双语模板（无 AI、无推荐措辞）。一个响应式 `AggregateRankingList` 组件被三页复用。

**Tech Stack:** Next.js(App Router, 仓库为定制版，写代码前看 `node_modules/next/dist/docs/`) · TypeScript · Tailwind(CSS 变量主题 `--tt-*`) · Supabase(只读)。

**项目约定（重要）：**
- **不写单元测试**（项目记忆 [No Tests / Solo Dev]）。每个任务的验证 = `cd web && npm run build`（类型检查 + ISR 预渲染必须通过）+ 人工看页面。**构建必须用 Node 20**（`nvm use 20`，否则报 "Unexpected token ?"）。
- 工作基线：worktree `.claude/worktrees/superinvestor-aggregate`，分支 `feat/superinvestor-aggregate-pages`（已基于默认主分支 `db-foundation` 最新创建）。**本仓库默认分支是 `db-foundation`，非 main/master。**
- 本地连库验证可选：`cp ../.env.local web/.env.local`（验完用绝对路径删除）；无 env 时页面走扫描回退，仍可渲染。
- 频繁提交，每个 Task 末尾一次 commit。

**Spec:** `docs/superpowers/specs/2026-06-07-superinvestor-aggregate-pages-design.md`

---

## File Structure

**新建**
- `web/src/lib/aggregate/blurb.ts` — `consensusBlurb()` / `movesBlurb()` 纯函数（确定性双语解读句）
- `web/src/components/aggregate/AggregateRankingList.tsx` — 响应式排行列表（B 卡片为主），三页复用
- `web/src/components/aggregate/DataAsOfBadge.tsx` — 数据截至 + 45天滞后徽标
- `web/src/components/aggregate/AggregateBlurb.tsx` — 解读条容器（纸白底+绿左边框）
- `web/src/app/[lang]/investors/consensus/page.tsx` — 共识页
- `web/src/app/[lang]/investors/buys/page.tsx` — 最多人买
- `web/src/app/[lang]/investors/sells/page.tsx` — 最多人卖
- `web/src/app/[lang]/investors/consensus/opengraph-image.tsx`（+ buys/sells）— 专属 OG 图

**修改**
- `web/src/lib/aggregations.ts` — 加 `computeHolderDeltas()` + `holderDeltas()`
- `web/src/lib/nav.ts` — investors 三 soon tab → href；stocks 二级简化
- `web/src/app/[lang]/stocks/page.tsx` — 改薄目录/搜索页

---

## Task 1: 持有人净增减 delta 派生函数

**Files:**
- Modify: `web/src/lib/aggregations.ts`（在文件末尾追加；类型 `ScanRow`/`scanAllManagers` 已在本文件定义）

- [ ] **Step 1: 追加派生函数**

在 `web/src/lib/aggregations.ts` 末尾追加：

```ts
/**
 * 持有人净增减(季度环比): 每标的 (新建仓数 − 清仓数)。
 * consensus_moves 表按 ticker+direction 聚合, 无法拆 new/exited, 故从 scan 的 changes 派生。
 * 返回以 **cusip** 为键(与 changes 原始一致)。
 */
export function computeHolderDeltas(scan: ScanRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of scan) {
    for (const c of row.changes) {
      if (c.kind === "new") m.set(c.cusip, (m.get(c.cusip) ?? 0) + 1);
      else if (c.kind === "exited") m.set(c.cusip, (m.get(c.cusip) ?? 0) - 1);
    }
  }
  return m;
}

/** 把 delta 的键从 cusip 映射为 ticker(与 mostHeld 行的 cusip 字段=ticker 对齐)。无库映射时原样返回。 */
export async function holderDeltas(): Promise<Map<string, number>> {
  const raw = computeHolderDeltas(await scanAllManagers());
  const { getCusipMap } = await import("@/lib/managers/securities");
  const map = await getCusipMap();
  if (map.size === 0) return raw;
  const out = new Map<string, number>();
  for (const [cusip, v] of raw) {
    const ticker = map.get(cusip)?.ticker ?? cusip;
    out.set(ticker, (out.get(ticker) ?? 0) + v);
  }
  return out;
}
```

- [ ] **Step 2: 类型检查**

Run: `cd web && nvm use 20 && npx tsc --noEmit`
Expected: 无新错误（`HoldingChange.kind` 含 "new"/"exited"，`Holding.cusip`/`changes[].cusip` 存在）。

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/aggregations.ts
git commit -m "feat(aggregate): 持有人净增减 delta 派生(holderDeltas)"
```

---

## Task 2: 解读句规则模板（纯函数）

**Files:**
- Create: `web/src/lib/aggregate/blurb.ts`

- [ ] **Step 1: 写模板函数**

创建 `web/src/lib/aggregate/blurb.ts`：

```ts
import type { Lang } from "@/lib/nav";

export type BlurbRow = { ticker: string; issuer: string; primary: number; delta?: number | null };

/** 共识页解读句。事实派生、无推荐措辞。空数据 → null(不渲染)。 */
export function consensusBlurb(rows: BlurbRow[], managerCount: number, lang: Lang): string | null {
  if (rows.length === 0) return null;
  const top = rows[0];
  const sumTop5 = rows.slice(0, 5).reduce((s, r) => s + r.primary, 0);
  const d = top.delta ?? 0;
  if (lang === "zh") {
    const deltaTxt = d === 0 ? "环比持平" : `环比 ${d > 0 ? "+" : "−"}${Math.abs(d)} 位`;
    return `本季纳入统计的 ${managerCount} 位超级投资者中，${top.ticker}（${top.issuer}）被 ${top.primary} 位同时持有、居共识首位，${deltaTxt}；前五大共识股合计出现 ${sumTop5} 人次。`;
  }
  const deltaTxt = d === 0 ? "unchanged vs last quarter" : `${d > 0 ? "+" : "−"}${Math.abs(d)} vs last quarter`;
  return `Among ${managerCount} superinvestors tracked, ${top.ticker} is the most widely held — in ${top.primary} portfolios (${deltaTxt}). The top 5 consensus names appear in ${sumTop5} portfolios combined.`;
}

/** 买/卖页解读句。 */
export function movesBlurb(rows: BlurbRow[], side: "buy" | "sell", lang: Lang): string | null {
  if (rows.length === 0) return null;
  const [a, b, c] = rows;
  const sep = lang === "zh" ? "、" : " and ";
  const names = [b?.ticker, c?.ticker].filter(Boolean).join(sep);
  if (lang === "zh") {
    const verb = side === "buy" ? "买入（新建仓或加仓）" : "卖出（清仓或减仓）";
    const tail = names ? `，其后是 ${names}` : "";
    return `本季 ${a.ticker} 获最多大佬${verb}——${a.primary} 位${tail}。`;
  }
  const verb = side === "buy" ? "buying — opened or added" : "selling — sold or trimmed";
  const tail = names ? `, followed by ${names}` : "";
  return `This quarter, ${a.ticker} drew the most ${verb} (${a.primary} superinvestors)${tail}.`;
}
```

- [ ] **Step 2: 类型检查**

Run: `cd web && npx tsc --noEmit`
Expected: 无错误（`Lang` 从 `@/lib/nav` 导出，已确认）。

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/aggregate/blurb.ts
git commit -m "feat(aggregate): 确定性双语解读句模板"
```

---

## Task 3: DataAsOfBadge 组件

**Files:**
- Create: `web/src/components/aggregate/DataAsOfBadge.tsx`

- [ ] **Step 1: 写组件**

创建 `web/src/components/aggregate/DataAsOfBadge.tsx`：

```tsx
import React from "react";
import type { Lang } from "@/lib/nav";

/** 数据截至 + 13F 45 天滞后徽标。asOf 省略时只显示滞后说明。 */
export function DataAsOfBadge({ lang, asOf }: { lang: Lang; asOf?: string }) {
  const isZh = lang === "zh";
  const datePart = asOf ? (isZh ? `数据截至 ${asOf} · ` : `As of ${asOf} · `) : "";
  const lagPart = isZh ? "13F，最多滞后 45 天" : "13F, up to 45-day lag";
  return (
    <span className="inline-flex items-center rounded border border-[var(--tt-border)] bg-[var(--tt-surface)] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[var(--tt-muted)]">
      {datePart}{lagPart}
    </span>
  );
}
```

- [ ] **Step 2: 类型检查 + Commit**

Run: `cd web && npx tsc --noEmit` → Expected: PASS

```bash
git add web/src/components/aggregate/DataAsOfBadge.tsx
git commit -m "feat(aggregate): 数据截至徽标组件"
```

---

## Task 4: AggregateBlurb 组件

**Files:**
- Create: `web/src/components/aggregate/AggregateBlurb.tsx`

- [ ] **Step 1: 写组件**

创建 `web/src/components/aggregate/AggregateBlurb.tsx`：

```tsx
import React from "react";

/** 解读条: 纸白底 + 钞票绿左边框。text 为 null 时不渲染。 */
export function AggregateBlurb({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="mb-6 border-l-[3px] border-[var(--tt-accent)] bg-[var(--tt-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--tt-text)]">
      {text}
    </p>
  );
}
```

- [ ] **Step 2: 类型检查 + Commit**

Run: `cd web && npx tsc --noEmit` → Expected: PASS

```bash
git add web/src/components/aggregate/AggregateBlurb.tsx
git commit -m "feat(aggregate): 解读条容器组件"
```

---

## Task 5: AggregateRankingList 组件（响应式，三页复用）

**Files:**
- Create: `web/src/components/aggregate/AggregateRankingList.tsx`

参照 `web/src/app/[lang]/stocks/page.tsx:95-140` 的现有行结构（rank 数字 + issuer + ticker + 链接 + 持有条），但改为 B 编辑式卡片行：左 rank、中 issuer/ticker + subline、右"大数字主指标 + delta/动作标签"。

- [ ] **Step 1: 写组件**

创建 `web/src/components/aggregate/AggregateRankingList.tsx`：

```tsx
import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { formatUSD } from "@/lib/format";

export type RankRow = {
  ticker: string;
  issuer: string;
  primary: number;            // 主数字: 持有大佬数 / 动作大佬数
  href: string;
  delta?: number | null;      // 共识页: 持有人净增减
  pctOfAggregate?: number;    // 共识页: 0–1
  value?: number;             // 买卖页: 涉及金额
  kindLabel?: string;         // 买卖页: 动作标签
  kindTone?: "positive" | "warn" | "neutral";
};

const toneClass: Record<NonNullable<RankRow["kindTone"]>, string> = {
  positive: "text-[var(--tt-accent)]",
  warn: "text-[#b03a3a]",
  neutral: "text-[var(--tt-muted)]",
};

export function AggregateRankingList({
  lang, rows, primaryLabel,
}: { lang: Lang; rows: RankRow[]; primaryLabel: string }) {
  const isZh = lang === "zh";
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[var(--tt-muted)]">
        {isZh ? "数据准备中" : "Data coming soon"}
      </p>
    );
  }
  return (
    <ul className="list-none p-0 m-0">
      {rows.map((r, i) => (
        <li key={r.ticker} className="flex items-center gap-3 border-b border-[var(--tt-border)] py-3">
          <span className="w-6 shrink-0 font-display text-xl text-[var(--tt-faint)] tabular-nums">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <Link href={r.href} className="font-display font-medium text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]">
              {r.ticker}
              <span className="ml-2 font-normal text-[var(--tt-muted)]">{r.issuer}</span>
            </Link>
            <div className="mt-0.5 text-[11px] text-[var(--tt-faint)]">
              {r.pctOfAggregate != null && (isZh ? `占聚合 ${(r.pctOfAggregate * 100).toFixed(1)}%` : `${(r.pctOfAggregate * 100).toFixed(1)}% of aggregate`)}
              {r.kindLabel && <span className={toneClass[r.kindTone ?? "neutral"]}>{r.kindLabel}</span>}
              {r.value != null && <span className="ml-2">{formatUSD(r.value)}</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-2xl font-semibold tabular-nums text-[var(--tt-text)]">{r.primary}</div>
            {r.delta != null ? (
              <div className={`text-[11px] ${r.delta > 0 ? "text-[var(--tt-accent)]" : r.delta < 0 ? "text-[#b03a3a]" : "text-[var(--tt-faint)]"}`}>
                {r.delta === 0 ? (isZh ? "持平" : "—") : `${r.delta > 0 ? "+" : "−"}${Math.abs(r.delta)} ${isZh ? "位" : ""}`}
              </div>
            ) : (
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">{primaryLabel}</div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `cd web && npx tsc --noEmit`
Expected: PASS（`formatUSD` 从 `@/lib/format` 导出，已在 stocks 页使用确认）。

- [ ] **Step 3: Commit**

```bash
git add web/src/components/aggregate/AggregateRankingList.tsx
git commit -m "feat(aggregate): 响应式排行列表组件(三页复用)"
```

---

## Task 6: 导航打通（nav.ts）

**Files:**
- Modify: `web/src/lib/nav.ts:18-33`（`SECONDARY_NAV` 的 investors/stocks 两段）

- [ ] **Step 1: investors 三 tab 去 soon、补 href；stocks 简化**

把 `SECONDARY_NAV.investors` 改为：

```ts
  investors: [
    { key: "all", zh: "全部投资者", en: "All", href: "/investors" },
    { key: "buys", zh: "本季最多人买", en: "Top buys", href: "/investors/buys" },
    { key: "sells", zh: "本季最多人卖", en: "Top sells", href: "/investors/sells" },
    { key: "consensus", zh: "共识持仓", en: "Consensus", href: "/investors/consensus" },
  ],
```

把 `SECONDARY_NAV.stocks` 改为（移除 held/moves，聚合已搬到超投；stocks 一级落地页本身即目录）：

```ts
  stocks: [
    { key: "directory", zh: "个股目录", en: "Directory", href: "/stocks" },
  ],
```

- [ ] **Step 2: 类型检查 + Commit**

Run: `cd web && npx tsc --noEmit` → Expected: PASS（保留 `SecondaryNavItem` 形状，`soon` 字段可选）

```bash
git add web/src/lib/nav.ts
git commit -m "feat(nav): 超投三聚合 tab 通路由, stocks 二级简化"
```

---

## Task 7: 共识页 `/investors/consensus`

**Files:**
- Create: `web/src/app/[lang]/investors/consensus/page.tsx`

装配：`mostHeld(50)` + `holderDeltas()` + `getManagerIndex()` 算 managerCount + 组件内算占比 → 徽标 + 解读条 + 排行列表。参照 `stocks/page.tsx` 的 metadata/revalidate/notFound 写法。

- [ ] **Step 1: 写页面**

创建 `web/src/app/[lang]/investors/consensus/page.tsx`：

```tsx
import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { mostHeld, holderDeltas } from "@/lib/aggregations";
import { getManagerIndex } from "@/lib/managers/source";
import { stockPath } from "@/lib/urls";
import SubNav from "@/components/shell/SubNav";
import { DataAsOfBadge } from "@/components/aggregate/DataAsOfBadge";
import { AggregateBlurb } from "@/components/aggregate/AggregateBlurb";
import { AggregateRankingList, type RankRow } from "@/components/aggregate/AggregateRankingList";
import { consensusBlurb, type BlurbRow } from "@/lib/aggregate/blurb";

export const revalidate = 86400; // 季度级数据, 每日 ISR 足够

export function generateStaticParams() {
  return [{ lang: "zh" }, { lang: "en" }];
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const isZh = rawLang === "zh";
  return isZh
    ? { title: "共识持仓 · 超级投资者 — Compounder · 复利", description: "顶级价值投资者 13F 中被最多人同时持有的股票，含季度环比。" }
    : { title: "Consensus holdings · Superinvestors — Compounder", description: "Stocks held by the most superinvestors (13F), with quarter-over-quarter change." };
}

export default async function ConsensusPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const isZh = lang === "zh";

  const [rows, deltas, idx] = await Promise.all([mostHeld(50), holderDeltas(), getManagerIndex()]);
  const managerCount = idx.managers.length;
  const totalSum = rows.reduce((s, r) => s + r.totalValue, 0) || 1;

  const rankRows: RankRow[] = rows.map((r) => ({
    ticker: r.cusip, issuer: r.issuer, primary: r.holderCount,
    delta: deltas.get(r.cusip) ?? null,
    pctOfAggregate: r.totalValue / totalSum,
    href: stockPath(lang, r.cusip),
  }));
  const blurbRows: BlurbRow[] = rankRows.map((r) => ({ ticker: r.ticker, issuer: r.issuer, primary: r.primary, delta: r.delta }));

  return (
    <div className="mx-auto max-w-4xl px-2 py-8 sm:py-10">
      <SubNav lang={lang} section="investors" active="consensus" />
      <div className="mb-6 border-b border-[var(--tt-border)] pb-6">
        <h1 className="font-display text-3xl font-medium tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {isZh ? "共识持仓" : "Consensus holdings"}
        </h1>
        <p className="mt-2 text-sm text-[var(--tt-muted)]">
          {isZh ? "最多超级投资者同时持有的股票，按持有大佬数排列。" : "Stocks held by the most superinvestors, ranked by holder count."}
        </p>
        <div className="mt-3"><DataAsOfBadge lang={lang} /></div>
      </div>
      <AggregateBlurb text={consensusBlurb(blurbRows, managerCount, lang)} />
      <AggregateRankingList lang={lang} rows={rankRows} primaryLabel={isZh ? "持有" : "holders"} />
    </div>
  );
}
```

- [ ] **Step 2: 构建验证**

Run: `cd web && nvm use 20 && npm run build`
Expected: 构建通过；`/zh/investors/consensus`、`/en/investors/consensus` 进入预渲染清单，无报错。

- [ ] **Step 3: 人工看页面**

Run: `cd web && npm start`，浏览器开 `http://localhost:3000/zh/investors/consensus`
Expected: 顶部 SubNav 高亮"共识持仓"；徽标显示滞后说明；解读条一句话；列表每行=排名 + 票/名 + 占聚合% + 右侧大数字(持有大佬数) + delta。无库时解读条可能为空、列表显示"数据准备中"（属正常回退）。

- [ ] **Step 4: Commit**

```bash
git add web/src/app/[lang]/investors/consensus/page.tsx
git commit -m "feat(consensus): 共识持仓聚合落地页"
```

---

## Task 8: 最多人买 / 最多人卖 页

**Files:**
- Create: `web/src/app/[lang]/investors/buys/page.tsx`
- Create: `web/src/app/[lang]/investors/sells/page.tsx`

两页结构相同，仅 side 与文案不同。先写一个共享渲染函数避免重复。

- [ ] **Step 1: 写共享装配函数**

创建 `web/src/app/[lang]/investors/_movesPage.tsx`（下划线前缀 = 非路由）：

```tsx
import React from "react";
import { notFound } from "next/navigation";
import type { Lang } from "@/lib/nav";
import type { MoveRow, MoveKind } from "@/lib/aggregations";
import { notableMoves } from "@/lib/aggregations";
import { stockPath } from "@/lib/urls";
import SubNav from "@/components/shell/SubNav";
import { DataAsOfBadge } from "@/components/aggregate/DataAsOfBadge";
import { AggregateBlurb } from "@/components/aggregate/AggregateBlurb";
import { AggregateRankingList, type RankRow } from "@/components/aggregate/AggregateRankingList";
import { movesBlurb, type BlurbRow } from "@/lib/aggregate/blurb";

const KIND_LABEL: Record<MoveKind, { zh: string; en: string; tone: "positive" | "warn" }> = {
  new: { zh: "新建仓", en: "Opened", tone: "positive" },
  increased: { zh: "加仓", en: "Added", tone: "positive" },
  exited: { zh: "清仓", en: "Exited", tone: "warn" },
  decreased: { zh: "减仓", en: "Trimmed", tone: "warn" },
};

export async function MovesPage({ lang, side }: { lang: Lang; side: "buy" | "sell" }) {
  const isZh = lang === "zh";
  const { mostBought, mostSold } = await notableMoves(30);
  const data: MoveRow[] = side === "buy" ? mostBought : mostSold;

  const rankRows: RankRow[] = data.map((r) => {
    const k = KIND_LABEL[r.dominantKind];
    return {
      ticker: r.cusip, issuer: r.issuer, primary: r.count, value: r.value,
      kindLabel: isZh ? k.zh : k.en, kindTone: k.tone,
      href: stockPath(lang, r.cusip),
    };
  });
  const blurbRows: BlurbRow[] = rankRows.map((r) => ({ ticker: r.ticker, issuer: r.issuer, primary: r.primary }));

  const heading = side === "buy" ? (isZh ? "本季最多人买" : "Top buys") : (isZh ? "本季最多人卖" : "Top sells");
  const sub = side === "buy"
    ? (isZh ? "本季被最多超级投资者新建仓或加仓的股票。" : "Stocks most superinvestors opened or added this quarter.")
    : (isZh ? "本季被最多超级投资者清仓或减仓的股票。" : "Stocks most superinvestors exited or trimmed this quarter.");

  return (
    <div className="mx-auto max-w-4xl px-2 py-8 sm:py-10">
      <SubNav lang={lang} section="investors" active={side === "buy" ? "buys" : "sells"} />
      <div className="mb-6 border-b border-[var(--tt-border)] pb-6">
        <h1 className="font-display text-3xl font-medium tracking-tight text-[var(--tt-text)] sm:text-4xl">{heading}</h1>
        <p className="mt-2 text-sm text-[var(--tt-muted)]">{sub}</p>
        <div className="mt-3"><DataAsOfBadge lang={lang} /></div>
      </div>
      <AggregateBlurb text={movesBlurb(blurbRows, side, lang)} />
      <AggregateRankingList lang={lang} rows={rankRows} primaryLabel={isZh ? "位大佬" : "managers"} />
    </div>
  );
}

export function notFoundIfBadLang(rawLang: string): asserts rawLang is Lang {
  if (rawLang !== "zh" && rawLang !== "en") notFound();
}
```

- [ ] **Step 2: 写两个路由页**

创建 `web/src/app/[lang]/investors/buys/page.tsx`：

```tsx
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { MovesPage, notFoundIfBadLang } from "../_movesPage";

export const revalidate = 86400;
export function generateStaticParams() { return [{ lang: "zh" }, { lang: "en" }]; }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return lang === "zh"
    ? { title: "本季最多人买 · 超级投资者 — Compounder · 复利", description: "本季被最多顶级投资者新建仓或加仓的股票（13F）。" }
    : { title: "Top buys · Superinvestors — Compounder", description: "Stocks most superinvestors opened or added this quarter (13F)." };
}

export default async function BuysPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  notFoundIfBadLang(lang);
  return <MovesPage lang={lang as Lang} side="buy" />;
}
```

创建 `web/src/app/[lang]/investors/sells/page.tsx`（同构，side="sell"）：

```tsx
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { MovesPage, notFoundIfBadLang } from "../_movesPage";

export const revalidate = 86400;
export function generateStaticParams() { return [{ lang: "zh" }, { lang: "en" }]; }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return lang === "zh"
    ? { title: "本季最多人卖 · 超级投资者 — Compounder · 复利", description: "本季被最多顶级投资者清仓或减仓的股票（13F）。" }
    : { title: "Top sells · Superinvestors — Compounder", description: "Stocks most superinvestors exited or trimmed this quarter (13F)." };
}

export default async function SellsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  notFoundIfBadLang(lang);
  return <MovesPage lang={lang as Lang} side="sell" />;
}
```

- [ ] **Step 3: 构建 + 人工验证**

Run: `cd web && nvm use 20 && npm run build && npm start`
Expected: 构建含 4 个新预渲染页(`{zh,en}/investors/{buys,sells}`)。看 `http://localhost:3000/zh/investors/buys`：SubNav 高亮"本季最多人买"，每行右侧大数字=动作大佬数，subline 有动作色块标签(新建仓/加仓 绿、清仓/减仓 红) + 金额；解读条一句话。sells 同理。

- [ ] **Step 4: Commit**

```bash
git add web/src/app/[lang]/investors/_movesPage.tsx web/src/app/[lang]/investors/buys/page.tsx web/src/app/[lang]/investors/sells/page.tsx
git commit -m "feat(moves): 本季最多人买/卖聚合落地页"
```

---

## Task 9: /stocks 改薄目录/搜索页

**Files:**
- Modify: `web/src/app/[lang]/stocks/page.tsx`（整体替换页面主体；移除最多机构持有榜单，避免与 consensus 重复）

把"最多机构持有"内容唯一 canonical 归 consensus，`/stocks` 改为轻量入口：搜索提示 + 字母索引（用 `getCusipMap()` 现有 ticker 全集）+ 去 consensus 的 CTA。

- [ ] **Step 1: 替换页面**

替换 `web/src/app/[lang]/stocks/page.tsx` 全文：

```tsx
import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { getCusipMap } from "@/lib/managers/securities";
import { stockPath } from "@/lib/urls";
import { isLikelyTicker } from "@/lib/externalLinks";

export const revalidate = 86400;

export function generateStaticParams() { return [{ lang: "zh" }, { lang: "en" }]; }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return lang === "zh"
    ? { title: "个股目录 — Compounder · 复利", description: "浏览顶级投资者 13F 覆盖的全部个股；或查看共识持仓榜单。" }
    : { title: "Stock directory — Compounder", description: "Browse every stock covered by superinvestor 13F filings, or see the consensus ranking." };
}

export default async function StocksDirectoryPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const isZh = lang === "zh";

  // 全集 ticker(去重 + 仅保留像 ticker 的), 按字母排序做索引。
  const cusipMap = await getCusipMap();
  const tickers = Array.from(new Set(Array.from(cusipMap.values()).map((v) => v.ticker)))
    .filter((t): t is string => !!t && isLikelyTicker(t))
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto max-w-4xl px-2 py-8 sm:py-10">
      <div className="mb-6 border-b border-[var(--tt-border)] pb-6">
        <h1 className="font-display text-3xl font-medium tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {isZh ? "个股目录" : "Stock directory"}
        </h1>
        <p className="mt-2 text-sm text-[var(--tt-muted)]">
          {isZh ? "顶级投资者 13F 覆盖的全部个股。想看哪只票被最多大佬持有？" : "Every stock covered by superinvestor 13F filings. Looking for what the most superinvestors hold?"}
          <Link href={`/${lang}/investors/consensus`} className="ml-1 text-[var(--tt-accent)] no-underline hover:underline">
            {isZh ? "查看共识持仓榜 →" : "See the consensus ranking →"}
          </Link>
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {tickers.map((t) => (
          <Link key={t} href={stockPath(lang, t)} className="font-mono text-sm text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]">
            {t}
          </Link>
        ))}
      </div>

      {tickers.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--tt-muted)]">{isZh ? "暂无数据" : "No data available"}</p>
      )}
    </div>
  );
}
```

> 注：SubNav 已在 Task 6 简化为单 `directory` tab。本页不渲染 SubNav（单页无需），如需一致性可加 `<SubNav lang={lang} section="stocks" active="directory" />`。

- [ ] **Step 2: 构建 + 人工验证**

Run: `cd web && nvm use 20 && npm run build && npm start`
Expected: `/zh/stocks` 显示个股目录(字母排序 ticker 网格) + 去 consensus 的 CTA，**不再有最多机构持有榜单**。点任一 ticker 进 `/zh/stocks/[ticker]` 详情页正常。`/zh/stocks/AAPL` 等详情页与 sitemap 不受影响。

- [ ] **Step 3: Commit**

```bash
git add web/src/app/[lang]/stocks/page.tsx
git commit -m "refactor(stocks): 列表页改薄目录, 共识内容归 consensus 唯一 canonical"
```

---

## Task 10: 三页专属 OG 图

**Files:**
- Create: `web/src/app/[lang]/investors/consensus/opengraph-image.tsx`
- Create: `web/src/app/[lang]/investors/buys/opengraph-image.tsx`
- Create: `web/src/app/[lang]/investors/sells/opengraph-image.tsx`

复用现有 `src/lib/ogCard.tsx`。**先读参照文件** `web/src/app/[lang]/investors/[slug]/opengraph-image.tsx`（已存在）了解其 `ogCard`/`ImageResponse` 用法与导出(`size`/`contentType`/`alt`/default)。

- [ ] **Step 1: 读参照并照搬结构**

Run: `cd web && sed -n '1,60p' src/app/[lang]/investors/[slug]/opengraph-image.tsx`（或 Read 工具）。照其结构创建三个文件，仅改标题文案：
- consensus → 英文主标 "Consensus holdings"，副标 "Superinvestor 13F"
- buys → "Top buys this quarter"
- sells → "Top sells this quarter"

（OG 文案纯英文，遵 [[seo-english-first]]：社交图无中文字标。）若参照文件用 `generateImageMetadata` 或读取 params，照搬即可；这三页无 slug，去掉 params 依赖、标题写死。

- [ ] **Step 2: 构建验证 + Commit**

Run: `cd web && nvm use 20 && npm run build`
Expected: 构建通过；三页 OG 路由产出图片端点(`/investors/consensus/opengraph-image` 等)。

```bash
git add web/src/app/[lang]/investors/consensus/opengraph-image.tsx web/src/app/[lang]/investors/buys/opengraph-image.tsx web/src/app/[lang]/investors/sells/opengraph-image.tsx
git commit -m "feat(seo): 三聚合页专属 OG 图(英文)"
```

---

## Task 11: ItemList 结构化数据（SEO）

**Files:**
- Modify: `web/src/app/[lang]/investors/consensus/page.tsx`
- Modify: `web/src/app/[lang]/investors/_movesPage.tsx`

给三页加 `ItemList` JSON-LD（schema.org），项为榜单的票。参照现有结构化数据写法（[[seo-english-first]] Round2：投资人页 Person、个股页 FAQPage 已落地，找 `application/ld+json` 用例）。

- [ ] **Step 1: 读现有 JSON-LD 用例**

Run: `cd web && grep -rn "application/ld+json" src/app/[lang] | head`
照其注入方式（通常 `<script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(data)}} />`）。

- [ ] **Step 2: 在共识页与 _movesPage 注入 ItemList**

在两处 return 的根 `<div>` 内顶部加：

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: rankRows.slice(0, 20).map((r, i) => ({
      "@type": "ListItem", position: i + 1, name: `${r.ticker} ${r.issuer}`,
    })),
  }) }}
/>
```

- [ ] **Step 3: 构建验证 + Commit**

Run: `cd web && nvm use 20 && npm run build` → Expected: PASS

```bash
git add web/src/app/[lang]/investors/consensus/page.tsx web/src/app/[lang]/investors/_movesPage.tsx
git commit -m "feat(seo): 三聚合页 ItemList 结构化数据"
```

---

## Task 12: 全量构建回归 + sitemap 检查

- [ ] **Step 1: 完整构建**

Run: `cd web && nvm use 20 && npm run build`
Expected: 全站构建通过，无类型/预渲染错误。新页 `{zh,en}/investors/{consensus,buys,sells}` + `/stocks`(目录) 在输出清单。

- [ ] **Step 2: 确认 sitemap 与个股资产未被破坏**

Run: `cd web && npm start`，访问 `/sitemap.xml`
Expected: 全量个股 URL 仍在（`sitemap.ts` 用 `mostHeld` 生成个股 URL，未受本次改动影响）；个股详情页 `/zh/stocks/AAPL` 200。

> 可选：把三个新聚合页加入 sitemap（若 `sitemap.ts` 未自动包含静态路由）。读 `web/src/app/sitemap.ts` 确认其是否枚举这些路由；若需要，按其现有 entry 格式追加三条（英文 priority 高、中文 ×0.7，hreflang en/zh-CN/x-default→en，遵 [[seo-english-first]]）。

- [ ] **Step 3: Commit（若动了 sitemap）**

```bash
git add web/src/app/sitemap.ts
git commit -m "feat(seo): sitemap 收录三聚合页(英文优先)"
```

---

## 完成标准（对照 spec §7）

1. ✅ `/investors/{consensus,buys,sells}` zh/en 均 200、ISR 静态 — Task 7,8
2. ✅ SubNav 三 tab 通路由、active 正确 — Task 6,7,8
3. ✅ `/stocks` 改薄目录页、不再渲染最多机构持有、详情页+sitemap 不受影响、consensus 唯一 canonical — Task 9,12
4. ✅ 共识页五件套(持有大佬数/占比/环比delta/解读句/徽标) — Task 7
5. ✅ 买卖页(动作大佬数/动作色块/金额/解读句/徽标) — Task 8
6. ✅ 解读句确定性双语无推荐措辞、空数据走边界 — Task 2,5
7. ✅ 无 env 回退扫描仍渲染 — Task 1(holderDeltas 回退)/mostHeld/notableMoves 现有回退
8. ✅ 每页 metadata 英文优先 + ItemList + 专属 OG — Task 7,8,10,11

## 风险/备注

- **snapshotDate 暂未接入**：`DataAsOfBadge` v1 只显示"13F 最多滞后 45 天"（不带具体季度截至日），因当前未确认 `getManagerIndex()` 是否暴露最新报告期字段。后续可加：读最新 filing period 传入 `asOf`。不阻塞 v1。
- delta 始终走 `scanAllManagers()`，即使 `mostHeld` 命中 DB 也会触发一次扫描；ISR 构建时可接受。若后续要去掉扫描，需在 `consensus_moves` 增 new/exited 拆分列。
- 实现全程在 worktree `.claude/worktrees/superinvestor-aggregate`（分支 `feat/superinvestor-aggregate-pages`），勿在主工作树操作（[[data-layer-state]] 多 session 撞车教训）。
