# 超级投资者 列表页 + 详情页 重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/investors` 列表页重做为可扫描的榜单（序号+真筛选栏+本季动作快筛），把 `/investors/[slug]` 详情页重做为持仓优先（权重条+行内信号+折叠正文），PC 与 H5 双端过。

**Architecture:** 详情页把 body 五段收敛为「持仓表(主角) → 折叠正文 → 单一出口面板」；两个"精选"段（高信念/击球区）撤销为独立段落，逻辑并入一个纯函数 `deriveRowSignals`，以行内徽章形式挂到持仓表行上；持仓表权重列加纯 CSS 权重条。列表页在既有 `InvestorListClient`（客户端）内加序号、筛选栏计数、本季动作快筛、44px 触控，并去掉顶部"线—标题—线"三明治。全部复用既有基元（DataTable/KeyFacts/EntityPage），不引新库。

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript, Tailwind v4 + `--tt-*` 令牌, 既有 DataTable/EntityPage/KeyFacts 基元。

## Global Constraints

- **回复/文档正文一律中文**（代码/className/命令/既定术语/路径除外）。
- **去 AI 感 / 强产品感**：禁破折号抒情/对偶/三元枚举/对冲词/SaaS 样板（"Get started"/"Browse free"）；禁装饰图标堆；真数据当主角，任何"图形"由真数据生成，无纯装饰；每句带具体名词或数字。
- **令牌只用 `--tt-*`**；Fraunces（`font-display`）+ mono；绿色 accent 克制；不引 shadcn Card；复用既有基元。
- **SEO 红线**：详情页确定性正文（`InvestorProfileProse`）**不得删除**；折叠必须服务端渲染全文、爬虫可读（`<details>` 原生，全文在 HTML 内）。
- **路由**：链接一律走 `localePath`/`stockPath`/`investorPath` helper，禁硬编码 `/${lang}/`（base 已是裸 URL）。
- **响应式**：PC（`max-w-5xl` 单列）+ H5（AppShell 移动头）双端；H5 无横向溢出、触控目标 ≥44px、卡片不挤。DataTable 复用"表↔卡"断点。
- **无测试项目**：验证门 = `npx tsc --noEmit`（在 `web/` 下）= 0 + grep 断言。本地 `next dev` 跑不了（Google Fonts + Supabase 硬依赖）；权重条渲染/折叠/快筛/H5 卡片的真机验收在 Vercel preview。
- **分支**：`feat/investor-pages-redesign`（off `db-foundation`）。频繁提交。

---

### Task 1: 行信号推导 util `deriveRowSignals`

把"高信念"（`deriveConviction`）与"击球区/便宜"（`SnapshotVerdict.inStrikeZone`）两类信号，按持仓 cusip 归并成一个 Map，供持仓表行内徽章消费。纯函数、零 IO。

**Files:**
- Create: `web/src/lib/managers/rowSignals.ts`

**Interfaces:**
- Consumes:
  - `deriveConviction(filings: FilingData[], limit?: number): ConvictionPick[]`（`web/src/lib/managers/conviction.ts`），`ConvictionPick` 有 `{ cusip, issuer, signal, quartersHeld, addStreak, latestWeight }`，`ConvictionSignal = "accumulating" | "fresh_conviction" | "long_core" | "never_trimmed"`。
  - `SnapshotVerdict`（`web/src/lib/valuation/valuationSnapshot.ts`）有 `{ inStrikeZone: boolean; marginPct: number | null }`。
  - `Lang`（`web/src/lib/nav`）。
- Produces:
  - `type RowSignal = { conviction?: { label: string; signal: ConvictionSignal }; cheap?: { marginPct: number | null } }`
  - `function deriveRowSignals(args: { filings: FilingData[]; verdicts: Map<string, SnapshotVerdict>; cusipToTicker: Map<string, string>; lang: Lang; convictionLimit?: number }): Map<string, RowSignal>`（**key = cusip**）

- [ ] **Step 1: 写 util**

```ts
// web/src/lib/managers/rowSignals.ts
import type { FilingData } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import { deriveConviction, type ConvictionSignal } from "@/lib/managers/conviction";

export type RowSignal = {
  conviction?: { label: string; signal: ConvictionSignal };
  cheap?: { marginPct: number | null };
};

// 行内信念徽章短标签(比 ConvictionPicks 卡片更短; 单行不换行)。
const CONV_LABEL: Record<Lang, Record<ConvictionSignal, (q: number, s: number) => string>> = {
  zh: {
    accumulating: (_q, s) => `连续加仓·${s}季`,
    fresh_conviction: () => "重磅新建",
    long_core: (q) => `长期核心·${q}季`,
    never_trimmed: (q) => `从不减仓·${q}季`,
  },
  en: {
    accumulating: (_q, s) => `Adding ${s}q`,
    fresh_conviction: () => "Big new buy",
    long_core: (q) => `Core ${q}q`,
    never_trimmed: (q) => `Never trimmed`,
  },
};

/**
 * 按 cusip 归并两类行内信号(高信念 + 便宜/击球区)。key = cusip。
 * convictionLimit 放宽到 12(默认): 内联徽章覆盖面比原 3 张卡片宽,但仍只标"够格"的。
 */
export function deriveRowSignals({
  filings,
  verdicts,
  cusipToTicker,
  lang,
  convictionLimit = 12,
}: {
  filings: FilingData[];
  verdicts: Map<string, SnapshotVerdict>;
  cusipToTicker: Map<string, string>;
  lang: Lang;
  convictionLimit?: number;
}): Map<string, RowSignal> {
  const out = new Map<string, RowSignal>();

  // 信念
  const picks = deriveConviction(filings, convictionLimit);
  for (const p of picks) {
    const label = CONV_LABEL[lang][p.signal](p.quartersHeld, p.addStreak);
    out.set(p.cusip, { ...(out.get(p.cusip) ?? {}), conviction: { label, signal: p.signal } });
  }

  // 便宜(击球区): 遍历有 verdict 的 cusip
  for (const [cusip, ticker] of cusipToTicker) {
    const v = verdicts.get(ticker.toUpperCase());
    if (v?.inStrikeZone) {
      out.set(cusip, { ...(out.get(cusip) ?? {}), cheap: { marginPct: v.marginPct } });
    }
  }

  return out;
}
```

- [ ] **Step 2: 类型门**

Run: `cd web && npx tsc --noEmit`
Expected: 0 报错。

- [ ] **Step 3: grep 断言**

Run: `cd web && grep -c "export function deriveRowSignals" src/lib/managers/rowSignals.ts`
Expected: `1`。

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/managers/rowSignals.ts
git commit -m "feat(investors): deriveRowSignals — 合并高信念+击球区为行内信号(按cusip)"
```

---

### Task 2: 权重条组件 `WeightBar`（纯 CSS，零 JS）

**Files:**
- Create: `web/src/components/investor/WeightBar.tsx`

**Interfaces:**
- Produces: `function WeightBar({ weight, tone }: { weight: number | null; tone?: "accent" | "muted" }): React.ReactElement`
  - `weight` 为组合权重小数（如 0.084 = 8.4%）。渲染横条（宽=权重%）+ mono 百分数。

- [ ] **Step 1: 写组件**

```tsx
// web/src/components/investor/WeightBar.tsx
import React from "react";

// 组合权重横条(RSC, 纯 CSS): 宽度=权重%, 无装饰、无 JS。真数据即图形。
// weight 为小数(0.084=8.4%)。缺失/<=0 → 条为空, 百分数显 "—"。
export function WeightBar({
  weight,
  tone = "accent",
}: {
  weight: number | null;
  tone?: "accent" | "muted";
}): React.ReactElement {
  const has = weight != null && weight > 0;
  const pct = has ? Math.min(100, weight * 100) : 0;
  const color = tone === "accent" ? "var(--tt-accent)" : "var(--tt-muted)";
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span
        aria-hidden
        className="relative hidden h-1 w-14 overflow-hidden rounded-full bg-[var(--tt-border)] sm:block"
      >
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="font-mono text-xs tabular-nums text-[var(--tt-muted)]">
        {has ? `${pct.toFixed(1)}%` : "—"}
      </span>
    </span>
  );
}
```

- [ ] **Step 2: 类型门**

Run: `cd web && npx tsc --noEmit`
Expected: 0 报错。

- [ ] **Step 3: grep 断言**

Run: `cd web && grep -c "export function WeightBar" src/components/investor/WeightBar.tsx`
Expected: `1`。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/investor/WeightBar.tsx
git commit -m "feat(investors): WeightBar — 纯CSS组合权重横条"
```

---

### Task 3: 持仓表强化（权重条 + 行内信号徽章）

改 `web/src/app/[lang]/investors/[slug]/page.tsx` 里的 `HoldingsTable`：`weight` 列改用 `WeightBar` 呈现（保留既有 `WeightQoQ` 的方向语义在 tooltip/副行或替换见下），新增一个**信号列**（`role: "trail"` → H5 收进卡片 trail），显示便宜/信念徽章。

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`（`HOLD_COPY` + `HoldingsTable` 函数 + 其调用处新增 `rowSignals` 入参）

**Interfaces:**
- Consumes: `RowSignal`/`deriveRowSignals`（Task 1），`WeightBar`（Task 2），既有 `Column`/`DataTable`、`WeightQoQ`。
- Produces: `HoldingsTable` 新增必填 prop `rowSignals: Map<string, RowSignal>`。

- [ ] **Step 1: 导入 + COPY 加信号列头**

在 `page.tsx` 顶部 import 区加：
```ts
import { WeightBar } from "@/components/investor/WeightBar";
import { deriveRowSignals, type RowSignal } from "@/lib/managers/rowSignals";
```
`HOLD_COPY.zh.cols` 加 `signal: "信号"`；`HOLD_COPY.en.cols` 加 `signal: "Signal"`。

- [ ] **Step 2: `HoldingsTable` 签名加 `rowSignals`**

把 `HoldingsTable({ holdings, prior, changes, lang, cusipToTicker, verdicts, holderCounts })` 的入参类型加一行 `rowSignals: Map<string, RowSignal>;`，解构里加 `rowSignals`。

- [ ] **Step 3: weight 列换 WeightBar；新增 signal trail 列**

把原 `weight` 列的 `cell` 改为：
```tsx
cell: (h) => <WeightBar weight={h.weight} />,
```
（列 `header` 改为 `t.cols.weight` 语义可留"权重"；去掉"(上季→本季)"括注，方向变化由 signal 列/涨跌色承载。）

在 `columns` 数组**末尾**追加信号列：
```tsx
{
  key: "signal",
  header: t.cols.signal,
  align: "right",
  width: "w-40",
  role: "trail",
  cell: (h) => {
    const s = rowSignals.get(h.cusip);
    if (!s) return <span className="text-[var(--tt-faint)]">—</span>;
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
        {s.cheap && (
          <span className="rounded-sm border border-[var(--tt-positive)]/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-positive)]">
            {lang === "zh" ? "便宜" : "Cheap"}
            {s.cheap.marginPct != null && s.cheap.marginPct > 0 ? ` −${Math.round(s.cheap.marginPct * 100)}%` : ""}
          </span>
        )}
        {s.conviction && (
          <span className="rounded-sm border border-[var(--tt-border)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-muted)]">
            {s.conviction.label}
          </span>
        )}
      </span>
    );
  },
},
```
说明：`role: "trail"` → 桌面为独立右列；H5 由 DataTable 收进卡片标题右侧 trail 位（既有机制），不撑爆小屏。

- [ ] **Step 4: 保留 `WeightQoQ` 方向 or 移除**

若 `WeightQoQ` 导入在改后不再使用，删除其 import（避免未用告警）。方向变化已由 signal 列 + value 涨跌语义覆盖（本任务不再单列 QoQ 方向）。

- [ ] **Step 5: 调用处传 rowSignals**

在 `InvestorSlugPage` body 里，`HoldingsTable` 调用改为传入 `rowSignals`（Task 4 会在 page 计算并下传；本步先在调用点加 `rowSignals={rowSignals}`，变量在 Task 4 落地）。**为保证本任务可独立 tsc**，在本任务内先于调用前就地计算：
```ts
const rowSignals = deriveRowSignals({ filings: d.filings, verdicts, cusipToTicker, lang });
```
放在 `HoldingsTable` 调用之前（`verdicts`/`cusipToTicker`/`d.filings` 均已存在）。

- [ ] **Step 6: 类型门 + grep**

Run: `cd web && npx tsc --noEmit`
Expected: 0 报错。
Run: `cd web && grep -c "WeightBar\|deriveRowSignals\|key: \"signal\"" src/app/\[lang\]/investors/\[slug\]/page.tsx`
Expected: ≥ `3`。

- [ ] **Step 7: Commit**

```bash
git add "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(investors): 持仓表加权重条+行内信号列(便宜/高信念)"
```

---

### Task 4: 详情页重排（持仓提前 / KeyFacts 收紧 / 正文折叠 / 单一出口）

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`（body 顺序 + `keyFacts` + 正文包 `<details>`；移除 `ConvictionPicks`/`StrikeZonePicks` 段渲染）

**Interfaces:**
- Consumes: 既有 `EntityPage` children 插槽；`InvestorProfileProse`、`DiscoveryHandoff`、`HoldingsTable`（Task 3 版）。

- [ ] **Step 1: KeyFacts 收紧**

把 `keyFacts` 数组里 `{ label: "报告季度"…, value: quarterLabel(latest.period) }` 这一格**删除**，换成第一大仓占比：
```ts
// 第一大仓占比(占组合权重)
const top1 = latest.holdings.length > 0
  ? [...latest.holdings].sort((a, b) => b.value - a.value)[0]
  : null;
const top1Pct = top1 && latest.totalValue > 0 ? (top1.value / latest.totalValue) * 100 : null;
```
`keyFacts` 变为（顺序）：组合市值(node) / 持仓数(node) / 第一大持仓(名) / **第一大仓占比**：
```ts
{ label: lang === "zh" ? "第一大仓占比" : "Top position", value: top1Pct != null ? `${top1Pct.toFixed(1)}%` : "—" },
```

- [ ] **Step 2: 正文折叠（B2, SSR 全文）**

在 EntityPage children 里，把 `<InvestorProfileProse …/>` 包进原生 `<details>`（全文仍 SSR 在 HTML 内，爬虫可读）：
```tsx
<details className="group border-t border-[var(--tt-border)] pt-4">
  <summary className="cursor-pointer list-none font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)] marker:hidden [&::-webkit-details-marker]:hidden">
    {lang === "zh" ? "关于这位投资者 ▸" : "About this investor ▸"}
  </summary>
  <div className="mt-3">
    <InvestorProfileProse paragraphs={prose} lang={lang} cusipToTicker={cusipToTicker} />
  </div>
</details>
```

- [ ] **Step 3: 重排 body 顺序 + 删两段精选**

EntityPage children 新顺序（**持仓表提前到最上**；删除 `ConvictionPicks` 与 `StrikeZonePicks` 段的渲染）：
```tsx
<>
  <HoldingsTable holdings={latest.holdings} prior={prior} changes={changes} lang={lang} cusipToTicker={cusipToTicker} verdicts={verdicts} holderCounts={holderCounts} rowSignals={rowSignals} />
  {/* 折叠正文(Step 2 的 <details>) */}
  <DiscoveryHandoff {...investorHandoffFor(strikeCount, manager.person, lang)} />
</>
```
删除原先的 `<ConvictionPicks …/>` 与 `<StrikeZonePicks …/>` JSX 块。相应地删除不再使用的 import：`ConvictionPicks`、`StrikeZonePicks`、`deriveConviction`、`picks` 变量（`deriveRowSignals` 已内部调用 `deriveConviction`，页面不再直接需要）。保留 `strikeCount` 计算（`DiscoveryHandoff` 仍用）。

- [ ] **Step 4: 类型门 + grep（确认两段已移除）**

Run: `cd web && npx tsc --noEmit`
Expected: 0 报错。
Run: `cd web && grep -c "ConvictionPicks\|StrikeZonePicks" src/app/\[lang\]/investors/\[slug\]/page.tsx`
Expected: `0`（两段渲染与 import 均已移除）。
Run: `cd web && grep -c "<details" src/app/\[lang\]/investors/\[slug\]/page.tsx`
Expected: ≥ `1`。

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(investors): 详情页重排—持仓提前/正文折叠/单一出口/KeyFacts收紧"
```

---

### Task 5: 清理孤立组件 `ConvictionPicks` / `StrikeZonePicks`

信号已内联进持仓表；两个独立组件不再被任何页面引用。删除以避免死代码。

**Files:**
- Delete: `web/src/components/entity/ConvictionPicks.tsx`
- Delete: `web/src/components/investor/StrikeZonePicks.tsx`

- [ ] **Step 1: 确认无其它引用**

Run: `cd web && grep -rn "ConvictionPicks\|StrikeZonePicks" src/ | grep -v "components/entity/ConvictionPicks.tsx\|components/investor/StrikeZonePicks.tsx"`
Expected: 空（无其它引用）。若有引用则先处理再删。

- [ ] **Step 2: 删除**

```bash
git rm web/src/components/entity/ConvictionPicks.tsx web/src/components/investor/StrikeZonePicks.tsx
```

- [ ] **Step 3: 类型门**

Run: `cd web && npx tsc --noEmit`
Expected: 0 报错。

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(investors): 删除已内联的 ConvictionPicks/StrikeZonePicks 组件"
```

---

### Task 6: 列表页 C1（序号 / 筛选栏计数 / 本季动作快筛 / 44px / 头部加重）

**Files:**
- Modify: `web/src/app/[lang]/investors/InvestorListClient.tsx`

**Interfaces:**
- Consumes: 既有 `DataTable`（`showRank` 已支持）、`ManagerQoQ.verdict`（`"buying" | "selling" | "mixed" | null`）。

- [ ] **Step 1: COPY 加筛选/计数文案**

`COPY.zh` 加：
```ts
count: (m: number, n: number) => m === n ? `共 ${n} 位` : `匹配 ${m} / 共 ${n} 位`,
filterAll: "全部", filterBuying: "加仓", filterSelling: "减仓", filterMixed: "微调",
```
`COPY.en` 加：
```ts
count: (m: number, n: number) => m === n ? `${n} investors` : `${m} of ${n}`,
filterAll: "All", filterBuying: "Buying", filterSelling: "Selling", filterMixed: "Held",
```

- [ ] **Step 2: 加本季动作快筛 state + 过滤**

```ts
type VerdictFilter = "all" | "buying" | "selling" | "mixed";
const [vf, setVf] = useState<VerdictFilter>("all");
```
`filtered` 的 `useMemo` 里，在搜索过滤后、排序前，加一层：
```ts
const afterVf = vf === "all" ? base : base.filter((m) => m.qoq?.verdict === vf);
return [...afterVf].sort((a, b) => sort === "value" ? b.totalValue - a.totalValue : b.holdingCount - a.holdingCount);
```
把依赖数组加 `vf`。

- [ ] **Step 3: 筛选栏重排（搜索 + 计数 + 快筛 + 排序，44px 触控）**

在 controls 区（搜索+排序那块）改为两行结构：第一行 搜索框 + 计数；第二行 本季动作 segment 快筛 + 排序按钮。快筛 chip 与排序按钮统一 `min-h-[44px]`（H5）+ `aria-pressed`：
```tsx
{/* 计数 */}
<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
  {t.count(filtered.length, managers.length)}
</span>
{/* 本季动作快筛 */}
<div className="flex flex-wrap gap-1">
  {([["all", t.filterAll], ["buying", t.filterBuying], ["selling", t.filterSelling], ["mixed", t.filterMixed]] as const).map(([k, label]) => (
    <button
      key={k}
      onClick={() => setVf(k as VerdictFilter)}
      aria-pressed={vf === k}
      className={[
        "min-h-[44px] px-3 font-mono text-[11px] uppercase tracking-[0.08em] border transition-colors",
        vf === k ? "border-[var(--tt-accent)] text-[var(--tt-accent)]" : "border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:border-[var(--tt-muted)]",
      ].join(" ")}
    >
      {label}
    </button>
  ))}
</div>
```
排序两个按钮的 `px-3 py-1` 改为 `min-h-[44px] px-3`（去掉 `py-1`，靠 min-h 保触控）。

- [ ] **Step 4: 开启序号 + 头部加重**

`DataTable` 调用加 `showRank`：
```tsx
<DataTable columns={columns} rows={filtered} getKey={(m) => m.cik} rowHref={(m) => investorPath(lang, m.slug)} breakpoint="lg" showRank emptyText={t.noResults} />
```
头部加重（前 10 名）：在 `investor` 列 `cell` 里对 `index < 10` 的行让人名 `font-semibold`（其余 `font-medium`）——`cell: (m, i) => (…)` 用第二参 `i`：
```tsx
cell: (m, i) => (
  <>
    <span className={i < 10 ? "font-semibold" : ""}>{m.person}</span>
    <span className="mt-0.5 block text-[11px] font-normal text-[var(--tt-faint)]">{m.name}</span>
  </>
),
```
（`Column.cell` 签名已是 `(row, index)`，直接用。）

- [ ] **Step 5: 类型门 + grep**

Run: `cd web && npx tsc --noEmit`
Expected: 0 报错。
Run: `cd web && grep -c "showRank\|aria-pressed\|min-h-\[44px\]\|setVf" src/app/\[lang\]/investors/InvestorListClient.tsx`
Expected: ≥ `4`。

- [ ] **Step 6: Commit**

```bash
git add "web/src/app/[lang]/investors/InvestorListClient.tsx"
git commit -m "feat(investors): 列表页C1—榜单序号/筛选栏计数/本季动作快筛/44px触控/头部加重"
```

---

### Task 7: 列表页去"线—标题—线"三明治

`SubNav`（`border-b mb-8`）与 `PageHeader`（`border-b pb-6`）连续两条横线夹标题，且 PageHeader eyebrow "SEC 13F · 季度披露" 与 SubNav 分区语义重复。仅在 investors 列表页局部处理，**不动全局 `PageHeader`/`SubNav` 组件**（避免波及其它页）。

**Files:**
- Modify: `web/src/app/[lang]/investors/InvestorListClient.tsx`（`PageHeader` 用法）

**Interfaces:**
- Consumes: 既有 `PageHeader`（`eyebrow?` 可选）。

- [ ] **Step 1: 去 eyebrow（消除与 SubNav 语义重复）**

`InvestorListClient` 里 `<PageHeader eyebrow={t.eyebrow} title={t.heading} intro={t.subtitle} />` 去掉 `eyebrow`：
```tsx
<PageHeader title={t.heading} intro={t.subtitle} />
```
（`t.eyebrow` COPY 可保留不删，避免动 COPY 结构；仅不再传入。）

- [ ] **Step 2: 收一条横线**

`SubNav` 已自带 `border-b mb-8`。为避免"双线"，`PageHeader` 在本页显得多一条底线——本步用外层包裹去掉 PageHeader 的视觉底线冗余：在 `InvestorListClient` 顶层 `<div className="space-y-8">` 内，`PageHeader` 外包一层去掉其下边框的视觉影响不可行（边框在组件内）。**采用**：把 `PageHeader` 换为不带底线的本地头（保持 eyebrow-less 标题 + intro），或接受 SubNav 线为唯一分隔、PageHeader 保留其底线作为标题与控件的分隔——**二选一由实现者按真机效果定**：优先保留 PageHeader 底线（它分隔"标题区 vs 筛选栏"有功能意义），仅确保 SubNav 与 PageHeader 之间间距（`mb-8`）足够、不显"双线贴挤"。若真机仍显拥挤，则给 SubNav 传或本页覆盖去其 `mb`，让两线拉开。

> 说明：本步是"视觉判断"步，允许实现者在两方案间择优（去 eyebrow 是确定项，已在 Step 1 落地）。以真机 Vercel preview 观感为准，无横向溢出、头部不显"线夹线"即通过。

- [ ] **Step 3: 类型门 + grep**

Run: `cd web && npx tsc --noEmit`
Expected: 0 报错。
Run: `cd web && grep -c "eyebrow=" src/app/\[lang\]/investors/InvestorListClient.tsx`
Expected: `0`（PageHeader 不再传 eyebrow）。

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/[lang]/investors/InvestorListClient.tsx"
git commit -m "fix(investors): 列表页去顶部三明治—删与SubNav重复的eyebrow"
```

---

## 最终验收（全任务后）

- [ ] `cd web && npx tsc --noEmit` = 0。
- [ ] grep 断言：
  - `grep -rn "ConvictionPicks\|StrikeZonePicks" web/src/` → 空（组件与引用全清）。
  - `grep -rn '`/\${lang}/' web/src/app/\[lang\]/investors/` → 空（无硬编码语言路径）。
- [ ] 无冲突标记、工作区干净。
- [ ] Push 分支，Vercel preview 真机验收：
  - **详情页**：持仓表在最上、权重条渲染、行内"便宜/信念"徽章、正文 `<details>` 可展开且 HTML 内含全文、单一 panel 出口、KeyFacts 无"报告季度"有"第一大仓占比"。H5：卡片信号进 trail、无横向溢出。
  - **列表页**：序号榜单、"共N/匹配M"计数随搜索/快筛更新、本季动作快筛生效、排序/快筛按钮 ≥44px、前10名加重、顶部无"线夹线"。H5：筛选栏堆叠、快筛横排可点、卡片正常。

## 四层验收对照（沿用 landing 标准）
1. **技术门**：tsc=0 + grep 断言（上）。
2. **设计**：主次清晰(持仓一屏见)、section 头不再五段同质、panel 框全页仅一处、令牌合规、无 shadcn Card。
3. **去 AI 感/产品感**：徽章/权重条由真数据生成无装饰；文案无 AI 腔；每句带名词/数字。
4. **产品**：详情页持仓主角+正文可折叠可收录+单一出口；列表页序号+筛选栏计数+快筛+44px。
5. **响应式**：PC+H5 双端过。
