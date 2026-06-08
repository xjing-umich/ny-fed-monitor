# 投资人列表页 QoQ 信号 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在超级投资者列表页 `/investors` 表格每行加 4 个季度变化信号（市值环比%、持仓数Δ、整体加仓/减仓 chip、本季最大动作），作为点进详情的钩子，且不影响任何页面性能。

**Architecture:** QoQ 计算全部下沉到一个**页面级独立 SQL 函数 `manager_qoq()`**（库内一次算完 holdings diff，只在 `/investors` 调一次），**根布局热路径 `manager_index()` 一字不动**；`/investors` 是 ISR 静态页（`revalidate=3600`），用户拿 CDN HTML。RPC 未部署时应用层返回空 Map → 列表优雅退回无 QoQ。

**Tech Stack:** Next.js（定制版，写码前看 `node_modules/next/dist/docs/`）· TypeScript · Tailwind（`--tt-*` 主题变量）· Supabase（Postgres RPC）。

**项目约定：**
- **不写单测**（solo dev）。每任务验证 = `cd web && nvm use 20 && npm run build`（类型 + ISR 预渲染必过，**Node 20**）+ 必要时 `npm start` 人工看页面。
- 工作基线：worktree `.claude/worktrees/investor-qoq`，分支 `feat/investor-qoq-comparison`（已 rebase 到 `origin/db-foundation` 最新，含详情页 QoQ + top buys）。
- 频繁提交，每任务末尾一次 commit。

**Spec:** `docs/superpowers/specs/2026-06-08-investor-index-qoq-design.md`

**已确认关键类型（`web/src/lib/managers/types.ts`）：**
- `Manager = { cik, slug, name, person }`
- `ManagerSummary = Manager & { period, totalValue, holdingCount, topHolding }`
- `ManagerIndex = { generatedAt, managers: ManagerSummary[] }`

**已确认数据访问层（`web/src/lib/managers/`）：**
- `source.ts` 已有 `getManagerIndex = cache(async () => hasSupabaseEnv() ? supa.getManagerIndex(...) : jsonIndex())`；已 import `cache`、`hasSupabaseEnv`、`* as supa`。
- `supabase.ts` 已有 `getDb()`、`getManagerIndex()`（用 `db.rpc("manager_index")`）。
- `schema.sql` 已有 `manager_index()` 函数（紧随其后追加新函数）。

---

## File Structure

**新增（无新文件，均在既有文件内追加）**

**修改**
- `web/supabase/schema.sql` — 追加 `manager_qoq()` 函数（纯加新，缺失自动降级）
- `web/src/lib/managers/types.ts` — 新增 `ManagerQoQ` 类型
- `web/src/lib/managers/supabase.ts` — 新增 `getManagerQoQ()`（RPC + 优雅降级 + snake→camel 映射）
- `web/src/lib/managers/source.ts` — 新增 `getManagerQoQ()`（cache + env 分流）
- `web/src/app/[lang]/investors/page.tsx` — 并行取数 + 按 cik 合并，传给 client
- `web/src/app/[lang]/investors/InvestorListClient.tsx` — 版式 A 渲染（内联 Δ + 「本季动作」列取代「第一大持仓」）

**不动**：`manager_index()`、`getManagerIndex()`、`[lang]/layout.tsx`、详情页、consensus/stocks/managers/sitemap 等其他 `getManagerIndex` 调用方。

---

## Task 1: SQL 函数 `manager_qoq()`（schema.sql 源真值）

**Files:**
- Modify: `web/supabase/schema.sql`（在 `manager_index()` 函数定义之后追加）

> 说明：本任务把函数加入 schema.sql（部署源真值）。实际部署到 Supabase + `EXPLAIN ANALYZE` 性能核验放在 Task 6（需 SQL Editor 权限，由用户执行）。本任务不影响构建——应用层在 RPC 缺失时优雅降级。

- [ ] **Step 1: 追加 `manager_qoq()` 函数**

在 `web/src/.../schema.sql` 中，定位 `manager_index()` 函数定义的结尾（`$$;` 那一行），在其**之后**插入以下整段：

```sql

-- ── manager_qoq() ───────────────────────────────────────────────────────────
-- 投资人列表页季度变化信号:每户返回 市值环比% / 持仓数Δ / 整体买卖向 / 本季最大动作。
-- 仅 /investors 列表页调用一次(非根布局热路径),库内一次算完 holdings diff,故对全站
-- 取数零影响。函数缺失时应用层 getManagerQoQ 返回空 → 列表优雅退回无 QoQ。
-- 口径与详情页 getManagerDetail 的 changes/verdict 一致:
--   buy=new+increased, sell=exited+decreased(按持股数 shares 判定真实买卖,不受股价漂移影响)。
-- 部署:Supabase SQL Editor 执行;若 PostgREST 报找不到函数 → notify pgrst, 'reload schema';
create or replace function manager_qoq()
returns table (
  cik text,
  value_delta_pct double precision,   -- null: 无 prior 或 prior.total_value=0
  count_delta int,                     -- null: 无 prior
  verdict text,                        -- 'buying' | 'selling' | 'mixed' | null(无prior)
  top_move_issuer text,                -- null: 无 prior 或无变动
  top_move_kind text                   -- 'new'|'exited'|'increased'|'decreased' | null
)
language sql
stable
as $$
  with latest as (
    select distinct on (f.cik)
      f.cik, f.id as filing_id, f.period, f.total_value, f.holding_count
    from filings f
    order by f.cik, f.period desc
  ),
  prior as (
    select distinct on (f.cik)
      f.cik, f.id as filing_id, f.total_value, f.holding_count
    from filings f
    join latest l on l.cik = f.cik and f.period < l.period
    order by f.cik, f.period desc
  ),
  hl as (
    select l.cik, h.cusip, h.issuer, h.value, h.shares
    from latest l join holdings h on h.filing_id = l.filing_id
  ),
  hp as (
    select p.cik, h.cusip, h.issuer, h.value, h.shares
    from prior p join holdings h on h.filing_id = p.filing_id
  ),
  diff as (
    select
      coalesce(hl.cik, hp.cik) as cik,
      coalesce(hl.issuer, hp.issuer) as issuer,
      case
        when hp.cusip is null then 'new'
        when hl.cusip is null then 'exited'
        when hl.shares > hp.shares then 'increased'
        when hl.shares < hp.shares then 'decreased'
        else 'unchanged'
      end as kind,
      case
        when hp.cusip is null then coalesce(hl.value, 0)
        when hl.cusip is null then coalesce(hp.value, 0)
        else abs(coalesce(hl.value, 0) - coalesce(hp.value, 0))
      end as impact,
      coalesce(hl.value, 0) as latest_value
    from hl
    full outer join hp on hp.cik = hl.cik and hp.cusip = hl.cusip
  ),
  verdicts as (
    select cik,
      count(*) filter (where kind in ('new','increased'))  as buys,
      count(*) filter (where kind in ('exited','decreased')) as sells
    from diff
    where kind <> 'unchanged'
    group by cik
  ),
  topmove as (
    select distinct on (cik) cik, issuer as top_move_issuer, kind as top_move_kind
    from diff
    where kind <> 'unchanged'
    order by cik, impact desc, latest_value desc
  )
  select
    l.cik,
    case when p.cik is not null and p.total_value > 0
         then (l.total_value - p.total_value)::double precision / p.total_value
         else null end as value_delta_pct,
    case when p.cik is not null
         then l.holding_count - p.holding_count
         else null end as count_delta,
    case when p.cik is null then null
         when coalesce(v.buys,0) > coalesce(v.sells,0) then 'buying'
         when coalesce(v.sells,0) > coalesce(v.buys,0) then 'selling'
         else 'mixed' end as verdict,
    tm.top_move_issuer,
    tm.top_move_kind
  from latest l
  left join prior   p  on p.cik  = l.cik
  left join verdicts v on v.cik = l.cik
  left join topmove tm on tm.cik = l.cik;
$$;
```

- [ ] **Step 2: 语法自检（构建不受影响，仅核对 SQL 合理）**

人工核对：CTE 链 `latest→prior→hl/hp→diff→verdicts/topmove→final select` 完整；`distinct on (cik)` 均配 `order by cik, … `；`full outer join` 用 `coalesce(hl.cik, hp.cik)`。无需运行（部署在 Task 6）。

- [ ] **Step 3: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/investor-qoq
git add web/supabase/schema.sql
git commit -m "feat(db): manager_qoq() 列表页季度变化信号函数(页面级,不碰热路径)"
```

---

## Task 2: `ManagerQoQ` 类型

**Files:**
- Modify: `web/src/lib/managers/types.ts`（文件末尾追加，`ManagerSummary` 不动）

- [ ] **Step 1: 追加类型**

在 `web/src/lib/managers/types.ts` 末尾追加：

```ts
/** 列表页季度变化信号(来自 manager_qoq RPC)。各字段为 null 表示无 prior/无变动。 */
export type ManagerQoQ = {
  valueDeltaPct: number | null;
  countDelta: number | null;
  verdict: "buying" | "selling" | "mixed" | null;
  topMoveIssuer: string | null;
  topMoveKind: "new" | "exited" | "increased" | "decreased" | null;
};
```

- [ ] **Step 2: 构建验证**

Run: `cd web && source ~/.nvm/nvm.sh && nvm use 20 && npm run build`
Expected: PASS（纯类型新增，无引用变更）。

- [ ] **Step 3: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/investor-qoq
git add web/src/lib/managers/types.ts
git commit -m "feat(types): 新增 ManagerQoQ(列表页季度变化信号)"
```

---

## Task 3: 数据访问层 `getManagerQoQ()`

**Files:**
- Modify: `web/src/lib/managers/supabase.ts`（新增 RPC 读取 + 映射）
- Modify: `web/src/lib/managers/source.ts`（新增 cache + env 分流）

- [ ] **Step 1: `supabase.ts` 新增 `getManagerQoQ()`**

先 Read `web/src/lib/managers/supabase.ts` 确认顶部从 `./types` import 的类型列表，把 `ManagerQoQ` 加入该 import（例如 `import type { …, ManagerQoQ } from "./types";`）。

然后在 `getManagerIndex()` 函数**之后**追加：

```ts
// manager_qoq RPC 行(snake_case, 与 SQL 函数 returns table 一一对应)。
type QoQRow = {
  cik: string;
  value_delta_pct: number | null;
  count_delta: number | null;
  verdict: string | null;
  top_move_issuer: string | null;
  top_move_kind: string | null;
};

/**
 * 每户季度变化信号 Map(cik → ManagerQoQ)。仅 /investors 列表页调用。
 * 函数未部署/出错 → 返回空 Map(优雅降级,列表不显 QoQ,不抛)。
 */
export async function getManagerQoQ(): Promise<Map<string, ManagerQoQ>> {
  const out = new Map<string, ManagerQoQ>();
  const db = getDb();
  const { data, error } = await db.rpc("manager_qoq");
  if (error || !data) return out;
  for (const r of data as QoQRow[]) {
    out.set(r.cik, {
      valueDeltaPct: r.value_delta_pct,
      countDelta: r.count_delta,
      verdict: (r.verdict as ManagerQoQ["verdict"]) ?? null,
      topMoveIssuer: r.top_move_issuer,
      topMoveKind: (r.top_move_kind as ManagerQoQ["topMoveKind"]) ?? null,
    });
  }
  return out;
}
```

- [ ] **Step 2: `source.ts` 新增 `getManagerQoQ()`**

先 Read `web/src/lib/managers/source.ts` 确认 `ManagerQoQ` 是否需加入从 `./types` 的 import（若该文件已 `import type { … } from "./types"` 则加上 `ManagerQoQ`；若用 `import type { ManagerIndex } …` 形式，追加 `ManagerQoQ`）。

在 `getManagerIndex` 定义**之后**追加：

```ts
// 列表页季度变化信号:有 Supabase 走 RPC,否则空 Map(JSON 兜底数据无 QoQ)。
// cache() 使同一请求内多次调用只查一次。
export const getManagerQoQ = cache(async (): Promise<Map<string, ManagerQoQ>> => {
  if (hasSupabaseEnv()) return supa.getManagerQoQ();
  return new Map();
});
```

- [ ] **Step 3: 构建验证**

Run: `cd web && source ~/.nvm/nvm.sh && nvm use 20 && npm run build`
Expected: PASS（类型对齐；`db.rpc("manager_qoq")` 在 RPC 未部署时运行期返回 error → 空 Map，构建期预渲染若触发也优雅降级）。

- [ ] **Step 4: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/investor-qoq
git add web/src/lib/managers/supabase.ts web/src/lib/managers/source.ts
git commit -m "feat(data): getManagerQoQ() 读取 manager_qoq RPC(缺失优雅降级)"
```

---

## Task 4: 列表页并行取数 + 按 cik 合并

**Files:**
- Modify: `web/src/app/[lang]/investors/page.tsx`

- [ ] **Step 1: 改 import 与取数/合并**

当前 `web/src/app/[lang]/investors/page.tsx` 的 import 行：
```ts
import { getManagerIndex } from "@/lib/managers/source";
```
改为：
```ts
import { getManagerIndex, getManagerQoQ } from "@/lib/managers/source";
```

当前 body：
```ts
  const idx = await getManagerIndex();
  const managers = [...idx.managers].sort((a, b) => b.totalValue - a.totalValue);

  return (
    <>
      <SubNav lang={lang} section="investors" active="all" />
      <InvestorListClient lang={lang} managers={managers} />
    </>
  );
```
改为（并行取数,按 cik 合并 qoq；排序不变）：
```ts
  const [idx, qoq] = await Promise.all([getManagerIndex(), getManagerQoQ()]);
  const managers = [...idx.managers]
    .sort((a, b) => b.totalValue - a.totalValue)
    .map((m) => ({ ...m, qoq: qoq.get(m.cik) }));

  return (
    <>
      <SubNav lang={lang} section="investors" active="all" />
      <InvestorListClient lang={lang} managers={managers} />
    </>
  );
```

> 注：本步**可独立构建**。`managers` 合并后元素类型为 `ManagerSummary & { qoq? }`，赋给 client 现有 `managers: ManagerSummary[]` 参数是结构性可赋值的（多出的可选 `qoq` 属性经变量传入不触发 excess-property 检查）。此时旧 client 忽略 `qoq`、仍渲染旧列；Task 5 再更新 client 真正渲染 `qoq`。

- [ ] **Step 2: 构建验证**

Run: `cd web && source ~/.nvm/nvm.sh && nvm use 20 && npm run build`
Expected: PASS（合并行可赋值给现有 client props；RPC 未部署时 `getManagerQoQ` 返回空 Map，行 `qoq` 为 undefined，旧 client 无视之）。

- [ ] **Step 3: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/investor-qoq
git add "web/src/app/[lang]/investors/page.tsx"
git commit -m "feat(investor): 列表页并行取 QoQ 并按 cik 合并到行"
```

---

## Task 5: 列表表格版式 A 渲染（`InvestorListClient.tsx`）

**Files:**
- Modify: `web/src/app/[lang]/investors/InvestorListClient.tsx`（整体替换）

目标：内联 Δ%（市值列）+ 内联 Δ（持仓列）+ 新「本季动作」列（verdict chip + `最大：{issuer} {kind}`）取代原「第一大持仓」列。搜索/排序不变。

- [ ] **Step 1: 整体替换 `InvestorListClient.tsx`**

用以下整段替换 `web/src/app/[lang]/investors/InvestorListClient.tsx` 全文：

```tsx
"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import type { ManagerSummary, ManagerQoQ } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { investorPath } from "@/lib/urls";
import { formatUSD } from "@/lib/format";

type Row = ManagerSummary & { qoq?: ManagerQoQ };

const COPY = {
  zh: {
    heading: "超级投资者",
    subtitle: "追踪顶级基金经理的 SEC 13F 季度持仓披露，了解聪明钱在买什么。",
    search: "搜索投资人或机构…",
    sortValue: "按市值",
    sortCount: "按持仓数",
    cols: {
      investor: "投资人 / 机构",
      portfolio: "组合市值",
      holdings: "持仓数",
      period: "报告期",
      move: "本季动作",
    },
    verdict: { buying: "整体加仓", selling: "整体减仓", mixed: "持仓微调" },
    kind: { new: "新建", exited: "清仓", increased: "加仓", decreased: "减仓" },
    topPrefix: "最大：",
    noResults: "无匹配结果",
  },
  en: {
    heading: "Superinvestors",
    subtitle: "Track top fund managers' quarterly SEC 13F disclosures to see what smart money is buying.",
    search: "Search by name or firm…",
    sortValue: "By value",
    sortCount: "By count",
    cols: {
      investor: "Investor / Firm",
      portfolio: "Portfolio",
      holdings: "Holdings",
      period: "Period",
      move: "This quarter",
    },
    verdict: { buying: "Net buying", selling: "Net selling", mixed: "Mostly held" },
    kind: { new: "New", exited: "Exited", increased: "Added", decreased: "Trimmed" },
    topPrefix: "Top: ",
    noResults: "No results",
  },
} as const;

type SortKey = "value" | "count";

// 市值环比%: 非空且非 0 才显, 绿涨橙跌。
function fmtPctDelta(p: number | null | undefined): { text: string; cls: string } | null {
  if (p == null || p === 0) return null;
  const cls = p > 0 ? "text-[var(--tt-positive)]" : "text-[var(--tt-warn)]";
  return { text: `${p > 0 ? "+" : "−"}${Math.abs(p * 100).toFixed(0)}%`, cls };
}

// 持仓数Δ: 非空且非 0 才显。
function fmtCountDelta(n: number | null | undefined): { text: string; cls: string } | null {
  if (n == null || n === 0) return null;
  const cls = n > 0 ? "text-[var(--tt-positive)]" : "text-[var(--tt-warn)]";
  return { text: `${n > 0 ? "+" : "−"}${Math.abs(n)}`, cls };
}

const VERDICT_CLASS: Record<NonNullable<ManagerQoQ["verdict"]>, string> = {
  buying: "text-[var(--tt-positive)] border-[var(--tt-positive)]",
  selling: "text-[var(--tt-warn)] border-[var(--tt-warn)]",
  mixed: "text-[var(--tt-faint)] border-[var(--tt-border)]",
};

const KIND_CLASS: Record<NonNullable<ManagerQoQ["topMoveKind"]>, string> = {
  new: "text-[var(--tt-positive)]",
  increased: "text-[var(--tt-positive)]",
  decreased: "text-[var(--tt-warn)]",
  exited: "text-[var(--tt-negative)]",
};

export function InvestorListClient({
  lang,
  managers,
}: {
  lang: Lang;
  managers: Row[];
}): React.ReactElement {
  const t = COPY[lang];
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("value");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? managers.filter(
          (m) =>
            m.person.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q)
        )
      : managers;
    return [...base].sort((a, b) =>
      sort === "value" ? b.totalValue - a.totalValue : b.holdingCount - a.holdingCount
    );
  }, [managers, query, sort]);

  return (
    <div className="space-y-8">
      {/* Editorial heading */}
      <div className="border-b border-[var(--tt-border)] pb-6">
        <h1 className="font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {t.heading}
        </h1>
        <p className="mt-2 text-sm text-[var(--tt-muted)]">{t.subtitle}</p>
      </div>

      {/* Controls — quiet hairline style */}
      <div className="flex flex-wrap gap-4 items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          aria-label={t.search}
          className="flex-1 min-w-[200px] border-0 border-b border-[var(--tt-border)] bg-transparent px-0 py-1.5 text-sm text-[var(--tt-text)] placeholder:text-[var(--tt-faint)] focus:outline-none focus:border-[var(--tt-accent)]"
        />
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setSort("value")}
            className={[
              "px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] border border-[var(--tt-border)] transition-colors",
              sort === "value"
                ? "bg-[var(--tt-accent)] text-white border-[var(--tt-accent)]"
                : "text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:border-[var(--tt-muted)]",
            ].join(" ")}
          >
            {t.sortValue}
          </button>
          <button
            onClick={() => setSort("count")}
            className={[
              "px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] border border-[var(--tt-border)] transition-colors",
              sort === "count"
                ? "bg-[var(--tt-accent)] text-white border-[var(--tt-accent)]"
                : "text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:border-[var(--tt-muted)]",
            ].join(" ")}
          >
            {t.sortCount}
          </button>
        </div>
      </div>

      {/* Editorial table */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--tt-muted)]">{t.noResults}</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--tt-border)]">
                <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)]">
                  {t.cols.investor}
                </th>
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-36">
                  {t.cols.portfolio}
                </th>
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-24">
                  {t.cols.holdings}
                </th>
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-28 hidden sm:table-cell">
                  {t.cols.period}
                </th>
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-44">
                  {t.cols.move}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const pd = fmtPctDelta(m.qoq?.valueDeltaPct);
                const cd = fmtCountDelta(m.qoq?.countDelta);
                const v = m.qoq?.verdict ?? null;
                const issuer = m.qoq?.topMoveIssuer ?? null;
                const kind = m.qoq?.topMoveKind ?? null;
                return (
                  <tr
                    key={m.cik}
                    className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={investorPath(lang, m.slug)}
                        className="font-display font-medium text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)] transition-colors"
                      >
                        {m.person}
                      </Link>
                      <span className="block text-[11px] text-[var(--tt-faint)] mt-0.5">
                        {m.name}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-accent)] font-medium">
                      {formatUSD(m.totalValue)}
                      {pd && <span className={`ml-1.5 text-[11px] ${pd.cls}`}>{pd.text}</span>}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-text)]">
                      {m.holdingCount}
                      {cd && <span className={`ml-1.5 text-[11px] ${cd.cls}`}>{cd.text}</span>}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-muted)] hidden sm:table-cell">
                      {m.period}
                    </td>
                    <td className="py-3 text-right">
                      {v ? (
                        <>
                          <span
                            className={[
                              "inline-block font-mono text-[10px] uppercase tracking-[0.04em] px-1.5 py-0.5 border rounded-sm",
                              VERDICT_CLASS[v],
                            ].join(" ")}
                          >
                            {t.verdict[v]}
                          </span>
                          {issuer && kind && (
                            <span className="block text-[11px] text-[var(--tt-muted)] mt-1 hidden sm:block">
                              {t.topPrefix}
                              <span className="text-[var(--tt-text)]">{issuer}</span>{" "}
                              <span className={KIND_CLASS[kind]}>{t.kind[kind]}</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[var(--tt-faint)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 构建验证**

Run: `cd web && source ~/.nvm/nvm.sh && nvm use 20 && npm run build`
Expected: PASS。`page.tsx`（Task 4）传入的 `managers`（`ManagerSummary & { qoq? }`）与 client 新 `Row[]` 对齐；类型无误，485+ 页预渲染通过。

- [ ] **Step 3: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/investor-qoq
git add "web/src/app/[lang]/investors/InvestorListClient.tsx"
git commit -m "feat(investor): 列表表格版式A — 内联Δ + 本季动作列(chip+top move)"
```

---

## Task 6: 部署 SQL + 集成核验 + 性能闸门 + 回归

> 本任务含**需用户执行的 DB 部署步骤**（SQL Editor 权限）。实现代理执行能跑的部分（构建、git diff 核验），DB 部署/EXPLAIN 由用户在 Supabase 控制台执行并回报。

- [ ] **Step 1: 部署 `manager_qoq()` 到 Supabase（用户执行）**

在 Supabase 项目 → SQL Editor，粘贴 Task 1 追加的 `create or replace function manager_qoq() …` 整段并运行。若之后 PostgREST 报找不到函数，执行：
```sql
notify pgrst, 'reload schema';
```

- [ ] **Step 2: 性能闸门 — `EXPLAIN ANALYZE`（用户执行）**

在 SQL Editor 运行：
```sql
explain analyze select * from manager_qoq();
```
Expected: 总耗时**毫秒级**；holdings 扫描走 `holdings_filing_idx`（filing_id）。若出现 seq scan 拖慢，记录计划并反馈（可加索引，非常态）。

- [ ] **Step 3: 热路径未改动核验（代理执行）**

Run:
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/investor-qoq
git diff --name-only origin/db-foundation..HEAD
grep -n "manager_index" web/src/lib/managers/source.ts web/src/lib/managers/supabase.ts
```
Expected: 改动文件仅限本计划第 5 节清单；`manager_index()` 与 `getManagerIndex()` 定义体无修改（仅可能新增同文件的 `getManagerQoQ`）。`[lang]/layout.tsx` 不在改动列表。

- [ ] **Step 4: 全量构建回归（代理执行）**

Run: `cd web && source ~/.nvm/nvm.sh && nvm use 20 && npm run build`
Expected: 全站构建通过；`/zh/investors`、`/en/investors` 预渲染无错。

- [ ] **Step 5: 人工核对（代理起 server,用户看；部署 SQL 后）**

Run: `cd web && npm start`，开 `/zh/investors` 与 `/en/investors`：
- 市值列出现 `$X（−3%）`、持仓列 `38（−2）`，绿涨橙跌正确。
- 「本季动作」列出现 chip（整体加仓/减仓/微调）+ `最大：{公司} {新建/清仓/加仓/减仓}`，颜色正确。
- **无 prior 户**（首次申报）：该行「本季动作」显 `—`、市值/持仓无 Δ、不报错。
- 移动端窄屏：报告期列与 top move 文案隐藏，chip + 市值 Δ% 保留，不溢出。
- **RPC 未部署模拟**（可选）：临时将函数改名再看 → 列表退回全 `—`、页面正常；验证后改回。

- [ ] **Step 6: 如需要,最终确认（无额外 commit）**

本任务为部署+核验；前 5 个任务已各自提交。若 Step 5 发现问题，回对应任务修复并重新构建。

---

## 完成标准（对照 spec §7）

1. ✅ `/investors` 每行 4 信号（版式 A：内联 Δ + 「本季动作」列取代第一大持仓）— Task 4,5
2. ✅ 口径与详情页一致（verdict 按持股数；top move 取 |美元影响| 最大）— Task 1
3. ✅ 根布局/`manager_index()` 零改动；QoQ 仅 `/investors` 查一次；`EXPLAIN ANALYZE` 毫秒级 — Task 1,3,6
4. ✅ 无 prior / RPC 未部署 → 优雅退回无 QoQ，不报错 — Task 3,5,6
5. ✅ zh/en 双语；移动端响应式不溢出；`npm run build`（Node 20）通过 — Task 5,6

## 风险/备注

- **性能**：单次 in-DB RPC + 页面级 + ISR 三重隔离；`EXPLAIN ANALYZE` 实测把关（Task 6 Step 2）。
- **Task 4/5 各自可独立构建**：Task 4（page 传更丰富的行）对现有 client 参数结构性可赋值，Task 5（client 渲染 qoq）对仍传基础行的旧 page 因 `qoq` 可选也兼容；无强耦合。
- **top move 定义**：以 |美元变动额| 衡量；若后续想偏向新建/清仓，调 `topmove` 的 `order by`，非本期范围。
- **full outer join 重复**：依赖一期内 cusip 唯一假设，与详情页同口径。
- 主题变量 `--tt-positive/--tt-warn/--tt-negative/--tt-faint/--tt-accent` 沿用现有。
- 实现全程在 worktree `.claude/worktrees/investor-qoq`（分支 `feat/investor-qoq-comparison`）。
