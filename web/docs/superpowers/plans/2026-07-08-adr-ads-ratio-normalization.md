# ADR/ADS 比例归一化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让估值引擎对 ADR 用「每 ADS」口径（普通股数 ÷ ADS 比例），消除每股价值带与每 ADS 现价差 N 倍造成的假高估/假便宜（如 PDD 假 above、FMS 假 strike）。

**Architecture:** `securities` 加 `ads_ratio` 列（每 1 ADS 折合几股普通股，人工策展）。唯一注入点 `fundamentalsToFloorInput` 把 `shares_diluted / adsRatio`，下游 EPV/资产底/net-net/OE-DCF/GV 每股全自动变成每 ADS。`security_type='ADR'` 且 `ads_ratio` 为 NULL → 抑制估值（宁可留白不显示错带）。同源修研究页 `market_cap`。

**Tech Stack:** TypeScript / Next 16 App Router (RSC) / Supabase PostgREST / tsx 脚本 / `.check.ts` 自测（无 Jest/Vitest）。

## Global Constraints

- 回复正文/文档正文一律中文（代码/术语/路径除外）。
- 提交/推送只在用户要求时做；PR 走网页（非 collaborator，`gh pr create` 会失败）。
- 无测试框架：验证走 `tsx <file>.check.ts` + `npx tsc --noEmit` + 真数据对拍。
- **绝不用带 bug 的代码跑 `valuation:ingest`**（会污染生产快照）。跑 ingest 前 tsc 必须全绿、`.check.ts` 必须全过。
- DDL 本机跑不了（无 DB 密码 / service key 走 PostgREST 无 DDL 权限）→ migration 由用户在 Supabase SQL Editor 手动跑。
- 数据准确性：ADS 比例已双源核定（见 Task 7 表），改动不得擅自改数。
- Next 16 破坏性变更：动 app/ 代码前看 `node_modules/next/dist/docs/`。
- 分支：`fix/valuation-adr-ads-ratio`（off `db-foundation`）。

---

## 文件结构

- `web/supabase/migrations/20260708_add_ads_ratio.sql`（新）+ `web/supabase/schema.sql`（改）— `securities.ads_ratio numeric`。
- `web/src/lib/valuation/adsNormalization.ts`（新）+ `.check.ts`（新）— 纯决策：ADR&NULL→抑制，否则 ratio=值 ?? 1。
- `web/src/lib/valuation/fundamentalsToFloorInput.ts`（改）+ `.check.ts`（改）— 加 `adsRatio` 末参，除 `shares_diluted`。
- `web/src/lib/managers/securities.ts`（改）— 加 `getSecurityMeta(ticker)` 单票读 `{securityType, adsRatio}`。
- `web/scripts/valuation-ingest.ts`（改）— bulk 读 `ads_ratio`；循环内 resolve+抑制/传参。
- `web/src/app/[lang]/stocks/[ticker]/page.tsx`（改）— 单票 resolve+抑制/传参。
- `web/src/lib/research/valuation/buildValuationData.ts`（改）+ `calculateValuation.ts`（改）— 市值口径同源修。
- `web/scripts/backfill-ads-ratio.ts`（新）+ `web/package.json`（改）— 19 只核定比例回填。

---

## Task 1: 加 `securities.ads_ratio` 列（migration + schema）

**Files:**
- Create: `web/supabase/migrations/20260708_add_ads_ratio.sql`
- Modify: `web/supabase/schema.sql:42`（`security_type` 列附近）

**Interfaces:**
- Produces: `securities.ads_ratio numeric`（每 1 ADS 折合几股标的普通股；NULL=未策展）。下游 Task 4/5/6/7 读它。

- [ ] **Step 1: 写 migration SQL**

Create `web/supabase/migrations/20260708_add_ads_ratio.sql`:

```sql
-- 每 1 ADS 折合几股标的普通股(ordinary shares per ADS)。
-- 仅 security_type='ADR' 行有意义;NULL=未策展→估值层对该 ADR 抑制(不显示未归一化的错带)。
-- 非 ADR(Common Stock / NY Reg Shrs)天然 1:1,不读此列。
alter table securities add column if not exists ads_ratio numeric;

comment on column securities.ads_ratio is
  'Ordinary shares per 1 ADS (ADR only). NULL => valuation suppressed for that ADR.';
```

- [ ] **Step 2: 同步 schema.sql**

在 `web/supabase/schema.sql` 的 `securities` 表定义里，`security_type text,` 那行下方加：

```sql
  ads_ratio numeric,            -- 每 1 ADS 折合几股普通股(ADR only);NULL=未策展→估值抑制
```

- [ ] **Step 3: 提交（DDL 由用户跑）**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/supabase/migrations/20260708_add_ads_ratio.sql web/supabase/schema.sql
git commit -m "feat(db): securities.ads_ratio 列(ADR 每股折合比例,归一化用)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **上线时**：用户在 Supabase SQL Editor 跑 migration Step 1 的 SQL。本 Task 无本机可跑测试（DDL 权限受限）；正确性由 Task 4/7 的真数据对拍兜底。

---

## Task 2: `adsNormalization` 纯决策 helper（TDD）

**Files:**
- Create: `web/src/lib/valuation/adsNormalization.ts`
- Test: `web/src/lib/valuation/adsNormalization.check.ts`
- Modify: `web/src/lib/valuation/index.ts:9`（导出）

**Interfaces:**
- Produces: `resolveAds(securityType: string | null | undefined, adsRatio: number | null | undefined): { suppressed: boolean; ratio: number }`。Task 4/5/6 消费。

- [ ] **Step 1: 写失败测试**

Create `web/src/lib/valuation/adsNormalization.check.ts`:

```ts
import assert from "node:assert";
import { resolveAds } from "./adsNormalization";

// 1) ADR 有比例 → 用该比例,不抑制
assert.deepStrictEqual(resolveAds("ADR", 4), { suppressed: false, ratio: 4 });

// 2) ADR 比例为 NULL → 抑制(不显示未归一化错带)
assert.deepStrictEqual(resolveAds("ADR", null), { suppressed: true, ratio: 1 });

// 3) 非 ADR(普通股/NY Reg Shrs) → 恒 1:1,永不抑制,即便 ads_ratio 碰巧有值也忽略
assert.deepStrictEqual(resolveAds("Common Stock", null), { suppressed: false, ratio: 1 });
assert.deepStrictEqual(resolveAds("NY Reg Shrs", null), { suppressed: false, ratio: 1 });

// 4) 1:1 的 ADR(WB/NICE/VALE…策展写了 1)→ 用 1,不抑制
assert.deepStrictEqual(resolveAds("ADR", 1), { suppressed: false, ratio: 1 });

// 5) 分数比例(FMS=0.5)→ 原样返回
assert.deepStrictEqual(resolveAds("ADR", 0.5), { suppressed: false, ratio: 0.5 });

// 6) security_type 未知(null/undefined)→ 当非 ADR,1:1
assert.deepStrictEqual(resolveAds(null, null), { suppressed: false, ratio: 1 });
assert.deepStrictEqual(resolveAds(undefined, undefined), { suppressed: false, ratio: 1 });

// 7) 脏比例(<=0 / 非有限)当未策展 → 若是 ADR 则抑制
assert.deepStrictEqual(resolveAds("ADR", 0), { suppressed: true, ratio: 1 });
assert.deepStrictEqual(resolveAds("ADR", Number.NaN), { suppressed: true, ratio: 1 });

console.log("adsNormalization.check.ts ✓");
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/adsNormalization.check.ts`
Expected: FAIL（`Cannot find module './adsNormalization'`）

- [ ] **Step 3: 写实现**

Create `web/src/lib/valuation/adsNormalization.ts`:

```ts
/**
 * ADR/ADS 归一化决策(纯函数)。
 * SEC 20-F 的 shares 是标的普通股数;市场价是每 ADS。多数 ADR 满足 1 ADS = N 股普通股。
 * ratio = 每 1 ADS 折合几股普通股。engine 用 shares_diluted / ratio 得 ADS 张数,使每股口径=每 ADS。
 *
 * 抑制:security_type='ADR' 但没有可信 ratio(NULL/<=0/非有限)→ 该 ADR 不出估值,
 * 宁可留白也不拿未归一化的带去比每 ADS 价(与 BABA/TSM 的 no-floor 同待遇)。
 * 非 ADR(Common Stock / NY Reg Shrs 等外国普通股上市)天然 1:1,永不抑制、永用 1。
 */
export function resolveAds(
  securityType: string | null | undefined,
  adsRatio: number | null | undefined,
): { suppressed: boolean; ratio: number } {
  const isAdr = securityType === "ADR";
  const valid = typeof adsRatio === "number" && Number.isFinite(adsRatio) && adsRatio > 0;
  if (!isAdr) return { suppressed: false, ratio: 1 };
  if (!valid) return { suppressed: true, ratio: 1 };
  return { suppressed: false, ratio: adsRatio as number };
}
```

- [ ] **Step 4: 导出**

在 `web/src/lib/valuation/index.ts` 末尾加：

```ts
export { resolveAds } from "./adsNormalization";
```

- [ ] **Step 5: 跑测试确认通过 + tsc**

Run: `cd web && npx tsx src/lib/valuation/adsNormalization.check.ts && npx tsc --noEmit`
Expected: 打印 `adsNormalization.check.ts ✓`，tsc 无输出

- [ ] **Step 6: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/lib/valuation/adsNormalization.ts web/src/lib/valuation/adsNormalization.check.ts web/src/lib/valuation/index.ts
git commit -m "feat(valuation): resolveAds — ADR 归一化/抑制纯决策

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `fundamentalsToFloorInput` 加 `adsRatio` 除法（TDD）

**Files:**
- Modify: `web/src/lib/valuation/fundamentalsToFloorInput.ts:7-45`
- Test: `web/src/lib/valuation/fundamentalsToFloorInput.check.ts`

**Interfaces:**
- Consumes: 无（叶子改动）。
- Produces: `fundamentalsToFloorInput(ticker, companyName, rows, adsRatio?: number)` — 末位可选参，缺省 1；每年 `shares_diluted` 变为 `shares_diluted / adsRatio`。Task 4/5 传第 4 参。

- [ ] **Step 1: 写失败测试**

在 `web/src/lib/valuation/fundamentalsToFloorInput.check.ts` 末尾（`console.log` 前）追加：

```ts
// ADR 归一化:adsRatio=4 → shares_diluted 减为 1/4(每股口径 ×4,对齐每 ADS 价)
{
  const rows = [{
    fiscal_period: "FY", fiscal_year: 2025, period_end: "2025-12-31",
    shares_diluted: 5_929_576_000, net_income: 13_991_297_000,
  }] as unknown as Parameters<typeof fundamentalsToFloorInput>[2];

  const base = fundamentalsToFloorInput("PDD", "PDD", rows);
  assert.strictEqual(base.years[0].shares_diluted, 5_929_576_000, "缺省 adsRatio=1 → shares 不变");

  const norm = fundamentalsToFloorInput("PDD", "PDD", rows, 4);
  assert.strictEqual(norm.years[0].shares_diluted, 5_929_576_000 / 4, "adsRatio=4 → shares 减为 1/4");

  const one = fundamentalsToFloorInput("PDD", "PDD", rows, 1);
  assert.strictEqual(one.years[0].shares_diluted, 5_929_576_000, "adsRatio=1 → 恒等");
}
```

（若该文件顶部无 `import assert` / `import { fundamentalsToFloorInput }`，按文件现有 import 风格补上。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/fundamentalsToFloorInput.check.ts`
Expected: FAIL（`adsRatio=4 → shares 减为 1/4`，因当前忽略第 4 参，值仍是原值）

- [ ] **Step 3: 写实现**

改 `web/src/lib/valuation/fundamentalsToFloorInput.ts`。函数签名加末参，`shares_diluted` 行改为除法：

```ts
export function fundamentalsToFloorInput(
  ticker: string,
  companyName: string | null | undefined,
  rows: FundamentalPeriod[] | undefined,
  adsRatio: number = 1,
): ValuationFloorInput {
```

把第 30 行

```ts
      shares_diluted: u(r.shares_diluted),
```

改为

```ts
      // ADR 归一化:SEC shares 是普通股数,÷ADS比例 = ADS 张数,使每股口径对齐每 ADS 价。
      // adsRatio 默认 1(非 ADR / 未传)→ 恒等,零行为变化。
      shares_diluted: r.shares_diluted == null ? undefined : r.shares_diluted / adsRatio,
```

- [ ] **Step 4: 跑测试确认通过 + tsc**

Run: `cd web && npx tsx src/lib/valuation/fundamentalsToFloorInput.check.ts && npx tsc --noEmit`
Expected: 测试 ✓，tsc 无输出

- [ ] **Step 5: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/lib/valuation/fundamentalsToFloorInput.ts web/src/lib/valuation/fundamentalsToFloorInput.check.ts
git commit -m "feat(valuation): fundamentalsToFloorInput 支持 adsRatio(shares 归一化到 ADS)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `getSecurityMeta` 单票读取器

**Files:**
- Modify: `web/src/lib/managers/securities.ts`（末尾加导出）

**Interfaces:**
- Consumes: 现有 supabase 读取模式（见文件内 `getTickerExchangeMap` 用的 `db.from("securities")`）。
- Produces: `getSecurityMeta(ticker: string): Promise<{ securityType: string | null; adsRatio: number | null }>`。Task 5/6 消费。

- [ ] **Step 1: 看现有 client 获取方式**

Run: `cd web && sed -n '1,45p' src/lib/managers/securities.ts`
Expected: 看清文件顶部如何拿 supabase client（复用同一方式，别新造）。

- [ ] **Step 2: 加读取器**

在 `web/src/lib/managers/securities.ts` 末尾追加（`cache` 与 client 获取沿用文件内既有写法；下例假设文件已 `import { cache } from "react"` 且有 `getDb()`/等价物——按 Step 1 所见替换 `<client>`）：

```ts
/** 单票证券元数据:估值层做 ADR/ADS 归一化用。security_type 判是否 ADR,ads_ratio 是每股折合比例。 */
export const getSecurityMeta = cache(
  async (ticker: string): Promise<{ securityType: string | null; adsRatio: number | null }> => {
    const db = <client>; // 与本文件其他读取器一致
    const { data, error } = await db
      .from("securities")
      .select("security_type,ads_ratio")
      .eq("ticker", ticker.toUpperCase())
      .maybeSingle();
    if (error || !data) return { securityType: null, adsRatio: null };
    return {
      securityType: (data.security_type as string | null) ?? null,
      adsRatio: (data.ads_ratio as number | null) ?? null,
    };
  },
);
```

- [ ] **Step 3: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出

- [ ] **Step 4: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/lib/managers/securities.ts
git commit -m "feat(securities): getSecurityMeta 单票读 security_type+ads_ratio

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `valuation-ingest` 接线（读比例 / 抑制 / 传参）

**Files:**
- Modify: `web/scripts/valuation-ingest.ts:80-103`

**Interfaces:**
- Consumes: `resolveAds`（Task 2）、`fundamentalsToFloorInput(...,adsRatio)`（Task 3）。
- Produces: 快照对 ADR 用每 ADS 口径；ADR&NULL 比例的票被抑制（不入表）。

- [ ] **Step 1: bulk 读扩到 ads_ratio**

把 `web/scripts/valuation-ingest.ts` 的 secTypeMap 加载块（第 80-87 行）改为同时读 `ads_ratio` 并多建一张 `adsRatioMap`：

```ts
  const secTypeMap = new Map<string, string | null>();
  const adsRatioMap = new Map<string, number | null>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("securities").select("ticker,security_type,ads_ratio").range(from, from + 999);
    if (error) throw new Error(`securities 读取失败: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) {
      const tk = String(r.ticker).toUpperCase();
      secTypeMap.set(tk, (r.security_type as string | null) ?? null);
      adsRatioMap.set(tk, (r.ads_ratio as number | null) ?? null);
    }
    if (data.length < 1000) break;
  }
```

- [ ] **Step 2: import resolveAds**

在 `web/scripts/valuation-ingest.ts` 顶部估值 import 块（`deriveValuationVerdict,` 附近）加 `resolveAds,`：

```ts
import {
  fundamentalsToFloorInput,
  computeValuationFloor,
  deriveStrikeZone,
  deriveOeDcf,
  reconcileMethods,
  deriveValuationVerdict,
  resolveAds,
} from "@/lib/valuation";
```

- [ ] **Step 3: 循环内 resolve + 抑制 + 传参**

把主循环里（第 100-103 行）：

```ts
    if (!isOperatingSecurity(secTypeMap.get(ticker))) { excludedNonOperating++; continue; }
    try {
      const sec = await getSecCompanyData(ticker);
      const floorInput = fundamentalsToFloorInput(ticker, ticker, sec.annual);
```

改为：

```ts
    if (!isOperatingSecurity(secTypeMap.get(ticker))) { excludedNonOperating++; continue; }
    // ADR/ADS 归一化:ADR 且比例已策展 → 用每 ADS 口径;ADR 但比例缺 → 抑制(不出估值)。
    const ads = resolveAds(secTypeMap.get(ticker), adsRatioMap.get(ticker));
    if (ads.suppressed) { adrSuppressed++; continue; }
    try {
      const sec = await getSecCompanyData(ticker);
      const floorInput = fundamentalsToFloorInput(ticker, ticker, sec.annual, ads.ratio);
```

并在计数器声明处（第 96 行 `let valued = 0, skipped = 0, excludedNonOperating = 0;`）加 `adrSuppressed`：

```ts
  let valued = 0, skipped = 0, excludedNonOperating = 0, adrSuppressed = 0;
```

- [ ] **Step 4: 收尾日志带上抑制计数**

找脚本末尾打印汇总的 `console.log`（含 `excludedNonOperating` 的那行），把 `adrSuppressed` 一并输出，例如：

```ts
  console.log(`入表 ${valued} / 跳过 ${skipped} / 排除非经营性 ${excludedNonOperating} / ADR未策展抑制 ${adrSuppressed}`);
```

（按脚本现有汇总行的实际文案就地补 `adrSuppressed`，别新造重复行。）

- [ ] **Step 5: tsc**

Run: `cd web && npx tsc --noEmit -p scripts/tsconfig.json`
Expected: 无输出

> 本 Task **不在此跑 ingest**（要等 Task 7 backfill 写完比例、且 DDL 已上线）。跑 ingest 是 Task 8 的上线步骤。

- [ ] **Step 6: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/scripts/valuation-ingest.ts
git commit -m "feat(valuation-ingest): ADR 按 ads_ratio 归一化,未策展 ADR 抑制

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 个股页接线（实时算那条 + 卡片抑制）

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx:353-360`

**Interfaces:**
- Consumes: `getSecurityMeta`（Task 4）、`resolveAds`（Task 2）、`fundamentalsToFloorInput(...,adsRatio)`（Task 3）。
- Produces: 个股页估值卡对 ADR 用每 ADS 口径；ADR&NULL → 走 no-floor 路径（卡片以既有"无每股估值"分支渲染）。

- [ ] **Step 1: import**

确认 `page.tsx` 顶部已从 `@/lib/valuation` 导入 `fundamentalsToFloorInput`/`computeValuationFloor` 等；在同一 import 加 `resolveAds`，并从 `@/lib/managers/securities` 加 `getSecurityMeta`（若该文件未 import 该模块则新增一行 import）。

- [ ] **Step 2: 加载比例 + 抑制/传参**

把第 353-355 行：

```ts
  const sec = await getSecCompanyData(ticker);
  const floorInput = fundamentalsToFloorInput(ticker, issuer, sec.annual);
  const valuationFloor = computeValuationFloor(floorInput);
```

改为：

```ts
  const sec = await getSecCompanyData(ticker);
  // ADR/ADS 归一化:ADR 用每 ADS 口径;ADR 但比例未策展 → 视同无地板(卡片走 no-floor 分支,不显示错带)。
  const { securityType, adsRatio } = await getSecurityMeta(ticker);
  const ads = resolveAds(securityType, adsRatio);
  const floorInput = fundamentalsToFloorInput(ticker, issuer, sec.annual, ads.ratio);
  const valuationFloor = ads.suppressed ? undefined : computeValuationFloor(floorInput);
```

> 后续 `valuationFloor?.kind === "floor"` 的所有分支（strikeZone/oeDcf/reconciliation/卡片）已对 `undefined` 做了保护（当前"薄数据→undefined 不渲染"路径），故抑制态自然复用既有 no-floor 行为，无需额外改卡片组件。

- [ ] **Step 3: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出

- [ ] **Step 4: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(stock-page): 估值卡按 ads_ratio 归一化,未策展 ADR 走 no-floor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 研究页市值口径同源修

**Files:**
- Modify: `web/src/lib/research/valuation/calculateValuation.ts:13-18`（`sharesOutstanding`）
- Modify: `web/src/lib/research/valuation/buildValuationData.ts`

**Interfaces:**
- Consumes: `getSecurityMeta`（Task 4）、`resolveAds`（Task 2）。
- Produces: 研究页 `market_cap`/`P/E`/`P/S`/`EV`/收益率对 ADR 正确（每 ADS 价 × ADS 张数）。

- [ ] **Step 1: calculateValuation 接受 adsRatio 并除股数**

改 `web/src/lib/research/valuation/calculateValuation.ts` 的 `sharesOutstanding`：

```ts
function sharesOutstanding(input: ValuationInput): number | undefined {
  const raw =
    input.normalized_financials?.shares_outstanding ??
    input.normalized_financials?.shares_diluted ??
    input.normalized_financials?.share_count;
  if (raw == null) return undefined;
  // ADR 归一化:普通股数 ÷ ADS 比例 = ADS 张数,与每 ADS 价相乘才得正确市值。
  const ratio = (input as { ads_ratio?: number }).ads_ratio;
  return typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? raw / ratio : raw;
}
```

- [ ] **Step 2: buildValuationForResearchData 注入 ads_ratio**

改 `web/src/lib/research/valuation/buildValuationData.ts`：

```ts
import type { NormalizedResearchData } from "../schemas/researchSchemas";
import { calculateValuation } from "./calculateValuation";
import { fetchStorePrice, mockPrice } from "./priceProvider";
import type { PriceData, ValuationResult } from "./types";
import { getSecurityMeta } from "@/lib/managers/securities";
import { resolveAds } from "@/lib/valuation";

export async function buildValuationForResearchData(
  normalizedData: NormalizedResearchData,
  options: { mock?: boolean; price?: PriceData | null } = {},
): Promise<ValuationResult> {
  const price = options.mock
    ? (options.price ?? mockPrice(normalizedData.ticker))
    : (options.price ?? (await fetchStorePrice(normalizedData.ticker)));
  // ADR/ADS 归一化(市值口径):mock 路径不查库,保持 1。
  let adsRatio = 1;
  if (!options.mock) {
    const { securityType, adsRatio: r } = await getSecurityMeta(normalizedData.ticker);
    const ads = resolveAds(securityType, r);
    // 未策展 ADR:比例未知 → 用 1 会得错市值,故此处传 undefined 让市值不计算(降级留白)。
    adsRatio = ads.suppressed ? Number.NaN : ads.ratio;
  }
  return calculateValuation({ ...normalizedData, price, ads_ratio: adsRatio });
}
```

> `ads_ratio: NaN` → `sharesOutstanding` 里 `Number.isFinite` 判假 → 返回原始普通股数？不行。改用显式：抑制时传 `ads_ratio` 为一个"令市值降级"的信号。**修正**：抑制态直接让 shares 变 undefined —— 见 Step 3 收敛。

- [ ] **Step 3: 收敛抑制态（避免 NaN 歧义）**

把 Step 1 的 `sharesOutstanding` 末行改为对"抑制信号"显式降级：约定 `ads_ratio <= 0 或 NaN` = 抑制 → 返回 `undefined`（市值不算）；`>0` 有限 = 正常除。Step 2 抑制态传 `ads_ratio: -1`：

`calculateValuation.ts`：

```ts
  const ratio = (input as { ads_ratio?: number }).ads_ratio;
  if (ratio != null && (!Number.isFinite(ratio) || ratio <= 0)) return undefined; // 抑制信号 → 市值降级
  return typeof ratio === "number" && ratio > 0 ? raw / ratio : raw;
```

`buildValuationData.ts` Step 2 里把 `adsRatio = ads.suppressed ? Number.NaN : ads.ratio;` 改为 `adsRatio = ads.suppressed ? -1 : ads.ratio;`。

- [ ] **Step 4: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出（若 `ValuationInput` 类型不含 `ads_ratio`，用的是 `(input as {...})` 断言，不需改类型；若报错则在 `ValuationInput` 加 `ads_ratio?: number` 可选字段）

- [ ] **Step 5: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/lib/research/valuation/calculateValuation.ts web/src/lib/research/valuation/buildValuationData.ts
git commit -m "fix(research): 市值/PE 对 ADR 按 ads_ratio 归一化(同源修)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 比例策展回填脚本 + 19 只核定值

**Files:**
- Create: `web/scripts/backfill-ads-ratio.ts`
- Modify: `web/package.json`（scripts 加一行）

**Interfaces:**
- Consumes: `securities.ads_ratio` 列（Task 1，需先上线 DDL）。
- Produces: 19 只 ADR 的 `ads_ratio` 写入 DB。

**已双源核定的比例（每 1 ADS 折合几股普通股）** —— 权威源=各公司 20-F/存托条款，数据自检=SEC 普通股 ÷ 市场 ADS 张数（PDD 5.69B÷1.4B=4.06 ✓）。**改这些数前须重新查证**：

| Ticker | ratio | 备注 |
|---|---|---|
| PDD | 4 | |
| JD | 2 | |
| NTES | 5 | 2020 年由 25 改 5 |
| EDU | 10 | 2022 年由 1 改 10 |
| WB | 1 | 1:1 ADR |
| NICE | 1 | 以色列 1:1 |
| QFIN | 2 | |
| BEKE | 3 | |
| SIMO | 4 | |
| TCOM | 1 | 2021 年由 1/8 改 1 |
| VALE | 1 | |
| ARM | 1 | |
| HTHT | 10 | 2021 年由 1 改 10 |
| JOYY | 20 | |
| NOAH | 5 | 2023 年细分后 |
| ATAT | 3 | |
| FINV | 5 | |
| HDB | 3 | |
| FMS | 0.5 | 2 ADS = 1 股(2012 拆分) |

- [ ] **Step 1: 写回填脚本**

Create `web/scripts/backfill-ads-ratio.ts`:

```ts
/**
 * backfill-ads-ratio.ts — 写入 securities.ads_ratio(每 1 ADS 折合几股普通股)。
 * 仅 ADR 需要;比例经双源核定(公司存托条款 + SEC普通股/市场ADS张数自检)。幂等:直接 upsert 覆盖。
 * 需先跑 20260708_add_ads_ratio migration。
 * Run: cd web && npx tsx scripts/backfill-ads-ratio.ts
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../../.env.local");
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...out, ...process.env } as Record<string, string>;
}

// 每 1 ADS 折合几股普通股。双源核定(见 plan Task 8 表);改数前重新查证。
const ADS_RATIO: Record<string, number> = {
  PDD: 4, JD: 2, NTES: 5, EDU: 10, WB: 1, NICE: 1, QFIN: 2, BEKE: 3, SIMO: 4,
  TCOM: 1, VALE: 1, ARM: 1, HTHT: 10, JOYY: 20, NOAH: 5, ATAT: 3, FINV: 5, HDB: 3, FMS: 0.5,
};

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });

  let ok = 0, missing: string[] = [], mismatch: string[] = [];
  for (const [ticker, ratio] of Object.entries(ADS_RATIO)) {
    // 只更新已存在且确为 ADR 的行(防呆:写错票不留脏数据)。
    const { data: row } = await db.from("securities").select("ticker,security_type").eq("ticker", ticker).maybeSingle();
    if (!row) { missing.push(ticker); continue; }
    if (row.security_type !== "ADR") { mismatch.push(`${ticker}(${row.security_type})`); continue; }
    const { error } = await db.from("securities").update({ ads_ratio: ratio }).eq("ticker", ticker);
    if (error) throw new Error(`${ticker} 写入失败: ${error.message}`);
    ok++;
  }
  console.log(`ads_ratio 回填 ${ok} 只`);
  if (missing.length) console.warn(`securities 无此票(跳过): ${missing.join(", ")}`);
  if (mismatch.length) console.warn(`security_type≠ADR(跳过,请核对): ${mismatch.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: package.json 加脚本**

在 `web/package.json` 的 `scripts` 里，`"enrich:security-type"` 行下方加：

```json
    "backfill:ads-ratio": "tsx scripts/backfill-ads-ratio.ts",
```

- [ ] **Step 3: tsc（脚本类型）**

Run: `cd web && npx tsc --noEmit -p scripts/tsconfig.json`
Expected: 无输出

- [ ] **Step 4: 提交（不在此跑，跑在 Task 9 上线）**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/scripts/backfill-ads-ratio.ts web/package.json
git commit -m "feat(scripts): backfill-ads-ratio — 19 只 ADR 核定比例回填

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: 上线 + 真数据验收

**前置**：Task 1-8 全部提交、`tsc` 全绿、`.check.ts` 全过。

- [ ] **Step 1: 用户跑 DDL**

请用户在 Supabase SQL Editor 跑 `web/supabase/migrations/20260708_add_ads_ratio.sql` 的 `alter table`。等用户确认完成。

- [ ] **Step 2: 回填比例**

Run: `cd web && npm run backfill:ads-ratio`
Expected: `ads_ratio 回填 19 只`（无 mismatch；若有 mismatch 停下核对 security_type）

- [ ] **Step 3: 抽验 DB 写对**

Run: `cd web && npx tsx -e "import {createClient} from '@supabase/supabase-js'; import * as fs from 'fs'; const e=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^[\"']|[\"']$/g,'')]})); const db=createClient(e.SUPABASE_URL,e.SUPABASE_SERVICE_KEY,{auth:{persistSession:false}}); const {data}=await db.from('securities').select('ticker,ads_ratio').in('ticker',['PDD','FMS','WB','JOYY','HTHT']); console.log(data);"`
Expected: PDD=4, FMS=0.5, WB=1, JOYY=20, HTHT=10

- [ ] **Step 4: 重跑 ingest**

Run: `cd web && npm run valuation:ingest`
Expected: 汇总打印含 `ADR未策展抑制 N`（N≈139，= universe 内无基本面/未策展 ADR）；入表数不含被抑制票。

- [ ] **Step 5: 验收对拍**

Run（复用探针，查归一化后快照）: 拉 `valuation_snapshot` 里 `PDD FMS WB JD JOYY HTHT` 的 `verdict_bucket,range_lo,range_hi,price,in_strike_zone,margin_pct`，对拍下表：

| 票 | 判据 |
|---|---|
| **PDD** | 带升到 ~$53–114，`verdict_bucket` ≠ `above`，`margin_pct` 由 −517% 收敛到合理区间 |
| **FMS** | `in_strike_zone=false`（带 ×0.5 下修，脱离假 strike）✅ 核心 |
| **WB** | 带仍 ~$17，`in_strike_zone=true` 不变（ratio=1 恒等）|
| **JD** | 带升到 ~$24（×2），价 $26，落带内/近带 |
| 非 ADR（STM/CHKP/ICLR…）| 值**完全不变**（回归）|

- [ ] **Step 6: 研究页市值抽验**

Run: 本地或 preview 打 `/api/research/PDD`，看 `valuation_metrics.market_cap` ≈ $115B（非 $470B），P/E 随之收敛。

- [ ] **Step 7: 汇总给用户**

把验收表结果贴给用户；PR 走网页开到 `db-foundation`（非 collaborator，`gh pr create` 会失败，给 compare URL）。

---

## Self-Review 记录

- **Spec 覆盖**：§3.1 列→T1；§3.2 注入→T3；§3.3 抑制闸→T2(决策)+T5/T6(调用);§3.4 研究页→T7;§4 策展→T8;§6 测试→T2/T3 的 .check.ts;§7 验收→T9;§8 上线→T9。无遗漏。
- **占位符**：Task 4 Step 2 的 `<client>` 是"按 Step 1 所见替换"的显式指令（文件内 client 获取方式需现场确认），非 TODO。
- **类型一致**：`resolveAds` 返回 `{suppressed,ratio}` 在 T2/T5/T6/T7 一致；`fundamentalsToFloorInput` 第 4 参 `adsRatio` 在 T3 定义、T5/T6 传入一致；`getSecurityMeta` 返回 `{securityType,adsRatio}` 在 T4 定义、T6/T7 解构一致。
- **关联记忆**：[[valuation-broad-universe-guardrails]]（本案落地其"外股 ADR 归一化"遗留）。
