# strong 分档持续盈利闸 + 基本面口径完整性护栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给护城河 strong 分档加一道"≥5 连续盈利 FY 年"前置闸（降 ABNB 类假阳），并加一道 `opInc>revenue`/`gross>revenue` 基本面口径护栏（抑制 MGRC 类 ~19 只坏数据的估值判定）。

**Architecture:** 两件独立改动。件①在 `moatCap.ts` 加纯函数 `sustainedProfitStreak` 并在 `deriveMoatCap` 的两条 strong 路径前置该闸，`epvFloor.assembleFloor` 从 `allYears` 算出并传入。件②新增纯谓词模块 `fundamentalsIntegrity.ts`，`deriveValuationVerdict` 加第三个抑制入参 `fundamentalsCorrupt` 早返回 null，接线面逐点照抄既有拆股护栏（`isSplitCoverageStale`）的布线。

**Tech Stack:** TypeScript, Next.js（App Router，见 `web/AGENTS.md`），Supabase。测试用 `.check.ts` + `npx tsx`（本项目不跑 jest，见 [[no-tests-solo-dev]]），真引擎探针跑在 `.claude/worktrees/moat-intangibles`（有 env+tsx）。

## Global Constraints

- 所有正文/文档/回复中文；代码/术语/路径除外（[[reply-and-plan-in-chinese]]）。
- 用户可见文案遵 `docs/copy-voice.md`：具体、数据优先、无 AI 腔；en/zh 各自独立判读。
- 只吃 `fiscal_period=FY` 行（调用方已过滤，[[cusip-corruption-episode]] 纪律）。
- 常量单一来源：`STRONG_MIN_PROFIT_STREAK` 定义并导出于 `moatCap.ts`，不得散落。
- 范围红线：不动 pathA（EPV/AV≥2×）/pathB（roicLongTermStrong 6年/22%/CV<0.35）既有阈值、层③/结构性置信/杠杆地基；strong 闸只管 strong，不碰 moderate/none；件②只护栏抑制，不修营收 XBRL 源头标签。
- 测试运行目录：所有 `.check.ts` 与 `tsc` 在 `web/` 下跑。
- 每个 `.check.ts` 末尾 `console.log("<name>.check.ts ✓")`，与既有风格一致。

---

### Task 1: 件① strong 分档前置"持续盈利轨迹"闸

**Files:**
- Modify: `web/src/lib/valuation/moatCap.ts`（加常量 + `sustainedProfitStreak` + `deriveMoatCap` 两条 strong 路径前置闸）
- Modify: `web/src/lib/valuation/epvFloor.ts:223-233`（`assembleFloor` 算出并传入 `sustainedProfitYears`）
- Test: `web/src/lib/valuation/moatCap.check.ts`（新增闸的单测）

**Interfaces:**
- Produces:
  - `export const STRONG_MIN_PROFIT_STREAK = 5`
  - `export function sustainedProfitStreak(fyYears: ValuationFloorYear[]): number` — 按 fiscal_year 降序，从最新年起数连续 `net_income != null && net_income > 0` 的年数。
  - `deriveMoatCap` 入参新增可选字段 `sustainedProfitYears?: number`。语义：`undefined` 视为放行（兼容预存于本闸之前的调用方 / 单测）；提供且 `< STRONG_MIN_PROFIT_STREAK` → 两条 strong 路径都降 moderate。
- Consumes: `ValuationFloorYear`（`./types`，含 `fiscal_year: number`、`net_income?: number`）。

- [ ] **Step 1: 写失败单测（追加到 moatCap.check.ts 末尾，`console.log` 那行之前）**

先在文件顶部 import 补上 `sustainedProfitStreak, STRONG_MIN_PROFIT_STREAK`（加到第 1 行既有 import 列表）。然后在末尾 `console.log(...)` 之前插入：

```ts
// ── 件① 持续盈利闸 ────────────────────────────────────────────────────────
// sustainedProfitStreak: 从最新年起数连续盈利年。
{
  const yrs = [
    { fiscal_year: 2020, net_income: -100 },
    { fiscal_year: 2021, net_income: -5 },
    { fiscal_year: 2022, net_income: 10 },
    { fiscal_year: 2023, net_income: 20 },
    { fiscal_year: 2024, net_income: 30 },
    { fiscal_year: 2025, net_income: 25 },
  ] as ValuationFloorYear[];
  assert.strictEqual(sustainedProfitStreak(yrs), 4, "ABNB 型:最新4年连续盈利,2021亏损断裂");
}
{
  const allPos = [2020, 2021, 2022, 2023, 2024, 2025].map((y) => ({ fiscal_year: y, net_income: 10 })) as ValuationFloorYear[];
  assert.strictEqual(sustainedProfitStreak(allPos), 6, "全正 → 6");
}
{
  const latestLoss = [
    { fiscal_year: 2024, net_income: 10 },
    { fiscal_year: 2025, net_income: -1 },
  ] as ValuationFloorYear[];
  assert.strictEqual(sustainedProfitStreak(latestLoss), 0, "最新年亏损 → 0");
}
assert.strictEqual(STRONG_MIN_PROFIT_STREAK, 5, "常量=5");

// deriveMoatCap: 正常路径 strong,streak<5 → 降 moderate。
{
  const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 3.0, declined: false, suppressedFlags: false, roicStable: true, sustainedProfitYears: 4 });
  assert.strictEqual(r.grade, "moderate", "streak=4 <5 → moderate（正常路径）");
}
// deriveMoatCap: 正常路径 strong,streak>=5 → 保持 strong。
{
  const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 3.0, declined: false, suppressedFlags: false, roicStable: true, sustainedProfitYears: 6 });
  assert.strictEqual(r.grade, "strong", "streak=6 → strong 不变");
}
// deriveMoatCap: undefined 视为放行（兼容旧调用）。
{
  const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 3.0, declined: false, suppressedFlags: false, roicStable: true });
  assert.strictEqual(r.grade, "strong", "sustainedProfitYears 缺省 → 放行,strong 不变");
}
// deriveMoatCap: roicOnly 兜底路径也受闸约束。
{
  const roicOnlyGated = deriveMoatCap({
    moat: { signal: "franchise", label: "", basis_note: "", moat_via_roic: true },
    epvAvRatio: undefined, declined: false, suppressedFlags: false, roicStable: true,
    roicLongTermStrong: true, sustainedProfitYears: 4,
  });
  assert.strictEqual(roicOnlyGated.grade, "moderate", "roicOnly + streak<5 → moderate");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/moatCap.check.ts`
Expected: FAIL（`sustainedProfitStreak` 未定义 / `STRONG_MIN_PROFIT_STREAK` 未定义 → import 报错或断言失败）

- [ ] **Step 3: 实现 `sustainedProfitStreak` + 常量（moatCap.ts）**

在 `moatCap.ts` 顶部常量区（`export const MOAT_STRONG_RATIO` 附近）加：

```ts
export const STRONG_MIN_PROFIT_STREAK = 5; // strong 分档前置闸:近连续 FY 年 net_income>0 的最小年数。
```

在 `deriveMoatCap` 函数**之后**、`roicStability` 之前加纯函数：

```ts
/**
 * 持续盈利轨迹(件①):按 fiscal_year 降序,从最新年起数连续 net_income>0 的 FY 年数。
 * strong 分档前置闸——"刚转盈"的名字(ABNB:最早年巨亏、连续盈利仅 4 年)不该拿 20 年 CAP。
 * 只吃 FY 行(调用方已过滤);最新年亏损/缺失 → 0。fyYears 不假设已排序。
 */
export function sustainedProfitStreak(fyYears: ValuationFloorYear[]): number {
  const sorted = [...fyYears].sort((a, b) => b.fiscal_year - a.fiscal_year);
  let streak = 0;
  for (const y of sorted) {
    if (y.net_income != null && y.net_income > 0) streak++;
    else break;
  }
  return streak;
}
```

- [ ] **Step 4: 在 `deriveMoatCap` 两条 strong 路径前置闸**

改 `deriveMoatCap` 入参类型，在 `roicLongTermStrong?: boolean;` 之后加：

```ts
  /** 件① 持续盈利闸:近连续盈利 FY 年数。undefined=放行(兼容旧调用);< STRONG_MIN_PROFIT_STREAK → strong 降 moderate。 */
  sustainedProfitYears?: number;
```

在解构行加入 `sustainedProfitYears`：

```ts
  const { moat, epvAvRatio, epvAvRatioOperating, declined, suppressedFlags, roicStable, roicLongTermStrong, sustainedProfitYears } = input;
  const profitStreakOk = sustainedProfitYears == null || sustainedProfitYears >= STRONG_MIN_PROFIT_STREAK;
```

**roicOnly 分支**：把 `const durablePassed = franchiseCore && roicLongTermStrong === true;` 改为：

```ts
    const durablePassed = franchiseCore && roicLongTermStrong === true && profitStreakOk;
```

并把该分支的降档 `reason` 行改为（补上盈利年数不足的理由，优先级放最后）：

```ts
    const reason = declined ? "盈利下滑" : suppressedFlags ? "资本开支红旗" : roicStable !== true ? "ROIC 稳定性不足" : "持续盈利年数不足";
```

**正常分支**：把 `const durablePassed = franchiseCore && (strongRatio || roicLongTermStrong === true);` 改为：

```ts
  const durablePassed = franchiseCore && (strongRatio || roicLongTermStrong === true) && profitStreakOk;
```

并把该分支的降档 `reason` 行改为：

```ts
  const reason = !profitStreakOk ? "持续盈利年数不足强档门槛" : !strongRatio ? "护城河存在但未达强档" : declined ? "盈利下滑" : suppressedFlags ? "资本开支红旗" : "ROIC 稳定性不足";
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd web && npx tsx src/lib/valuation/moatCap.check.ts`
Expected: PASS（末尾打印 `moatCap.check.ts ✓`）

- [ ] **Step 6: 在 `epvFloor.assembleFloor` 算出并传入 `sustainedProfitYears`**

`epvFloor.ts` 顶部 import 从 `./moatCap` 补上 `sustainedProfitStreak`（加到既有 `deriveMoatCap, roicStability, ...` 那行）。

在 `const moatCap = deriveMoatCap({` 调用块（约 226 行）里，`roicLongTermStrong: roicLongStrongMoat,` 之后加一行：

```ts
    sustainedProfitYears: sustainedProfitStreak(allYears),
```

- [ ] **Step 7: tsc + 提交**

Run: `cd web && npx tsc --noEmit`
Expected: 无新错误。

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/friendly-boyd-5e3675
git add web/src/lib/valuation/moatCap.ts web/src/lib/valuation/moatCap.check.ts web/src/lib/valuation/epvFloor.ts
git commit -m "feat(valuation): 件① strong 分档前置持续盈利闸(≥5连续盈利FY年)

sustainedProfitStreak 纯函数 + STRONG_MIN_PROFIT_STREAK=5;deriveMoatCap
两条 strong 路径(正常+roicOnly)前置该闸,不足降 moderate;epvFloor 从
allYears 算出传入。undefined 放行兼容旧调用。真数据只降 ABNB(连续4年)。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: gross_profit 字段接入引擎输入契约

**Files:**
- Modify: `web/src/lib/valuation/types.ts`（`ValuationFloorYear` 加 `gross_profit?: number`）
- Modify: `web/src/lib/valuation/fundamentalsToFloorInput.ts:22`（映射 `gross_profit`）
- Test: `web/src/lib/valuation/fundamentalsToFloorInput.check.ts`（断言映射透传）

**Interfaces:**
- Produces: `ValuationFloorYear.gross_profit?: number`（供 Task 3 谓词查 `gross>revenue`）。
- Consumes: `FundamentalPeriod.gross_profit: number | null`（`@/lib/sec/normalize-facts`，已存在）。

- [ ] **Step 1: 写失败单测**

在 `fundamentalsToFloorInput.check.ts` 末尾 `console.log` 前加（若无该 check 文件则跳到 Step 3 先看其结构；本项目该文件已存在）：

```ts
// gross_profit 透传(件② 口径护栏需要)。
{
  const inp = fundamentalsToFloorInput("X", "X", [
    { fiscal_period: "FY", fiscal_year: 2024, period_end: "2024-12-31", revenue: 1000, gross_profit: 400 } as never,
  ], 1);
  assert.strictEqual(inp.years[0].gross_profit, 400, "gross_profit 透传");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/fundamentalsToFloorInput.check.ts`
Expected: FAIL（`gross_profit` 为 undefined，断言不等于 400）

- [ ] **Step 3: 加类型字段**

`types.ts` 的 `ValuationFloorYear` 里，在 `operating_income?: number;` 之后加：

```ts
  gross_profit?: number;
```

- [ ] **Step 4: 加映射**

`fundamentalsToFloorInput.ts` 第 20 行 `operating_income: u(r.operating_income),` 之后加：

```ts
      gross_profit: u(r.gross_profit),
```

- [ ] **Step 5: 跑测试确认通过 + tsc**

Run: `cd web && npx tsx src/lib/valuation/fundamentalsToFloorInput.check.ts`
Expected: PASS
Run: `cd web && npx tsc --noEmit`
Expected: 无新错误。

- [ ] **Step 6: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/friendly-boyd-5e3675
git add web/src/lib/valuation/types.ts web/src/lib/valuation/fundamentalsToFloorInput.ts web/src/lib/valuation/fundamentalsToFloorInput.check.ts
git commit -m "feat(valuation): ValuationFloorYear 接入 gross_profit(供口径护栏)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 基本面口径完整性谓词

**Files:**
- Create: `web/src/lib/valuation/fundamentalsIntegrity.ts`
- Create: `web/src/lib/valuation/fundamentalsIntegrity.check.ts`

**Interfaces:**
- Produces: `export function fundamentalsIntegrityViolated(years: ValuationFloorYear[]): boolean` — 任一 FY 年满足 `revenue>0 && operating_income>revenue` 或 `revenue>0 && gross_profit>revenue` → true。
- Consumes: `ValuationFloorYear`（含 `revenue?`、`operating_income?`、`gross_profit?`，后者由 Task 2 加）。

- [ ] **Step 1: 写失败单测（新建 fundamentalsIntegrity.check.ts）**

```ts
/**
 * fundamentalsIntegrity.check.ts — 口径完整性谓词自检。
 * Run: cd web && npx tsx src/lib/valuation/fundamentalsIntegrity.check.ts
 */
import assert from "node:assert";
import type { ValuationFloorYear } from "./types";
import { fundamentalsIntegrityViolated } from "./fundamentalsIntegrity";

const y = (o: Partial<ValuationFloorYear>): ValuationFloorYear => ({ fiscal_year: 2024, ...o }) as ValuationFloorYear;

// opInc>revenue(物理不可能)→ 违反。
assert.strictEqual(fundamentalsIntegrityViolated([y({ revenue: 128, operating_income: 140 })]), true);
// gross>revenue → 违反。
assert.strictEqual(fundamentalsIntegrityViolated([y({ revenue: 128, gross_profit: 263 })]), true);
// 任一坏年即违反(MGRC:老年份坏,新年份好)。
assert.strictEqual(
  fundamentalsIntegrityViolated([
    y({ fiscal_year: 2022, revenue: 155, operating_income: 165 }),
    y({ fiscal_year: 2023, revenue: 831, operating_income: 189 }),
  ]),
  true,
);
// 干净数据 → 不违反。
assert.strictEqual(fundamentalsIntegrityViolated([y({ revenue: 1000, operating_income: 250, gross_profit: 400 })]), false);
// 缺 revenue / revenue<=0 → 该年不判(不误伤)。
assert.strictEqual(fundamentalsIntegrityViolated([y({ operating_income: 100 })]), false);
assert.strictEqual(fundamentalsIntegrityViolated([y({ revenue: 0, operating_income: 100 })]), false);
// opInc/gross 缺失 → 不判。
assert.strictEqual(fundamentalsIntegrityViolated([y({ revenue: 1000 })]), false);
// 空数组 → 不违反。
assert.strictEqual(fundamentalsIntegrityViolated([]), false);

console.log("fundamentalsIntegrity.check.ts ✓");
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/fundamentalsIntegrity.check.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现谓词（新建 fundamentalsIntegrity.ts）**

```ts
// fundamentalsIntegrity.ts — 基本面口径完整性谓词(纯函数,单一真相)。
// operating_income > revenue 或 gross_profit > revenue 是物理不变量违反(营业费用/COGS 为负,
// 不可能)——通常是 SEC XBRL 营收概念被 ingest 取错单条/分部行(MGRC/多数 REIT 的老年份)。
// 命中即判该公司基本面口径损坏,估值判定整条抑制(语义同拆股口径陈旧,见 deriveValuationVerdict)。
// 只做物理不变量,不含"营收跳变/加速"这类会误伤真收购的软判据。修 XBRL 源头标签是独立数据层待办。
import type { ValuationFloorYear } from "./types";

export function fundamentalsIntegrityViolated(years: ValuationFloorYear[]): boolean {
  for (const y of years) {
    if (y.revenue == null || !(y.revenue > 0)) continue;
    if (y.operating_income != null && y.operating_income > y.revenue) return true;
    if (y.gross_profit != null && y.gross_profit > y.revenue) return true;
  }
  return false;
}
```

- [ ] **Step 4: 跑测试确认通过 + tsc**

Run: `cd web && npx tsx src/lib/valuation/fundamentalsIntegrity.check.ts`
Expected: PASS
Run: `cd web && npx tsc --noEmit`
Expected: 无新错误。

- [ ] **Step 5: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/friendly-boyd-5e3675
git add web/src/lib/valuation/fundamentalsIntegrity.ts web/src/lib/valuation/fundamentalsIntegrity.check.ts
git commit -m "feat(valuation): 件② 基本面口径完整性谓词(opInc/gross>revenue)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: deriveValuationVerdict 加 fundamentalsCorrupt 抑制入参

**Files:**
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts`（顶部护栏注释登记 + 入参 + 早返回）
- Test: `web/src/lib/valuation/deriveValuationVerdict.check.ts`（新增抑制单测）

**Interfaces:**
- Consumes: 调用方传入 `fundamentalsCorrupt?: boolean`（由 Task 3 的 `fundamentalsIntegrityViolated` 算出，Task 5 布线）。
- Produces: `deriveValuationVerdict(...)` 在 `fundamentalsCorrupt === true` 时返回 `null`（语义同 `splitCoverageStale`/`capitalStructureDistorted`）。

- [ ] **Step 1: 写失败单测**

复用文件中既有的 `floorStub()` + `sz("in_strike_zone")` 可估值夹具（拆股/资本结构护栏单测已用同一对）。在末尾 `console.log("deriveValuationVerdict.check.ts ✓ all assertions passed");` 之前加：

```ts
// 件② 口径护栏:fundamentalsCorrupt=true → 整条抑制为 null。
assert.strictEqual(
  deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), fundamentalsCorrupt: true }),
  null,
  "fundamentalsCorrupt=true → verdict 抑制为 null",
);
// 未传 / false → 行为不变(回归:仍算出非 null 判定)。
assert.ok(
  deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), fundamentalsCorrupt: false }) != null,
  "fundamentalsCorrupt=false → 判定照常算出",
);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
Expected: FAIL（`fundamentalsCorrupt` 未在入参类型 → tsc 报错，或抑制断言失败）

- [ ] **Step 3: 加入参 + 早返回**

`deriveValuationVerdict` 入参类型里，在 `capitalStructureDistorted?: boolean;` 之后加：

```ts
  /** 基本面口径损坏(opInc>revenue / gross>revenue,物理不可能)→ 每股口径不可信,整条抑制。
   *  语义同 splitCoverageStale/capitalStructureDistorted,由调用方经 fundamentalsIntegrityViolated 算出后传入。 */
  fundamentalsCorrupt?: boolean;
```

在解构行加 `fundamentalsCorrupt`，并在 `if (capitalStructureDistorted) return null;` 之后加：

```ts
  if (fundamentalsCorrupt) return null; // 口径损坏(opInc/gross>revenue)→ 无可信判定
```

在文件顶部护栏登记注释块（`// 本函数内的护栏(...)`）追加一条：

```ts
//  - fundamentalsCorrupt（入参，由 fundamentalsIntegrityViolated 算出）：基本面口径损坏
//    (opInc>revenue / gross>revenue,物理不可能,通常是 SEC XBRL 营收概念取错)→ 整条抑制为 null。
```

- [ ] **Step 4: 跑测试确认通过 + tsc**

Run: `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
Expected: PASS
Run: `cd web && npx tsc --noEmit`
Expected: 无新错误。

- [ ] **Step 5: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/friendly-boyd-5e3675
git add web/src/lib/valuation/deriveValuationVerdict.ts web/src/lib/valuation/deriveValuationVerdict.check.ts
git commit -m "feat(valuation): deriveValuationVerdict 加 fundamentalsCorrupt 抑制入参

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 生产接线(barrel + 个股页 + ingest + 探针)

**Files:**
- Modify: `web/src/lib/valuation/index.ts`（barrel 导出谓词）
- Modify: `web/src/lib/stocks/stockCopy.ts:80,125`（加 en/zh 抑制文案键 `fundamentalsSuspect`）
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx:35,417-423,626-630`（算旗 + 传入 verdict + 整卡不渲染 + 文案）
- Modify: `web/scripts/valuation-ingest.ts:34,171-172`（快照写入同步抑制）
- Modify: `web/scripts/probe-moat-intangibles.ts`（探针同步传入）

**Interfaces:**
- Consumes: `fundamentalsIntegrityViolated`（Task 3）、`deriveValuationVerdict` 的 `fundamentalsCorrupt` 入参（Task 4）、`page.valuation.fundamentalsSuspect` 文案键。

- [ ] **Step 1: barrel 导出谓词**

`index.ts` 第 14 行 `export { isSplitCoverageStale } from "./splitCoverage";` 之后加：

```ts
export { fundamentalsIntegrityViolated } from "./fundamentalsIntegrity";
```

- [ ] **Step 2: 加 en/zh 文案键**

`stockCopy.ts` zh 块 `moatDistorted:` 那行（约 80 行）之后加：

```ts
      fundamentalsSuspect: "这家公司的财报数据存在口径问题（如营业利润高于营收），数值不可靠，暂不给出估值判定，待数据修正后恢复。",
```

en 块 `moatDistorted:` 那行（约 125 行）之后加：

```ts
      fundamentalsSuspect: "This company's reported figures contain an impossible value (operating income above revenue), so the data can't be trusted and no valuation verdict is shown until it's corrected.",
```

- [ ] **Step 3: page.tsx 算旗 + 传入 + 抑制渲染**

`page.tsx` 第 35 行 import 列表补上 `fundamentalsIntegrityViolated`（与 `isSplitCoverageStale` 同一 import 组）。

在 `capitalStructureDistorted` 定义块（约 417-418 行）之后加：

```ts
  // 基本面口径护栏:opInc>revenue / gross>revenue 物理不可能 → 数据损坏,整条抑制估值判定。
  const fundamentalsCorrupt =
    valuationFloor?.kind === "floor" && fundamentalsIntegrityViolated(floorInput.years);
```

把 `deriveValuationVerdict({ floor: valuationFloor, strikeZone, oeDcf, reconciliation, splitCoverageStale, capitalStructureDistorted })`（约 423 行）改为在末尾加 `fundamentalsCorrupt`：

```ts
      ? deriveValuationVerdict({ floor: valuationFloor, strikeZone, oeDcf, reconciliation, splitCoverageStale, capitalStructureDistorted, fundamentalsCorrupt })
```

在抑制渲染块（约 626-630 行）里，`{splitCoverageStale ? (...) : capitalStructureDistorted ? (...) : (` 链条中，`capitalStructureDistorted` 分支之后、`: (` 之前插入一段：

```tsx
              ) : fundamentalsCorrupt ? (
                <p className="mt-3 text-sm text-[var(--tt-muted)]">{page.valuation.fundamentalsSuspect}</p>
```

（即最终为 `splitCoverageStale ? A : capitalStructureDistorted ? B : fundamentalsCorrupt ? C : (卡片)`。）

- [ ] **Step 4: valuation-ingest 同步抑制**

`valuation-ingest.ts` 第 34 行 import（含 `isSplitCoverageStale`）补上 `fundamentalsIntegrityViolated`。

在 `const capitalStructureDistorted = floor.moat_reading.capital_structure_distorted === true;`（约 171 行）之后加：

```ts
      const fundamentalsCorrupt = fundamentalsIntegrityViolated(floorInput.years);
```

把该处 `deriveValuationVerdict({ floor, strikeZone, oeDcf, reconciliation, splitCoverageStale, capitalStructureDistorted })`（约 172 行）末尾加 `fundamentalsCorrupt`：

```ts
      const v = deriveValuationVerdict({ floor, strikeZone, oeDcf, reconciliation, splitCoverageStale, capitalStructureDistorted, fundamentalsCorrupt });
```

（变量名已核实：ingest 脚本里承载 `fundamentalsToFloorInput` 输出的变量是 `floorInput`，同处已有 `deriveOeDcf(floor, floorInput.years, ...)` 用法。）

- [ ] **Step 5: 探针同步传入**

`probe-moat-intangibles.ts` 里 import 补 `fundamentalsIntegrityViolated`（从 `@/lib/valuation`）。在 `const capitalStructureDistorted = floor.moat_reading.capital_structure_distorted === true;` 之后加：

```ts
    const fundamentalsCorrupt = fundamentalsIntegrityViolated(floorInput.years);
```

把探针里 `deriveValuationVerdict({ floor, strikeZone, oeDcf, reconciliation, capitalStructureDistorted })` 末尾加 `fundamentalsCorrupt`。

- [ ] **Step 6: tsc + 提交**

Run: `cd web && npx tsc --noEmit`
Expected: 无新错误。

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/friendly-boyd-5e3675
git add web/src/lib/valuation/index.ts web/src/lib/stocks/stockCopy.ts "web/src/app/[lang]/stocks/[ticker]/page.tsx" web/scripts/valuation-ingest.ts web/scripts/probe-moat-intangibles.ts
git commit -m "feat(valuation): 件② 口径护栏生产接线(个股页抑制+ingest快照+探针)

barrel 导出谓词 + en/zh fundamentalsSuspect 文案 + page.tsx 整卡不渲染 +
valuation-ingest 快照同步抑制(聚合端读快照继承)+ 探针同步。照抄拆股护栏布线。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 真引擎验收(ABNB 降级 / 坏数据抑制 / 干净零漂移)

**Files:**
- 无源码改动（纯验收）。在 `.claude/worktrees/moat-intangibles` worktree 跑，但须先把本分支代码同步过去，或直接在本 worktree 补 env+node_modules 后跑。推荐：把本分支 `git worktree` 到有 env 的位置，或在 `moat-intangibles` worktree `git merge` 本分支后跑探针。

**Interfaces:**
- Consumes: Task 1-5 全部改动。

- [ ] **Step 1: 准备可跑探针的环境**

在有 `.env.local` + 真 `node_modules` 的 worktree（如 `moat-intangibles`）里把本实现分支合并/checkout 进去。确认 `web/.env.local` 含 `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`，`node_modules/.bin/tsx` 存在。

- [ ] **Step 2: 跑探针验收 ABNB 降级 + 干净名字零漂移**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-moat-intangibles.ts ABNB INTU ENSG PCTY ROL MA SPGI NFLX ADBE MSFT AAPL MCO COST NVDA PYPL`
Expected:
- ABNB：`moat_cap: grade=moderate`（从 strong 降），`verdict` 的 bucket 不再是 below +24.5%（记录实际 bucket/marginPct）。
- INTU/ENSG/PCTY/ROL/MA/NFLX/ADBE/MSFT/AAPL/MCO/COST/NVDA/PYPL：`grade` 与 `verdict` 与实现前**逐一对齐、零漂移**（这些名字连续盈利均 ≥5）。SPGI 保持 moderate。

- [ ] **Step 3: 跑探针验收坏数据抑制**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-moat-intangibles.ts MGRC AMT ESS SBAC DEI FCFS IPAR UDR`
Expected: 每只 `verdict: null (suppressed)`（口径损坏被护栏抑制）。DEI/FCFS/IPAR 验证 `gross>revenue` 单独触发（它们不在 opInc>revenue 名单）。

- [ ] **Step 4: 跑全套 .check.ts + tsc 收口**

Run:
```bash
cd web
for f in src/lib/valuation/moatCap.check.ts src/lib/valuation/fundamentalsToFloorInput.check.ts src/lib/valuation/fundamentalsIntegrity.check.ts src/lib/valuation/deriveValuationVerdict.check.ts; do npx tsx "$f"; done
npx tsc --noEmit
```
Expected: 每个 check 打印 `✓`；tsc 无新错误。

- [ ] **Step 5: 记录验收结果（不提交代码，回写 spec 的验证节实际值）**

把 ABNB 降级后的实际 bucket/marginPct、坏数据抑制清单实际命中数，回填到 spec 文档"验证"节（把"记录实际"替换为真值），提交文档更新：

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/friendly-boyd-5e3675
git add docs/superpowers/specs/2026-07-17-strong-grade-and-fundamentals-integrity-design.md
git commit -m "docs(valuation): 回填 strong闸+口径护栏真引擎验收实际值

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 部署（合并后，需授权）

代码正确 ≠ 生产生效。合并进 db-foundation 后须授权跑 `cd web && npm run valuation:ingest` 重算快照，件①（ABNB 降 moderate）与件②（~19 只抑制）才落地生产 screener/投资人页/verdict chip 等读快照的聚合面。个股页实时计算，合并即生效。

## 遗留（不在本 plan）

- 营收 XBRL 源头标签修复（REIT/租赁类 revenue 取错概念）→ 独立数据层 spec；修好后 MGRC 类可从"暂不评估"恢复真 verdict。
- `roicLongTermStrong` 一票多用抬升（见 [[valuation-leverage-cost-of-equity]] 遗留）。
