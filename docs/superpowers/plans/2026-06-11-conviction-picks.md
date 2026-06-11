# 信念精选 / Conviction Picks 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在投资人详情页（`/[lang]/investors/[slug]`）的持仓表之前新增「高信念持仓」精选区块：从 `ManagerDetail.filings[]`（最多 8 季）推导最多 3 个最具信念特征的持仓，每卡 = 标的名 + 信念标签 chip + 纯 SVG 迷你趋势线 + 确定性双语理由，整卡可点进个股页并打点 `conviction_card_click`。

**Architecture:** 三个新文件 + 一处接线。①纯函数推导层 `conviction.ts`（无 IO、无 Date.now，确定性）；②通用 client 原语 `TrackedLink`（仅有的客户端 JS，onClick 容错打点后正常跳转）；③服务端组件 `ConvictionPicks`（静态渲进 HTML，零 hydration，sparkline 是内联 `<svg><polyline>`）。页面只加 ~5 行：`deriveConviction(d.filings)` + 条件渲染。

**Tech Stack:** Next.js App Router（改版，写代码前必读 `node_modules/next/dist/docs/`）、React Server Components、`@vercel/analytics` 的 `track()`、Tailwind + `--tt-*` design tokens。

**Spec（唯一事实源）:** `docs/superpowers/specs/2026-06-11-conviction-picks-design.md`

**硬约束（违反即返工）:**
- 纯加法：不动数据层、不动 `getManagerDetail`、不动 `EntityPage` 其他槽、不动 `HoldingsTable`。
- 不引图表库。理由文案用确定性模板，不走 AI。
- 本项目无测试/无 TDD（solo dev 约定）。每步验证 = `npx tsc --noEmit` + `npm run build` + 人工看页面。
- 工作目录：worktree `.claude/worktrees/conviction-picks`，分支 `feat/conviction-picks`，默认分支是 `db-foundation`。

---

### Task 0: 环境准备

**Files:** 无代码改动。

- [ ] **Step 1: 进入 worktree 并确认分支**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/conviction-picks
git status && git log --oneline -1
```

Expected: 分支 `feat/conviction-picks`，HEAD 为 `spec(conviction-picks)` commit，工作区干净。

- [ ] **Step 2: 安装依赖（worktree 内 `web/node_modules` 缺失，tsc/build 都需要）**

```bash
cd web && npm install
```

Expected: 安装成功，`web/node_modules/next/dist/docs/` 出现。

- [ ] **Step 3: 读改版 Next 文档（项目硬约定，别凭训练记忆）**

阅读（在 worktree 的 `web/node_modules/next/dist/docs/` 下）：
- `01-app/03-api-reference/02-components/link.md`（Task 2 用 `<Link>`）
- `01-getting-started/` 中 server/client components 组合相关章节（client 组件接收服务端 children 的模式，Task 2/3 的 RSC 边界）

若文档与本计划代码有出入，**以文档为准**并相应调整。

- [ ] **Step 4: 基线验证（确认起点是绿的）**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 错误。

---

### Task 1: 推导层 `conviction.ts`（纯函数）

**Files:**
- Create: `web/src/lib/managers/conviction.ts`

口径 = 持股数 `shares`（spec §3）。输入 `filings[]` 按 period **降序**（`[0]`=最新，见 `types.ts` 的 `ManagerDetail` 注释）；内部反转为时间**升序**构建序列，未持有季 = 0。

- [ ] **Step 1: 写 `web/src/lib/managers/conviction.ts`**

```ts
import type { FilingData } from "./types";

export type ConvictionSignal =
  | "accumulating"
  | "fresh_conviction"
  | "long_core"
  | "never_trimmed";

export type ConvictionPick = {
  cusip: string;
  issuer: string;
  signal: ConvictionSignal; // 最强适用的那一档（优先级见下）
  quartersHeld: number;     // 末尾连续持有季数（到最新季为止）
  series: number[];         // 按时间升序的每季持股数；未持有季=0
  latestWeight: number | null; // 最新季权重（排序/文案用，缺失=null）
  addStreak: number;        // 末尾连续加仓季数（accumulating 文案用）
};

// 阈值具名常量，便于日后调（spec §3.2）
const MIN_ADD_STREAK = 3;        // accumulating: 末尾连续严格递增 ≥3 季
const FRESH_MIN_WEIGHT = 0.03;   // fresh_conviction: 最新季权重 ≥3%
const LONG_CORE_MIN_QUARTERS = 6; // long_core: 连续持有 ≥6 季
const LONG_CORE_TOP_N = 5;       // long_core: 最新季权重排组合前 5
const NEVER_TRIM_MIN_QUARTERS = 4; // never_trimmed: 连续持有 ≥4 季

// 信号优先级（1 最强）。排序与"取最强档"都用它。
const PRIORITY: Record<ConvictionSignal, number> = {
  accumulating: 1,
  fresh_conviction: 2,
  long_core: 3,
  never_trimmed: 4,
};

/**
 * 从 filings[]（按 period 降序，[0]=最新）推导信念精选。
 * 已排序（信号优先级 → latestWeight 降序，null 垫底）、已截断至 limit。命中 0 → []。
 * 确定性纯函数：无 IO / 无 Date.now / 无随机，ISR 静态渲染下输出稳定。
 */
export function deriveConviction(filings: FilingData[], limit = 3): ConvictionPick[] {
  if (filings.length === 0) return [];

  // 时间升序（filings 是降序）；防御性按 period 排一次，不依赖入参顺序
  const asc = [...filings].sort((a, b) => (a.period > b.period ? 1 : -1));
  const latest = asc[asc.length - 1];

  // 每证券（按 cusip 归并；13F 同券可多行/子账户，shares 求和）的升序持股序列
  const byCusip = new Map<string, { issuer: string; series: number[] }>();
  asc.forEach((f, qi) => {
    for (const h of f.holdings) {
      let e = byCusip.get(h.cusip);
      if (!e) {
        e = { issuer: h.issuer, series: new Array(asc.length).fill(0) };
        byCusip.set(h.cusip, e);
      }
      e.issuer = h.issuer; // 以较新季的 issuer 名为准
      e.series[qi] += h.shares;
    }
  });

  // 最新季每证券权重（多行求和）与权重排名（long_core 用）
  const weightByCusip = new Map<string, number>();
  for (const h of latest.holdings) {
    if (h.weight != null) weightByCusip.set(h.cusip, (weightByCusip.get(h.cusip) ?? 0) + h.weight);
  }
  const topNCusips = new Set(
    [...weightByCusip.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, LONG_CORE_TOP_N)
      .map(([cusip]) => cusip),
  );

  const picks: ConvictionPick[] = [];
  for (const [cusip, { issuer, series }] of byCusip) {
    const last = series.length - 1;
    if (series[last] <= 0) continue; // 必须当前持有

    // quartersHeld: 末尾连续非零段长度
    let quartersHeld = 0;
    for (let i = last; i >= 0 && series[i] > 0; i--) quartersHeld++;

    // addStreak: 末尾连续严格递增步数（含从 0 新建后持续加）
    let addStreak = 0;
    for (let i = last; i >= 1 && series[i] > series[i - 1]; i--) addStreak++;

    // never_trimmed: 持有窗口内（末尾非零段，含从 0 起跳那步之后）无任何一季减少
    const heldStart = last - quartersHeld + 1;
    let trimmed = false;
    for (let i = heldStart + 1; i <= last; i++) {
      if (series[i] < series[i - 1]) { trimmed = true; break; }
    }

    const latestWeight = weightByCusip.get(cusip) ?? null;

    // 取最强适用档（spec §3.3：不堆标签）
    let signal: ConvictionSignal | null = null;
    if (addStreak >= MIN_ADD_STREAK) {
      signal = "accumulating";
    } else if (last >= 1 && series[last] > series[last - 1] && latestWeight != null && latestWeight >= FRESH_MIN_WEIGHT) {
      signal = "fresh_conviction";
    } else if (quartersHeld >= LONG_CORE_MIN_QUARTERS && topNCusips.has(cusip)) {
      signal = "long_core";
    } else if (quartersHeld >= NEVER_TRIM_MIN_QUARTERS && !trimmed) {
      signal = "never_trimmed";
    }
    if (!signal) continue;

    picks.push({ cusip, issuer, signal, quartersHeld, series, latestWeight, addStreak });
  }

  // 排序：信号优先级（1→4），同档按 latestWeight 降序（null 垫底）；截断
  picks.sort((a, b) => {
    const p = PRIORITY[a.signal] - PRIORITY[b.signal];
    if (p !== 0) return p;
    return (b.latestWeight ?? -1) - (a.latestWeight ?? -1);
  });
  return picks.slice(0, limit);
}
```

要点核对（写完自查）：
- `filings.length < N` 时强信号自然不触发（序列只用已有季）→ 短历史降级是预期（spec §3.3）。
- `fresh_conviction` 需要 ≥2 季（`last >= 1`），单季基金不触发。
- 多档命中只取最强（if/else 链即优先级）。

- [ ] **Step 2: 类型检查**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 错误。

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/managers/conviction.ts
git commit -m "feat(conviction): deriveConviction 纯函数推导层(4档信号/shares口径)"
```

---

### Task 2: 通用 client 原语 `TrackedLink`

**Files:**
- Create: `web/src/components/common/TrackedLink.tsx`

打点容错写法仿 `web/src/components/share/ShareButton.tsx` 的 `fire()`：`try/catch` 包 `track()`，被 adblock 拦截绝不阻断跳转。client 组件接收服务端渲染的 `children`（RSC 组合，children 仍在服务端渲染）。

- [ ] **Step 1: 写 `web/src/components/common/TrackedLink.tsx`**

```tsx
"use client";

import React from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";

/**
 * 可打点的内链原语：onClick fire-and-forget track() 后正常导航。
 * 打点容错（adblock 拦截/抛错绝不阻断跳转）。children 由调用方（服务端）渲染，
 * 本组件仅是可点壳层 → client JS 仅几行。组件无业务知识，payload 原样透传。
 */
export function TrackedLink({
  href,
  event,
  payload,
  className,
  children,
}: {
  href: string;
  event: string;
  payload?: Record<string, string>;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const onClick = () => {
    try {
      track(event, payload ?? {});
    } catch {
      /* analytics blocked — ignore */
    }
  };
  return (
    <Link href={href} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
```

- [ ] **Step 2: 类型检查**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 错误。

- [ ] **Step 3: Commit**

```bash
git add web/src/components/common/TrackedLink.tsx
git commit -m "feat(common): TrackedLink 通用可打点内链原语(client壳+RSC children)"
```

---

### Task 3: 服务端组件 `ConvictionPicks`

**Files:**
- Create: `web/src/components/entity/ConvictionPicks.tsx`

服务端组件（**无** `"use client"`）：sparkline 是静态 SVG、文案是确定性模板 → 全部渲进 HTML，零 hydration（spec §4.1）。`COPY={zh,en}` 内联惯例与现页一致（参照 `page.tsx` 的 `HOLD_COPY`）。哑组件：不调数据层，picks/cusipToTicker 全由调用方传入。

- [ ] **Step 1: 写 `web/src/components/entity/ConvictionPicks.tsx`**

```tsx
import React from "react";
import type { ConvictionPick, ConvictionSignal } from "@/lib/managers/conviction";
import type { Lang } from "@/lib/nav";
import { stockPath } from "@/lib/urls";
import { EntityName } from "@/components/common/EntityName";
import { TrackedLink } from "@/components/common/TrackedLink";

const COPY = {
  zh: {
    title: "高信念持仓",
    chip: {
      accumulating: (p: ConvictionPick) => `连续加仓·${p.addStreak}季`,
      fresh_conviction: () => "重磅新建/加仓",
      long_core: (p: ConvictionPick) => `长期重仓·${p.quartersHeld}季`,
      never_trimmed: (p: ConvictionPick) => `从不减仓·${p.quartersHeld}季`,
    },
    reason: {
      accumulating: (p: ConvictionPick) => `连续 ${p.addStreak} 个季度增持。`,
      fresh_conviction: (p: ConvictionPick) =>
        `最新季重仓${p.quartersHeld <= 1 ? "新建" : "加仓"}，占组合 ${fmtWeight(p.latestWeight)}。`,
      long_core: (p: ConvictionPick) => `连续持有 ${p.quartersHeld} 季的核心仓位。`,
      never_trimmed: (p: ConvictionPick) => `持有 ${p.quartersHeld} 季，从未减持。`,
    },
  },
  en: {
    title: "High-conviction",
    chip: {
      accumulating: (p: ConvictionPick) => `Adding · ${p.addStreak}q`,
      fresh_conviction: () => "Big new buy",
      long_core: (p: ConvictionPick) => `Core · ${p.quartersHeld}q`,
      never_trimmed: (p: ConvictionPick) => `Never trimmed · ${p.quartersHeld}q`,
    },
    reason: {
      accumulating: (p: ConvictionPick) => `Added for ${p.addStreak} straight quarters.`,
      fresh_conviction: (p: ConvictionPick) =>
        `Big ${p.quartersHeld <= 1 ? "new buy" : "add"} last quarter — ${fmtWeight(p.latestWeight)} of the book.`,
      long_core: (p: ConvictionPick) => `A core position held ${p.quartersHeld} quarters running.`,
      never_trimmed: (p: ConvictionPick) => `Held ${p.quartersHeld} quarters, never sold a share.`,
    },
  },
} as const;

// 线色/chip 色随信号：加仓正色、新建强调色、长期信息色、其余中性（spec §4.3）
const SIGNAL_COLOR: Record<ConvictionSignal, string> = {
  accumulating: "var(--tt-positive)",
  fresh_conviction: "var(--tt-accent)",
  long_core: "var(--tt-muted)",
  never_trimmed: "var(--tt-faint)",
};

const fmtWeight = (w: number | null): string => (w != null ? `${(w * 100).toFixed(1)}%` : "—");

/** 纯内联 SVG sparkline：X=季序(升序)，Y=按该证券自己的 [min,max] 归一化；未持有季=0。 */
function Sparkline({ series, color }: { series: number[]; color: string }): React.ReactElement {
  const W = 120;
  const H = 28;
  const PAD = 2;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1; // 全平序列 → 画一条水平线
  const step = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;
  const points = series
    .map((v, i) => {
      const x = PAD + i * step;
      const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 「高信念持仓」精选区块（服务端组件：静态 SVG + 确定性文案全部渲进 HTML，零 client JS）。
 * picks 空 → null（区块整体不渲染，无空状态占位）。
 */
export function ConvictionPicks({
  picks,
  lang,
  investor,
  cusipToTicker,
}: {
  picks: ConvictionPick[];
  lang: Lang;
  investor: string; // manager slug，仅用于打点 payload（组件无其他业务知识）
  cusipToTicker: Map<string, string>; // 页面已算好，传入复用，不重算
}): React.ReactElement | null {
  if (picks.length === 0) return null;
  const t = COPY[lang];
  return (
    <section>
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.title}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((p) => {
          const ticker = cusipToTicker.get(p.cusip) ?? p.cusip;
          const color = SIGNAL_COLOR[p.signal];
          return (
            <TrackedLink
              key={p.cusip}
              href={stockPath(lang, ticker)}
              event="conviction_card_click"
              payload={{ investor, ticker, signal: p.signal, lang }}
              className="block rounded-lg border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4 no-underline transition-colors hover:border-[var(--tt-accent)]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-[var(--tt-text)]">
                  <EntityName issuer={p.issuer} ticker={cusipToTicker.get(p.cusip)} />
                </span>
                <span
                  className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]"
                  style={{ color, borderColor: color }}
                >
                  {t.chip[p.signal](p)}
                </span>
              </div>
              <div className="mt-3">
                <Sparkline series={p.series} color={color} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--tt-muted)]">{t.reason[p.signal](p)}</p>
            </TrackedLink>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 类型检查**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 错误。

- [ ] **Step 3: Commit**

```bash
git add web/src/components/entity/ConvictionPicks.tsx
git commit -m "feat(entity): ConvictionPicks 服务端区块(chip+SVG sparkline+确定性双语理由)"
```

---

### Task 4: 页面接线 `page.tsx`

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`（约 5 行：2 个 import + 1 行推导 + 条件渲染）

约束：不重复调 `getManagerDetail`（页面已有 `const d = await getManagerDetail(slug)`，`d` 解构于 ~265 行）；复用已算好的 `cusipToTicker`（~271 行）；插在 `<HoldingsTable>` 之前（`<EntityPage>` children 内，~444 行）；不动其他槽。

- [ ] **Step 1: 加 import（与现有 import 区块并列）**

```tsx
import { deriveConviction } from "@/lib/managers/conviction";
import { ConvictionPicks } from "@/components/entity/ConvictionPicks";
```

- [ ] **Step 2: 在 `cusipToTicker` 构建之后（约 274 行后）加一行推导**

```tsx
// 信念精选：复用已加载的 d.filings，零新增 IO（spec §5）
const picks = deriveConviction(d.filings);
```

- [ ] **Step 3: 在 `<EntityPage>` children 内、`<HoldingsTable …>` 之前插入条件渲染**

```tsx
      >
        {picks.length > 0 && (
          <ConvictionPicks picks={picks} lang={lang} investor={slug} cusipToTicker={cusipToTicker} />
        )}
        <HoldingsTable holdings={latest.holdings} prior={prior} changes={changes} lang={lang} cusipToTicker={cusipToTicker} />
      </EntityPage>
```

注意：`EntityPage` 的 children 现在是两个节点——若 `EntityPage` 的 children 类型只收单节点导致 tsc 报错，用 `<>…</>` Fragment 包裹两者，**不改 EntityPage 本身**。

- [ ] **Step 4: 类型检查 + 构建**

```bash
cd web && npx tsc --noEmit && npm run build
```

Expected: tsc 0 错；build 通过，投资人页静态预渲染（`generateStaticParams`）不报错。

- [ ] **Step 5: Commit**

```bash
git add web/src/app/[lang]/investors/[slug]/page.tsx
git commit -m "feat(investors): 投资人页接线信念精选区块(HoldingsTable 之前)"
```

---

### Task 5: 人工验证（spec §9）

**Files:** 无代码改动（发现问题则回到对应 Task 修）。

- [ ] **Step 1: 起 dev server 并逐项核验**

```bash
cd web && npm run dev
```

核验清单：
1. 选一个 8 季齐全的基金（如 `/zh/investors/berkshire`）→ 区块出现在持仓表之前，最多 3 卡；标签档位、sparkline 走势、理由数字与持仓数据一致（抽 1 卡对照持仓表 shares 序列）。
2. 卡片点击 → 跳到对应个股页；DevTools Network 可见 analytics 请求（本地可能不发 Vercel analytics，不强求；至少确认点击不被打点逻辑阻断）。
3. 选一个仅 2 季的基金 → 区块整体不显示（无空占位）。
4. `/en/investors/berkshire` → 英文标题「High-conviction」、英文 chip/理由文案正确。
5. 查看页面源码（view-source）→ sparkline SVG 与理由文案在静态 HTML 里（SEO/GEO 要求，spec §4.1）。

- [ ] **Step 2: 收尾**

全部通过后，分支即就绪（合并方式按 superpowers:finishing-a-development-branch 走，目标分支 `db-foundation`）。

---

## 自查记录（写计划时已核）

- spec 覆盖：§3 推导（Task 1）、§4.1-4.3 组件与 RSC 边界（Task 2/3）、§5 接线（Task 4）、§6 打点 `conviction_card_click { investor, ticker, signal, lang }`（Task 3 payload + Task 4 传 `investor={slug}`）、§9 验证（各 Task 的 tsc/build + Task 5 人工）。§7 边界（拆股不复权、2 季基金不显）为已知行为，无任务。
- 类型一致性：`ConvictionPick`/`ConvictionSignal` 在 Task 1 定义，Task 3/4 引用同名；`ConvictionPicks` props 为 `{ picks, lang, investor, cusipToTicker }`（Task 3 注意事项已统一，Task 4 调用一致）。
- 无 TDD：按项目约定，每步验证为 tsc/build/人工。
