# 发现面接力（Discovery Handoff）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给个股页、投资人页加上下文感知的"下一步"出口接到 screener，并让 screener 既有 holder_count 列可排序——把单股/单投资人会话延伸到整个机会集。

**Architecture:** 两个纯函数（`discoveryHandoff.ts` 上下文文案、`screenerSort.ts` 排序）隔离唯一的条件逻辑、可裸跑 `.check.ts` 测试；一个 RSC 展示组件 `DiscoveryHandoff` 两页复用；screener 排序在内存对已读 ≤200 行做、零新查询。无 `"use client"`、零迁移。

**Tech Stack:** Next.js App Router (RSC, SSG+ISR)、TypeScript、Tailwind（仅 `--tt-*` token）、Supabase（既有读取，不改）。验证用 `npx tsx`（.check.ts）+ `npx tsc --noEmit`，**不用 `next build`**（本机 google fonts 被墙必失败）。

## Global Constraints

- 估值哲学红线：文案只陈述事实（位置/数量），禁 BUY/SELL/HOLD/目标价/评级/动量/时机。出口是观察邀请，非行动建议。
- 文案禁中英混排：每 locale 纯单语言。
- 设计语言：仅 `--tt-*` token；面板 `rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 sm:p-6`；绿色 mono eyebrow（10px、uppercase、tracking 0.14em、`--tt-accent`）→ 文本（`--tt-text`）→ mono CTA（`→`、hover 转 `--tt-accent`、`group` 悬停）。禁 shadcn Card。
- RSC / 零 hydration：无 `"use client"`；链接进 SSR HTML。
- 优雅降级：verdict 为空 / 读取失败 → 兜底文案 + 兜底链接，绝不抛错。
- 纯逻辑脱离 server-only 边界：`discoveryHandoff.ts` / `screenerSort.ts` 不得 `import "server-only"`，只用 `import type` 引类型（tsx 裸跑不触发运行期加载）。
- 工作目录：所有命令在 `web/` 下；分支基 `db-foundation`。

---

### Task A: 上下文文案纯函数 `discoveryHandoff.ts` + 测试

**Files:**
- Create: `web/src/lib/discovery/discoveryHandoff.ts`
- Test: `web/src/lib/discovery/discoveryHandoff.check.ts`

**Interfaces:**
- Consumes: `Lang` from `@/lib/nav`；`ValuationVerdict` from `@/lib/valuation/deriveValuationVerdict`（仅 `import type`）。
- Produces:
  - `type DiscoveryCta = { eyebrow: string; line: string; href: string; ctaLabel: string }`
  - `function stockHandoffFor(verdict: ValuationVerdict | null, ticker: string, lang: Lang): DiscoveryCta`
  - `function investorHandoffFor(strikeCount: number, person: string, lang: Lang): DiscoveryCta`

- [ ] **Step 1: 写实现**

`web/src/lib/discovery/discoveryHandoff.ts`：

```ts
// 上下文感知"下一步"出口的文案+链接。纯函数(无 "server-only", 仅 import type),
// 可被 .check.ts 裸 `npx tsx` 跑。守 [[valuation-philosophy-constraint]]: 只陈述事实, 不荐买卖。
import type { Lang } from "@/lib/nav";
import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";

export type DiscoveryCta = { eyebrow: string; line: string; href: string; ctaLabel: string };

const EYEBROW: Record<Lang, string> = { zh: "下一步 · 值不值", en: "Next · is it cheap" };

function screenerHref(lang: Lang, view?: "strike_zone" | "below"): string {
  return view ? `/${lang}/stocks/screener?view=${view}` : `/${lang}/stocks/screener`;
}

/** 个股页: 按估值档位给出延伸到 screener 的观察邀请。verdict=null / 不可信 → 兜底。 */
export function stockHandoffFor(verdict: ValuationVerdict | null, ticker: string, lang: Lang): DiscoveryCta {
  const zh = lang === "zh";
  const eyebrow = EYEBROW[lang];
  const T = ticker.toUpperCase();

  if (!verdict || !verdict.reliable) {
    return {
      eyebrow,
      href: screenerHref(lang),
      line: zh ? "想知道现在哪些股票相对保守价值带便宜？" : "Want to see which stocks look cheap against a conservative value band?",
      ctaLabel: zh ? "浏览全部可估值股票，按价值带排序" : "Browse all valued stocks, ranked by value band",
    };
  }
  if (verdict.inStrikeZone) {
    return {
      eyebrow,
      href: screenerHref(lang, "strike_zone"),
      line: zh ? `${T} 现价落在保守价值带下方。` : `${T}'s price sits below its conservative value band.`,
      ctaLabel: zh ? "看全市场还有哪些落在击球区" : "See which other stocks are in the strike zone",
    };
  }
  if (verdict.bucket === "below") {
    return {
      eyebrow,
      href: screenerHref(lang, "below"),
      line: zh ? `${T} 现价低于保守价值带。` : `${T}'s price is below its conservative value band.`,
      ctaLabel: zh ? "按安全边际浏览全部低估股" : "Browse all undervalued stocks by margin of safety",
    };
  }
  return {
    eyebrow,
    href: screenerHref(lang, "strike_zone"),
    line: zh ? `${T} 现价不低于保守价值带。` : `${T}'s price is not below its conservative value band.`,
    ctaLabel: zh ? "看看现在哪些股票落在击球区" : "See which stocks are in the strike zone right now",
  };
}

/** 投资人页: 把"这个人的击球区持仓"延伸到全市场击球区清单。 */
export function investorHandoffFor(strikeCount: number, person: string, lang: Lang): DiscoveryCta {
  const zh = lang === "zh";
  const eyebrow = EYEBROW[lang];
  if (strikeCount > 0) {
    return {
      eyebrow,
      href: screenerHref(lang, "strike_zone"),
      line: zh
        ? `${person} 有 ${strikeCount} 只持仓现价落在击球区。`
        : `${person} holds ${strikeCount} position${strikeCount === 1 ? "" : "s"} now in the strike zone.`,
      ctaLabel: zh ? "看全市场击球区清单" : "See the full strike-zone list",
    };
  }
  return {
    eyebrow,
    href: screenerHref(lang, "below"),
    line: zh ? `${person} 当前无持仓落在击球区。` : `${person} has no positions in the strike zone right now.`,
    ctaLabel: zh ? "按价值带浏览全市场" : "Browse the whole market by value band",
  };
}
```

- [ ] **Step 2: 写测试**

`web/src/lib/discovery/discoveryHandoff.check.ts`：

```ts
// 跑法(裸跑, 无需 server-only 桩): cd web && npx tsx src/lib/discovery/discoveryHandoff.check.ts
import { strict as assert } from "node:assert";
import { stockHandoffFor, investorHandoffFor } from "./discoveryHandoff";
import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";

const v = (over: Partial<ValuationVerdict>): ValuationVerdict => ({
  bucket: "below", inStrikeZone: false, rangeLo: 1, rangeHi: 2, price: 1,
  priceDate: "2026-01-01", marginPct: 0.2, coverage: "full", reliable: true, ...over,
});

// 1) 进击球区 → strike_zone 视图, 大写 ticker
let c = stockHandoffFor(v({ inStrikeZone: true }), "aapl", "zh");
assert.equal(c.href, "/zh/stocks/screener?view=strike_zone", "in-zone → strike_zone");
assert.ok(c.line.includes("AAPL"), "ticker uppercased");

// 2) below 非 inStrikeZone → below 视图
c = stockHandoffFor(v({ inStrikeZone: false, bucket: "below" }), "MSFT", "en");
assert.equal(c.href, "/en/stocks/screener?view=below", "below → below view");

// 3) within/above → 邀请看击球区
c = stockHandoffFor(v({ bucket: "above", inStrikeZone: false }), "NVDA", "zh");
assert.equal(c.href, "/zh/stocks/screener?view=strike_zone", "above → strike_zone invite");

// 4) null → 兜底根链接
c = stockHandoffFor(null, "X", "en");
assert.equal(c.href, "/en/stocks/screener", "null → generic");

// 5) 不可信优先于 inStrikeZone → 兜底
c = stockHandoffFor(v({ reliable: false, inStrikeZone: true }), "X", "zh");
assert.equal(c.href, "/zh/stocks/screener", "unreliable → generic (beats in-zone)");

// 6) 投资人 k>0 → strike_zone, 含只数
c = investorHandoffFor(3, "Warren Buffett", "zh");
assert.equal(c.href, "/zh/stocks/screener?view=strike_zone", "k>0 → strike_zone");
assert.ok(c.line.includes("3"), "count shown");

// 7) 投资人 k=0 → below; 英文单复数
c = investorHandoffFor(0, "X", "en");
assert.equal(c.href, "/en/stocks/screener?view=below", "k=0 → below");
c = investorHandoffFor(1, "X", "en");
assert.ok(c.line.includes("1 position ") && !c.line.includes("positions"), "singular position");

console.log("discoveryHandoff.check.ts: all assertions passed");
```

- [ ] **Step 3: 跑测试，确认通过**

Run: `cd web && npx tsx src/lib/discovery/discoveryHandoff.check.ts`
Expected: `discoveryHandoff.check.ts: all assertions passed`

- [ ] **Step 4: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出（exit 0）

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/discovery/discoveryHandoff.ts web/src/lib/discovery/discoveryHandoff.check.ts
git commit -m "feat(discovery): 上下文出口文案纯函数 stock/investorHandoffFor + 测试"
```

---

### Task B: `DiscoveryHandoff` 组件 + 两页接线

**Files:**
- Create: `web/src/components/discovery/DiscoveryHandoff.tsx`
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`（加 import + 派生 verdict + 在 `OwnershipConsensusPanel` 后渲染）
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`（加 import + 算 strikeCount + 在 `StrikeZonePicks` 后渲染）

**Interfaces:**
- Consumes: `DiscoveryCta`, `stockHandoffFor`, `investorHandoffFor`（Task A）；`deriveValuationVerdict` from `@/lib/valuation/deriveValuationVerdict`；个股页既有 `valuationFloor`/`strikeZone`/`oeDcf`/`reconciliation`；投资人页既有 `verdicts: Map<string, SnapshotVerdict>`、`cusipToTicker`、`latest.holdings`、`person`。
- Produces: `function DiscoveryHandoff(props: DiscoveryCta): JSX.Element`（纯展示；文案已在纯函数算好，组件不需 `lang`）。

- [ ] **Step 1: 写组件**

`web/src/components/discovery/DiscoveryHandoff.tsx`：

```tsx
import Link from "next/link";
import type { DiscoveryCta } from "@/lib/discovery/discoveryHandoff";

/** 上下文感知"下一步"出口面板。文案由 discoveryHandoff 纯函数算好, 此处仅展示(RSC)。 */
export function DiscoveryHandoff({ eyebrow, line, href, ctaLabel }: DiscoveryCta) {
  return (
    <section className="mt-6 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 sm:p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{eyebrow}</p>
      <p className="mt-2 text-sm text-[var(--tt-text)]">{line}</p>
      <Link
        href={href}
        className="group mt-3 inline-flex items-center gap-1 font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--tt-muted)] no-underline transition-colors hover:text-[var(--tt-accent)]"
      >
        {ctaLabel}
        <span aria-hidden className="transition-colors group-hover:text-[var(--tt-accent)]">→</span>
      </Link>
    </section>
  );
}
```

- [ ] **Step 2: 个股页接线 — 加 import**

在 `web/src/app/[lang]/stocks/[ticker]/page.tsx` 顶部 import 区加：

```ts
import { deriveValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";
import { stockHandoffFor } from "@/lib/discovery/discoveryHandoff";
import { DiscoveryHandoff } from "@/components/discovery/DiscoveryHandoff";
```

- [ ] **Step 3: 个股页接线 — 派生 verdict**

在 `reconciliation` 计算之后（约 342 行后）加：

```ts
  // 上下文出口用的位置档(与估值卡同源, 永不漂移)。kind!=floor / 红旗 → null → 走兜底文案。
  const handoffVerdict =
    valuationFloor?.kind === "floor"
      ? deriveValuationVerdict({ floor: valuationFloor, strikeZone, oeDcf, reconciliation })
      : null;
```

- [ ] **Step 4: 个股页接线 — 渲染**

在 `OwnershipConsensusPanel` 的闭合标签 `/>` 之后、`HoldersTable` 之前插入：

```tsx
          <DiscoveryHandoff {...stockHandoffFor(handoffVerdict, ticker, lang)} />
```

- [ ] **Step 5: 投资人页接线 — 加 import**

在 `web/src/app/[lang]/investors/[slug]/page.tsx` 顶部 import 区加：

```ts
import { investorHandoffFor } from "@/lib/discovery/discoveryHandoff";
import { DiscoveryHandoff } from "@/components/discovery/DiscoveryHandoff";
```

- [ ] **Step 6: 投资人页接线 — 算 strikeCount**

在 `const verdicts = await readValuationVerdicts(holdingTickers);`（约 291 行）之后加：

```ts
  // 该投资人当前持仓中现价落在击球区的只数(与 screener strike_zone 视图同口径)。
  const strikeCount = latest.holdings.reduce((acc, h) => {
    const tk = cusipToTicker.get(h.cusip);
    return acc + (tk && verdicts.get(tk.toUpperCase())?.inStrikeZone ? 1 : 0);
  }, 0);
```

> 注：`latest.holdings`、`cusipToTicker`、`verdicts`、`person` 均为该页既有变量。若 `person` 的真实变量名不同（如 `manager.person`），用渲染 `<EntityPage>` 时传给标题的同一人名变量。

- [ ] **Step 7: 投资人页接线 — 渲染**

在 `<StrikeZonePicks ... />`（约 483 行）的闭合之后插入：

```tsx
          <DiscoveryHandoff {...investorHandoffFor(strikeCount, person, lang)} />
```

- [ ] **Step 8: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出（exit 0）。若报 `person` 未定义 → 用该页传给 EntityPage 标题的人名变量修正。

- [ ] **Step 9: SSR 验证（出链接）**

Run（需本地 dev 或已部署；本地 dev 需 `npm ci` 装真包后 `npm run dev`）：
```bash
curl -s http://localhost:3000/en/stocks/AAPL | grep -o 'stocks/screener[^"]*' | head
curl -s http://localhost:3000/en/investors/warren-buffett | grep -o 'stocks/screener[^"]*' | head
```
Expected: 各至少一条 `stocks/screener...` 链接出现在 SSR HTML。

- [ ] **Step 10: 提交**

```bash
git add web/src/components/discovery/DiscoveryHandoff.tsx web/src/app/[lang]/stocks/[ticker]/page.tsx web/src/app/[lang]/investors/[slug]/page.tsx
git commit -m "feat(discovery): DiscoveryHandoff 组件 + 个股/投资人页上下文出口接线"
```

---

### Task C: screener 既有 holderCount 列可排序

**Files:**
- Create: `web/src/lib/valuation/screenerSort.ts`
- Test: `web/src/lib/valuation/screenerSort.check.ts`
- Modify: `web/src/app/[lang]/stocks/screener/page.tsx`（解析 `sort` 参数 + 内存排序 + 加切换控件）

**Interfaces:**
- Produces:
  - `type ScreenSort = "margin" | "holders"`
  - `function parseSort(v: string | undefined): ScreenSort`
  - `function sortScreenerRows<T extends { marginPct: number | null; holderCount: number }>(rows: T[], sort: ScreenSort): T[]`
- Consumes: 既有 `readValuationScreen(view, limit)` 返回的 `ScreenerRow[]`（含 `marginPct`、`holderCount`）。

- [ ] **Step 1: 写排序纯函数**

`web/src/lib/valuation/screenerSort.ts`：

```ts
// screener 排序纯函数(无 "server-only", 可裸跑 .check.ts)。默认 margin(查询已按 margin 排, 原样透传);
// holders → 按持有机构数降序, 并列再按安全边际降序("最便宜且共识最强"置顶)。
export type ScreenSort = "margin" | "holders";

export function parseSort(v: string | undefined): ScreenSort {
  return v === "holders" ? "holders" : "margin";
}

export function sortScreenerRows<T extends { marginPct: number | null; holderCount: number }>(
  rows: T[],
  sort: ScreenSort,
): T[] {
  if (sort !== "holders") return rows;
  return [...rows].sort(
    (a, b) => b.holderCount - a.holderCount || (b.marginPct ?? -Infinity) - (a.marginPct ?? -Infinity),
  );
}
```

- [ ] **Step 2: 写测试**

`web/src/lib/valuation/screenerSort.check.ts`：

```ts
// 跑法(裸跑): cd web && npx tsx src/lib/valuation/screenerSort.check.ts
import { strict as assert } from "node:assert";
import { parseSort, sortScreenerRows } from "./screenerSort";

assert.equal(parseSort("holders"), "holders", "holders parsed");
assert.equal(parseSort("margin"), "margin", "margin parsed");
assert.equal(parseSort(undefined), "margin", "default margin");
assert.equal(parseSort("garbage"), "margin", "invalid → margin");

const rows = [
  { ticker: "A", marginPct: 0.5, holderCount: 2 },
  { ticker: "B", marginPct: 0.1, holderCount: 9 },
  { ticker: "C", marginPct: 0.3, holderCount: 9 },
];

// margin: 原样透传(不重排)
assert.deepEqual(sortScreenerRows(rows, "margin").map((r) => r.ticker), ["A", "B", "C"], "margin passthrough");

// holders: 9 在前, 9 并列里 margin 0.3 > 0.1 → C 在 B 前
assert.deepEqual(sortScreenerRows(rows, "holders").map((r) => r.ticker), ["C", "B", "A"], "holders desc, margin tiebreak");

// 不可变: 原数组未动
assert.equal(rows[0].ticker, "A", "input not mutated");

console.log("screenerSort.check.ts: all assertions passed");
```

- [ ] **Step 3: 跑测试**

Run: `cd web && npx tsx src/lib/valuation/screenerSort.check.ts`
Expected: `screenerSort.check.ts: all assertions passed`

- [ ] **Step 4: screener 页接线 — import + searchParams 类型**

在 `web/src/app/[lang]/stocks/screener/page.tsx`：

加 import：
```ts
import { parseSort, sortScreenerRows, type ScreenSort } from "@/lib/valuation/screenerSort";
```

把 `searchParams` 类型从 `Promise<{ view?: string }>` 改为：
```ts
  searchParams: Promise<{ view?: string; sort?: string }>;
```

- [ ] **Step 5: screener 页接线 — 解析 + 排序**

把 `const { view: rawView } = await searchParams;` 一行改为：
```ts
  const { view: rawView, sort: rawSort } = await searchParams;
```
在 `const view = parseView(rawView);` 之后加：
```ts
  const sort = parseSort(rawSort);
```
把 `const { rows, strikeTotal, computedAt } = await readValuationScreen(view, SCREEN_LIMIT);` 之后加一行重排：
```ts
  const sortedRows = sortScreenerRows(rows, sort);
```
并把传给表格的 `<ScreenerTable lang={lang} rows={rows} />` 改为 `rows={sortedRows}`。

- [ ] **Step 6: screener 页接线 — 排序切换控件**

在视图分段控件 `<nav ... aria-label={isZh ? "视图" : "Views"}>...</nav>` 之后、合规免责 `<p>` 之前，插入排序切换（纯 Link、零 JS、同款样式）：

```tsx
      <nav className="mb-5 flex flex-wrap items-center gap-2" aria-label={isZh ? "排序" : "Sort"}>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">{isZh ? "排序" : "Sort"}</span>
        {([
          { key: "margin", zh: "按安全边际", en: "By margin" },
          { key: "holders", zh: "按持有机构", en: "By holders" },
        ] as { key: ScreenSort; zh: string; en: string }[]).map((s) => {
          const activeSort = s.key === sort;
          const sp = new URLSearchParams();
          if (view !== "all") sp.set("view", view);
          if (s.key === "holders") sp.set("sort", "holders");
          const qs = sp.toString();
          return (
            <Link
              key={s.key}
              href={`/${lang}/stocks/screener${qs ? `?${qs}` : ""}`}
              aria-current={activeSort ? "page" : undefined}
              className={`rounded-sm border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] no-underline transition-colors ${
                activeSort
                  ? "border-[var(--tt-text)] text-[var(--tt-text)]"
                  : "border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-accent)]"
              }`}
            >
              {isZh ? s.zh : s.en}
            </Link>
          );
        })}
      </nav>
```

- [ ] **Step 7: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出（exit 0）

- [ ] **Step 8: SSR + 排序验证**

Run（dev 或部署）：
```bash
curl -s "http://localhost:3000/en/stocks/screener?view=strike_zone&sort=holders" | grep -o 'By holders' | head
```
Expected: `By holders` 切换出现；人工看 strike_zone + holders 排序下持有机构多者在前。

- [ ] **Step 9: 提交**

```bash
git add web/src/lib/valuation/screenerSort.ts web/src/lib/valuation/screenerSort.check.ts web/src/app/[lang]/stocks/screener/page.tsx
git commit -m "feat(screener): holderCount 列可排序(?sort=holders) + 排序切换控件"
```

---

## 最终验证（全部任务后）

- [ ] `cd web && npx tsx src/lib/discovery/discoveryHandoff.check.ts` → passed
- [ ] `cd web && npx tsx src/lib/valuation/screenerSort.check.ts` → passed
- [ ] `cd web && npx tsc --noEmit` → exit 0
- [ ] 人工 QA：个股页（进区/低于/带内/无估值四种票）、投资人页（k>0 / k=0）、screener（margin/holders 切换 × strike_zone/below/all），dark/light + 390/768/1280 三宽度，文案纯单语言、无 buy/sell 措辞。

## Self-Review 结论

- **Spec 覆盖**：① 个股出口=Task B Step 2-4；① 投资人出口=Task B Step 5-7；① 文案映射=Task A；② 可排序=Task C；降级=Task A 兜底档 + `handoffVerdict` null 路径；设计语言=Task B Step 1 面板；测试=各 Task 的 .check.ts + 最终验证。无遗漏。
- **占位符**：无 TBD/TODO；每个代码步给出完整代码。
- **类型一致**：`DiscoveryCta`/`stockHandoffFor`/`investorHandoffFor`（A↔B）、`ScreenSort`/`parseSort`/`sortScreenerRows`（C 内）签名前后一致；`ValuationVerdict` 形状取自真实导出。
- **已知不确定点**：投资人页 `person` 变量名以执行期 tsc 为准（Step 6/8 已注明回退）；本机无法 `next build`（已说明用 tsc + curl 替代）。
