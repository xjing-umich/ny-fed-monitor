# 多季 13F 回填 / Multi-Quarter Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把每位投资人保留的 13F 历史从 2 季加深到 8 季：`ManagerDetail` 新增 `filings: FilingData[]`，`latest/prior/changes` 改由读取层装配派生，下游零改动。

**Architecture:** 加法迁移。新增纯函数 `assemble.ts`（`computeChanges` + `assembleManagerDetail`）作为"单一来源 → 完整 ManagerDetail"的唯一装配入口；ingest / supabase 读取 / json 回退三处统一经它构造，并收敛此前重复的 `computeChanges`。ingest 抓 8 季、JSON 改存 `{manager, filings}`、supabase 读取 `.limit(8)`。每个任务后 app 仍能用现有数据正常运行（filings 暂为 2 季深），最后一个任务重跑 ingest 把数据加深到 8 季。

**Tech Stack:** Next.js App Router（定制版）、TypeScript、Supabase（读写）、tsx 脚本、SEC EDGAR。

**本项目约定：不写测试套件**（见记忆 no-tests-solo-dev）。每个任务用 `npx tsc --noEmit`（必要时 `npm run build` / 人工看页面）验证后 commit。命令在 `web/` 下运行。分支 `feat/multi-quarter-backfill`（worktree `.claude/worktrees/multi-quarter-backfill`，基于 origin/db-foundation）。

> ⚠️ 多 session：主工作树被其他 session 占在 `feat/lean-index`。**只在本 worktree 内动**，勿切主树。

---

### Task 1: 类型新增 `filings`

**Files:**
- Modify: `web/src/lib/managers/types.ts:43-48`

- [ ] **Step 1: 给 `ManagerDetail` 加 `filings` 字段**

找到：

```typescript
export type ManagerDetail = {
  manager: Manager;
  latest: FilingData;
  prior?: FilingData;
  changes: HoldingChange[];
};
```

改为：

```typescript
export type ManagerDetail = {
  manager: Manager;
  /** 全历史，按 period 降序，[0]=最新（最多 8 季）。单一来源；latest/prior/changes 由 assembleManagerDetail 派生。 */
  filings: FilingData[];
  latest: FilingData;
  prior?: FilingData;
  changes: HoldingChange[];
};
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 报错出现在尚未构造 `filings` 的地方（supabase.ts `mapDetailRows`、ingest 等）——这些将在后续任务修复。**确认报错都集中在"缺 filings 字段"**，再继续。

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/managers/types.ts
git commit -m "feat(backfill): ManagerDetail 新增 filings[] 字段"
```

---

### Task 2: 新建装配纯函数 `assemble.ts`

**Files:**
- Create: `web/src/lib/managers/assemble.ts`

说明：纯函数模块，**不引 `server-only`**（ingest 脚本以 node 运行也要 import）。`computeChanges` 从 supabase.ts / ingest 收敛到此处；types 用**相对**路径 import（兼容 Next 的 `@` 与 tsx 的相对解析）。

- [ ] **Step 1: 写 `assemble.ts`**

```typescript
import type { Manager, FilingData, Holding, HoldingChange, ManagerDetail } from "./types";

// 13F 同一证券可多行(子账户),按 cusip + put/call 归并后再比对。
function key(h: { cusip: string; putCall?: string }): string {
  return `${h.cusip}|${h.putCall ?? ""}`;
}

/** 最新一期 vs 上一期的持仓变化（new/increased/decreased/exited）。 */
export function computeChanges(latest: Holding[], prior: Holding[]): HoldingChange[] {
  const lm = new Map(latest.map((h) => [key(h), h]));
  const pm = new Map(prior.map((h) => [key(h), h]));
  const out: HoldingChange[] = [];
  for (const [k, lh] of lm) {
    const ph = pm.get(k);
    if (!ph) {
      out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "new", prevShares: 0, shares: lh.shares, value: lh.value, deltaPct: null });
    } else {
      const delta = lh.shares - ph.shares;
      if (delta !== 0) {
        out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: delta > 0 ? "increased" : "decreased", prevShares: ph.shares, shares: lh.shares, value: lh.value, deltaPct: ph.shares !== 0 ? delta / ph.shares : null });
      }
    }
  }
  for (const [k, ph] of pm) {
    if (!lm.has(k)) out.push({ cusip: ph.cusip, issuer: ph.issuer, kind: "exited", prevShares: ph.shares, shares: 0, value: 0, deltaPct: -1 });
  }
  return out;
}

/**
 * 从一份 filings[] 装配完整 ManagerDetail（唯一构造入口）。
 * - 按 period 降序排序
 * - latest = [0], prior = [1]
 * - changes = computeChanges(latest, prior)（无 prior → []）
 * 调用方须保证 filings 非空（空则不应构造 detail，返回 null）。
 */
export function assembleManagerDetail(manager: Manager, filings: FilingData[]): ManagerDetail {
  const sorted = [...filings].sort((a, b) => (b.period > a.period ? 1 : -1));
  const latest = sorted[0];
  const prior = sorted[1];
  const changes = prior ? computeChanges(latest.holdings, prior.holdings) : [];
  return { manager, filings: sorted, latest, prior, changes };
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: `assemble.ts` 本身无报错（其余旧报错仍在，后续任务消除）。

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/managers/assemble.ts
git commit -m "feat(backfill): 新增 assemble.ts(computeChanges+assembleManagerDetail 单一装配入口)"
```

---

### Task 3: supabase 读取层改用装配 + `.limit(8)`

**Files:**
- Modify: `web/src/lib/managers/supabase.ts:28-56`（删本地 `key`/`computeChanges`，重写 `mapDetailRows`）
- Modify: `web/src/lib/managers/supabase.ts:119`（`.limit(2)` → `.limit(8)`）
- Modify: `web/src/lib/managers/supabase.ts:1-5`（import assemble，清理未用 type）

- [ ] **Step 1: import `assembleManagerDetail`**

顶部找到：

```typescript
import "server-only";
import type {
  ManagerIndex, ManagerSummary, ManagerDetail, Manager, FilingData, Holding, HoldingChange, ManagerQoQ,
} from "@/lib/managers/types";
import { getDb } from "@/lib/managers/db";
```

改为（移除已不再本文件使用的 `HoldingChange`，新增 assemble import）：

```typescript
import "server-only";
import type {
  ManagerIndex, ManagerSummary, ManagerDetail, Manager, FilingData, Holding, ManagerQoQ,
} from "@/lib/managers/types";
import { assembleManagerDetail } from "@/lib/managers/assemble";
import { getDb } from "@/lib/managers/db";
```

- [ ] **Step 2: 删除本地 `key` 与 `computeChanges`，重写 `mapDetailRows`**

找到这段（约 28-56 行）：

```typescript
function key(h: { cusip: string; putCall?: string }): string { return `${h.cusip}|${h.putCall ?? ""}`; }

function computeChanges(latest: Holding[], prior: Holding[]): HoldingChange[] {
  const lm = new Map(latest.map((h) => [key(h), h]));
  const pm = new Map(prior.map((h) => [key(h), h]));
  const out: HoldingChange[] = [];
  for (const [k, lh] of lm) {
    const ph = pm.get(k);
    if (!ph) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "new", prevShares: 0, shares: lh.shares, value: lh.value, deltaPct: null });
    else {
      const delta = lh.shares - ph.shares;
      if (delta !== 0) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: delta > 0 ? "increased" : "decreased", prevShares: ph.shares, shares: lh.shares, value: lh.value, deltaPct: ph.shares !== 0 ? delta / ph.shares : null });
    }
  }
  for (const [k, ph] of pm) if (!lm.has(k)) out.push({ cusip: ph.cusip, issuer: ph.issuer, kind: "exited", prevShares: ph.shares, shares: 0, value: 0, deltaPct: -1 });
  return out;
}

export function mapDetailRows(manager: Manager, filingRows: any[], holdingRows: any[]): ManagerDetail {
  const sorted = [...filingRows].sort((a, b) => (b.period > a.period ? 1 : -1));
  const latestRow = sorted[0];
  const priorRow = sorted[1];
  const byFiling = (fid: number) => holdingRows.filter((h) => h.filing_id === fid).map(rowToHolding).sort((a, b) => b.value - a.value);
  const toFiling = (r: any): FilingData => ({ period: r.period, filedAt: r.filed_at, accession: r.accession, totalValue: Number(r.total_value), holdings: byFiling(r.id) });
  const latest = toFiling(latestRow);
  const prior = priorRow ? toFiling(priorRow) : undefined;
  const changes = prior ? computeChanges(latest.holdings, prior.holdings) : [];
  return { manager, latest, prior, changes };
}
```

整段替换为（`rowToHolding` 保留在其上方不动；本段只删 `key`/`computeChanges`、改 `mapDetailRows`）：

```typescript
export function mapDetailRows(manager: Manager, filingRows: any[], holdingRows: any[]): ManagerDetail {
  const byFiling = (fid: number) => holdingRows.filter((h) => h.filing_id === fid).map(rowToHolding).sort((a, b) => b.value - a.value);
  const toFiling = (r: any): FilingData => ({ period: r.period, filedAt: r.filed_at, accession: r.accession, totalValue: Number(r.total_value), holdings: byFiling(r.id) });
  const filings = filingRows.map(toFiling);
  return assembleManagerDetail(manager, filings);
}
```

- [ ] **Step 3: `getManagerDetail` 取 8 期**

找到（约 119 行）：

```typescript
  const { data: filings } = await db.from("filings").select("*").eq("cik", m.cik).order("period", { ascending: false }).limit(2);
```

改为：

```typescript
  const { data: filings } = await db.from("filings").select("*").eq("cik", m.cik).order("period", { ascending: false }).limit(8);
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: supabase.ts 相关报错消除（剩余报错应只在 source.ts / ingest / supabaseUpsert，后续任务处理）。

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/managers/supabase.ts
git commit -m "refactor(backfill): supabase 读取改用 assembleManagerDetail + limit(8)"
```

---

### Task 4: JSON 回退路径改用装配（容旧/新两种 JSON 形状）

**Files:**
- Modify: `web/src/lib/managers/source.ts:1-21`

说明：让 `jsonDetail` 同时兼容旧 JSON（`{manager, latest, prior}`）与新 JSON（`{manager, filings}`），重生数据前后都能跑。

- [ ] **Step 1: import 类型与 assemble，定义宽松 JSON 形状**

顶部找到：

```typescript
import "server-only";
import { cache } from "react";
import type { ManagerIndex, ManagerDetail, ManagerQoQ } from "@/lib/managers/types";
import { hasSupabaseEnv } from "@/lib/managers/db";
import * as supa from "@/lib/managers/supabase";
import indexJson from "@/data/13f/index.json";
```

改为：

```typescript
import "server-only";
import { cache } from "react";
import type { ManagerIndex, ManagerDetail, ManagerQoQ, Manager, FilingData } from "@/lib/managers/types";
import { assembleManagerDetail } from "@/lib/managers/assemble";
import { hasSupabaseEnv } from "@/lib/managers/db";
import * as supa from "@/lib/managers/supabase";
import indexJson from "@/data/13f/index.json";

// bundle 既可能是新形状 { manager, filings } 也可能是旧形状 { manager, latest, prior }。
type RawManagerDetail = { manager: Manager; filings?: FilingData[]; latest?: FilingData; prior?: FilingData };
```

- [ ] **Step 2: 改 `JSON_DETAILS` 类型与 `jsonDetail` 装配**

找到：

```typescript
const JSON_DETAILS = [berkshire, scion, pershing, bridgewater, duquesne, baupost] as unknown as ManagerDetail[];

function jsonIndex(): ManagerIndex { return indexJson as unknown as ManagerIndex; }
function jsonDetail(cikOrSlug: string): ManagerDetail | null {
  return JSON_DETAILS.find((d) => d.manager.cik === cikOrSlug || d.manager.slug === cikOrSlug) ?? null;
}
```

改为：

```typescript
const JSON_DETAILS = [berkshire, scion, pershing, bridgewater, duquesne, baupost] as unknown as RawManagerDetail[];

function jsonIndex(): ManagerIndex { return indexJson as unknown as ManagerIndex; }
function jsonDetail(cikOrSlug: string): ManagerDetail | null {
  const raw = JSON_DETAILS.find((d) => d.manager.cik === cikOrSlug || d.manager.slug === cikOrSlug);
  if (!raw) return null;
  // 新形状直接用 filings；旧形状从 latest/prior 兜底拼出 filings。
  const filings = raw.filings ?? [raw.latest, raw.prior].filter((f): f is FilingData => !!f);
  if (filings.length === 0) return null;
  return assembleManagerDetail(raw.manager, filings);
}
```

- [ ] **Step 3: 类型检查 + 看页面（用现有数据）**

Run: `npx tsc --noEmit`
Expected: source.ts 报错消除。

Run: `npm run dev`，看 `http://localhost:3000/zh/investors/warren-buffett`、`/zh/investors/consensus`
Expected: 页面照常渲染（此刻 filings 仍只有 2 季深，但 latest/prior/changes 装配后语义不变，无回归）。

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/managers/source.ts
git commit -m "refactor(backfill): JSON 回退路径经 assembleManagerDetail(容旧新两形状)"
```

---

### Task 5: 摄取脚本抓 8 季 + 写 `{manager, filings}`

**Files:**
- Modify: `web/scripts/ingest-13f.ts:10-17`（import 清理 + 加 assemble）
- Modify: `web/scripts/ingest-13f.ts:238-289`（删本地 `computeChanges`）
- Modify: `web/scripts/ingest-13f.ts:312-351`（重写 `ingestManager`）
- Modify: `web/scripts/ingest-13f.ts:367-379`（JSON 写出 + index summary 取 filings[0]）

- [ ] **Step 1: import assemble，移除未用的 `HoldingChange`**

找到：

```typescript
import type {
  Holding,
  FilingData,
  HoldingChange,
  Manager,
  ManagerDetail,
  ManagerIndex,
  ManagerSummary,
} from "../src/lib/managers/types.js";
```

改为：

```typescript
import type {
  Holding,
  FilingData,
  Manager,
  ManagerDetail,
  ManagerIndex,
  ManagerSummary,
} from "../src/lib/managers/types.js";
import { assembleManagerDetail } from "../src/lib/managers/assemble.js";
```

- [ ] **Step 2: 删除脚本内本地 `computeChanges`**

找到（约 238-289 行）整个本地函数定义：

```typescript
function computeChanges(latest: Holding[], prior: Holding[]): HoldingChange[] {
  const latestMap = new Map(latest.map((h) => [holdingKey(h), h]));
  const priorMap = new Map(prior.map((h) => [holdingKey(h), h]));
  ...
  for (const [key, ph] of priorMap) {
    if (!latestMap.has(key)) {
      ...
    }
  }
  return changes;
}
```

**整段删除**（装配改由 `assembleManagerDetail` 负责；`holdingKey`/`aggregateByCusip`/`buildFilingData` 保留不动）。

- [ ] **Step 3: 重写 `ingestManager` 循环抓全部季度**

找到（约 312-351 行）整个 `ingestManager` 函数体：

```typescript
async function ingestManager(seed: Omit<Manager, "name">): Promise<ManagerDetail | null> {
  const cikInt = seed.cik.replace(/^0+/, "");
  console.log(`\n[${seed.slug}] Fetching submissions...`);

  const { name, filings } = await getLatestFilings(seed.cik, 2);
  console.log(`[${seed.slug}] Resolved name: ${name}, filings found: ${filings.length}`);

  if (filings.length === 0) {
    console.warn(`[${seed.slug}] No 13F-HR filings found, skipping.`);
    return null;
  }

  const manager: Manager = { cik: seed.cik, slug: seed.slug, name, person: seed.person };

  // Parse latest
  const latestMeta = filings[0];
  console.log(`[${seed.slug}] Parsing latest filing ${latestMeta.accession} (${latestMeta.period})...`);
  const latestRaw = await parseInfoTable(cikInt, latestMeta.accession);
  await sleep(300);
  const latest = buildFilingData(latestMeta, latestRaw);
  console.log(`[${seed.slug}] Latest: ${latest.holdings.length} holdings, totalValue $${latest.totalValue.toLocaleString()}`);

  // Parse prior (if exists)
  let prior: FilingData | undefined;
  if (filings.length >= 2) {
    const priorMeta = filings[1];
    console.log(`[${seed.slug}] Parsing prior filing ${priorMeta.accession} (${priorMeta.period})...`);
    try {
      const priorRaw = await parseInfoTable(cikInt, priorMeta.accession);
      await sleep(300);
      prior = buildFilingData(priorMeta, priorRaw);
      console.log(`[${seed.slug}] Prior: ${prior.holdings.length} holdings`);
    } catch (err) {
      console.warn(`[${seed.slug}] Failed to parse prior filing: ${err instanceof Error ? err.message : err}`);
    }
  }

  const changes = prior ? computeChanges(latest.holdings, prior.holdings) : [];

  return { manager, latest, prior, changes };
}
```

整体替换为：

```typescript
const QUARTERS_TO_FETCH = 8;

async function ingestManager(seed: Omit<Manager, "name">): Promise<ManagerDetail | null> {
  const cikInt = seed.cik.replace(/^0+/, "");
  console.log(`\n[${seed.slug}] Fetching submissions...`);

  const { name, filings: metas } = await getLatestFilings(seed.cik, QUARTERS_TO_FETCH);
  console.log(`[${seed.slug}] Resolved name: ${name}, filings found: ${metas.length}`);

  if (metas.length === 0) {
    console.warn(`[${seed.slug}] No 13F-HR filings found, skipping.`);
    return null;
  }

  const manager: Manager = { cik: seed.cik, slug: seed.slug, name, person: seed.person };

  // 逐期解析（含礼貌限速）；单期解析失败仅跳过该期，不影响其余季度。
  const filings: FilingData[] = [];
  for (const meta of metas) {
    console.log(`[${seed.slug}] Parsing filing ${meta.accession} (${meta.period})...`);
    try {
      const raw = await parseInfoTable(cikInt, meta.accession);
      await sleep(300);
      const fd = buildFilingData(meta, raw);
      filings.push(fd);
      console.log(`[${seed.slug}] ${meta.period}: ${fd.holdings.length} holdings, $${fd.totalValue.toLocaleString()}`);
    } catch (err) {
      console.warn(`[${seed.slug}] Failed to parse ${meta.period}: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (filings.length === 0) {
    console.warn(`[${seed.slug}] No filings parsed, skipping.`);
    return null;
  }

  return assembleManagerDetail(manager, filings);
}
```

- [ ] **Step 4: JSON 只写 `{manager, filings}`，index summary 取 `filings[0]`**

找到（约 367-379 行）：

```typescript
      const outPath = path.join(OUT_DIR, `${seed.slug}.json`);
      fs.writeFileSync(outPath, JSON.stringify(detail, null, 2));
      console.log(`[${seed.slug}] Written to ${outPath}`);

      const topHolding = detail.latest.holdings[0]?.issuer ?? "";
      summaries.push({
        cik: detail.manager.cik,
        slug: detail.manager.slug,
        name: detail.manager.name,
        person: detail.manager.person,
        period: detail.latest.period,
        totalValue: detail.latest.totalValue,
        holdingCount: detail.latest.holdings.length,
        topHolding,
      });
```

改为（写出去冗余的 latest/prior/changes，只留单一来源 filings）：

```typescript
      const outPath = path.join(OUT_DIR, `${seed.slug}.json`);
      fs.writeFileSync(outPath, JSON.stringify({ manager: detail.manager, filings: detail.filings }, null, 2));
      console.log(`[${seed.slug}] Written to ${outPath} (${detail.filings.length} quarters)`);

      const top = detail.filings[0];
      const topHolding = top.holdings[0]?.issuer ?? "";
      summaries.push({
        cik: detail.manager.cik,
        slug: detail.manager.slug,
        name: detail.manager.name,
        person: detail.manager.person,
        period: top.period,
        totalValue: top.totalValue,
        holdingCount: top.holdings.length,
        topHolding,
      });
```

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: ingest 相关报错消除（剩 supabaseUpsert 一处，下个任务处理）。

- [ ] **Step 6: Commit**

```bash
git add web/scripts/ingest-13f.ts
git commit -m "feat(backfill): ingest 抓8季+经assemble装配+JSON只存filings"
```

---

### Task 6: upsert 载荷改用 `d.filings`

**Files:**
- Modify: `web/scripts/lib/supabaseUpsert.ts:22-29`（`buildUpsertPayload`）

- [ ] **Step 1: 用 `d.filings` 取代 `[d.latest, ...prior]`**

找到：

```typescript
export function buildUpsertPayload(d: ManagerDetail): UpsertPayload {
  const filings: FilingData[] = [d.latest, ...(d.prior ? [d.prior] : [])];
  return {
    manager: d.manager,
    filings: filings.map((f) => filingRow(d.manager.cik, f)),
    holdingsByAccession: Object.fromEntries(filings.map((f) => [f.accession, holdingRows(f)])),
  };
}
```

改为：

```typescript
export function buildUpsertPayload(d: ManagerDetail): UpsertPayload {
  const filings: FilingData[] = d.filings;
  return {
    manager: d.manager,
    filings: filings.map((f) => filingRow(d.manager.cik, f)),
    holdingsByAccession: Object.fromEntries(filings.map((f) => [f.accession, holdingRows(f)])),
  };
}
```

- [ ] **Step 2: 全量类型检查**

Run: `npx tsc --noEmit`
Expected: **全绿，无报错。**

- [ ] **Step 3: Commit**

```bash
git add web/scripts/lib/supabaseUpsert.ts
git commit -m "feat(backfill): upsert 载荷取自 d.filings(全部季度入库)"
```

---

### Task 7: 重生数据（8 季）+ 全量验证

**Files:**
- 重写：`web/src/data/13f/*.json`（6 个 bundle，运行脚本产出）

前置：需可访问 SEC EDGAR（公开，无需鉴权）。若仓库根 `.env.local` 含 Supabase 凭据，脚本会同时把 8 季 upsert 到 Supabase（幂等）；无凭据则只重生 JSON。

- [ ] **Step 1: 跑摄取脚本重生 8 季数据**

Run: `npx tsx scripts/ingest-13f.ts`
Expected: 每位投资人日志显示解析多期（最多 8）、写出 `... (N quarters)`；末尾若有凭据则 `upserted to Supabase`。运行时间比之前长（多抓 ~4×），属正常。

> 注：脚本末尾会顺带 `enrichSecurities` 与 `computeAndStoreConsensus`（重算共识）——这是既有行为，consensus 仍按 latest/prior 口径，语义不变。

- [ ] **Step 2: 确认 JSON 已变新形状**

Run: `node -e "const d=require('./src/data/13f/berkshire-hathaway.json'); console.log('keys:', Object.keys(d), 'quarters:', d.filings?.length)"`
Expected: `keys: [ 'manager', 'filings' ]`，`quarters:` 为 2–8 之间（取决于该投资人 SEC 可得历史）。

- [ ] **Step 3: 全量类型检查 + 生产构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 均 PASS。

- [ ] **Step 4: 人工抽查关键页无回归**

Run: `npm run dev`，逐页看：
- `/zh/investors/warren-buffett` 与 `/en/investors/warren-buffett`：持仓表、QoQ 权重、清仓行、AI 叙述照常。
- `/zh/investors/consensus`、`/zh/investors/buys`、`/zh/investors/sells`：榜单与解读句照常。
- `/zh/stocks/<任一 ticker>`：个股页照常。

Expected：全部正常渲染，`latest/prior/changes` 表现与改前一致（装配语义不变）。

- [ ] **Step 5: 边界确认**

确认历史不足的投资人（`filings.length < 8`）页面不报错：`latest` 仍为最新一期、`prior` 可能为某较早期、`changes` 正常。若某投资人只有 1 期，`prior` 为 undefined、`changes=[]`、QoQ 不显示（与改前同）。

- [ ] **Step 6: Commit 重生数据**

```bash
git add web/src/data/13f/
git commit -m "data(backfill): 重生 6 个 bundle 为多季(最多8)结构"
```

---

## 验收对照（spec §7）

1. `ManagerDetail.filings` 降序、≤8；latest/prior/changes 装配语义不变 → Task 1 + Task 2（`assembleManagerDetail`）+ Task 7 Step 2/4。
2. 两条读取路径都带 `filings[]` → Task 3（supabase）+ Task 4（json，容旧新）。
3. `computeChanges` 仅存 `assemble.ts` → Task 2 新增、Task 3 删 supabase 本地、Task 5 删 ingest 本地。
4. 现有页面无回归 → Task 7 Step 3/4。
5. ingest 幂等（accession 唯一）+ 6 bundle 重生 → Task 7 Step 1/6（幂等性由既有 `upsertManagerDetail` onConflict 保证）。
6. SEC 公平访问限速 → 保留既有 `sleep(250/300/500)` 节流（Task 5 循环内 `sleep(300)`/主循环 `sleep(500)` 不变）。

> 备注：装配是唯一行为变更点（spec §8）。本计划确保**所有** ManagerDetail 构造入口都经 `assembleManagerDetail`：supabase `mapDetailRows`（Task 3）、json `jsonDetail`（Task 4）、ingest `ingestManager`（Task 5）。无第四个构造入口。
