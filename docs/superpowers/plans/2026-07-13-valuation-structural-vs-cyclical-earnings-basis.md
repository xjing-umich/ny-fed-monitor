# Phase 3.7 结构性 vs 顺周期盈利基数 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让上行成长股的正常化盈利基数按"结构性置信分 s"连续加权抬升(GOOGL/META/MSFT 放开、NVDA 半放不资本化峰值),并按 s 解耦 ai_capex 可靠性闸,让真结构性成长股在聚合面显现——零放水、地基禁改区逐字不动。

**Architecture:** 新纯函数模块 `structuralConfidence.ts` 从**原始** revenue/operating_income/net_income/ROIC 序列算 s∈[0,1](收入驱动度 + ROIC 久期 加分;未验证峰值跳升倍数 硬顶),循环依赖天然破。`conservativeNormalized`(epvFloor.ts:37)加可选 lift 参数,只在**上行分支 + 净利消费者**应用连续加权 `value=a+s×(target−a)`;营业利润率消费者(line 292)不传 lift、逐字不动。s 挂 `floor.structural_confidence`,`assessReliability`(deriveValuationVerdict.ts:67)按 s≥S_RELIABLE 推翻 ai_capex 否决。

**Tech Stack:** TypeScript(严格)· Node `tsx` 跑 `.check.ts` 断言(非 jest)· `tsc --noEmit` 当类型门 · `madge --circular` 当无环门 · **禁 `next build`**(本机 google fonts 被墙必失败,见 [[local-build-google-fonts-blocked]])。

## Global Constraints

- **回复/文档正文中文**(代码/术语/路径除外)。[[reply-and-plan-in-chinese]]
- **数据准确性**:标来源+日期;CAGR/趋势拟合只吃 `fiscal_period=FY` 行(非派生 Q4);盈利/营收 log 回归用最小二乘非端点。
- **忠于价值哲学**:禁投机/推荐;不为抬估值而抬。[[valuation-philosophy-constraint]]
- **地基禁改区(逐字不动)**:`conservativeNormalized` 下行分支(latest<avg → 取 latest, capped:true)· `assessReliability` 除第 67 行外的全部条件(high_leverage/declined/quick_check_flag/极端 oe_yield)· `deriveValuationVerdict` 判定链(bucket/inStrikeZone/MOS/单灯兜底/四闸)· moat 判定 · 增长率封顶(g_used/gFund)· GV 归零 · valueFloor。
- **循环依赖**:s 的输入只用原始 revenue/operating_income/net_income/ROIC 序列,**禁**碰 normalized earnings / moat grade / EPV。`madge --circular` 必须无环。
- **测试**:每个纯函数配 `.check.ts`(`node:assert`,合成 fixture,只读,不碰生产/不跑 ingest)。运行:`cd web && npx tsx src/lib/valuation/<name>.check.ts`。
- **禁 next build**;类型门 `cd web && npx tsc --noEmit`。
- 非 collaborator:PR 走网页开;`valuation:ingest` 写生产需用户授权。

---

## File Structure

- **Create** `web/src/lib/valuation/structuralConfidence.ts` — 结构性置信分 s 及其纯子函数(logSlope / earningsTrendFittedLatest / revenueDrivenRatio / validatedEarningsLevel / untestedPeakCap / structuralConfidence)+ 待标定常量。单一职责:从原始年序列算 s。
- **Create** `web/src/lib/valuation/structuralConfidence.check.ts` — 上述纯函数的合成 fixture 断言。
- **Create** `web/src/lib/valuation/structuralBasisFusion.check.ts` — 端到端融合断言(真引擎全链路)。
- **Modify** `web/src/lib/valuation/moatCap.ts` — 导出 `roicHelpers(taxRate)`(提取现 assembleFloor 内联的 nopatOf/investedCapitalOf 闭包,供 s 计算与 assembleFloor 共用)。
- **Modify** `web/src/lib/valuation/epvFloor.ts` — `conservativeNormalized` 加 lift 参数;`buildBuffettLamp` 收 s+target;`buildFullFloor`/`buildSingleLampFloor` 前置算 s;`assembleFloor` 挂 `structural_confidence` 并改用 roicHelpers。
- **Modify** `web/src/lib/valuation/types.ts` — `ValuationFloor.structural_confidence?: number`;`conservativeNormalized` 返回加 `basisLift?: number`(如需内部披露)。
- **Modify** `web/src/lib/valuation/deriveValuationVerdict.ts` — 第 67 行按 s 解耦 + 新常量 `S_RELIABLE`。
- **Create** `docs/superpowers/data/2026-07-13-structural-confidence-calibration.md` — Task 8 真数据校准报告。

---

## Task 1: 趋势拟合基元 `logSlope` + `earningsTrendFittedLatest`

**Files:**
- Create: `web/src/lib/valuation/structuralConfidence.ts`
- Test: `web/src/lib/valuation/structuralConfidence.check.ts`

**Interfaces:**
- Consumes: `ValuationFloorYear`(types.ts,含 `fiscal_year: number`、`net_income?: number`)。
- Produces:
  - `logSlope(points: { x: number; y: number }[]): { slope: number; intercept: number } | undefined` — 最小二乘 log-线性;<2 点或 denom≤0 → undefined。
  - `earningsTrendFittedLatest(years: ValuationFloorYear[]): number | undefined` — 对 net_income>0 的 FY 点做 log 回归,返回最新财年的拟合水平 `exp(intercept + slope×maxYear)`;正点 <`MIN_STRUCT_YEARS`(=3)→ undefined(正盈利守卫)。

- [ ] **Step 1: 写失败测试**

在 `structuralConfidence.check.ts`:
```ts
import assert from "node:assert";
import type { ValuationFloorYear } from "./types";
import { logSlope, earningsTrendFittedLatest, MIN_STRUCT_YEARS } from "./structuralConfidence";

function yr(fiscal_year: number, net_income: number): ValuationFloorYear {
  return { fiscal_year, net_income } as ValuationFloorYear;
}

// logSlope: ln(y)=x 的完美线性 → slope≈1
{
  const pts = [1, 2, 3, 4].map((x) => ({ x, y: x })); // y=x,非 log 这里直接给 y
  const r = logSlope(pts)!;
  assert.ok(Math.abs(r.slope - 1) < 1e-9, "slope=1");
  assert.ok(Math.abs(r.intercept - 0) < 1e-9, "intercept=0");
}
// logSlope: <2 点 → undefined
assert.strictEqual(logSlope([{ x: 1, y: 1 }]), undefined, "single point undefined");

// earningsTrendFittedLatest: 稳定 10% 复合增长的净利序列 → 拟合最新 ≈ 最新实际
{
  const years = [2020, 2021, 2022, 2023, 2024].map((y, i) => yr(y, 100 * Math.pow(1.1, i)));
  const fit = earningsTrendFittedLatest(years)!;
  const actualLatest = 100 * Math.pow(1.1, 4); // ~146.4
  assert.ok(Math.abs(fit - actualLatest) / actualLatest < 0.02, `fit≈latest, got ${fit}`);
}
// earningsTrendFittedLatest: 单年尖峰被回归平滑 → 拟合 < 尖峰
{
  const years = [yr(2020, 100), yr(2021, 105), yr(2022, 110), yr(2023, 115), yr(2024, 400)];
  const fit = earningsTrendFittedLatest(years)!;
  assert.ok(fit < 400, `spike smoothed, fit=${fit} < 400`);
}
// 正盈利守卫: 含 ≤0 年使正点 <3 → undefined
{
  const years = [yr(2022, -10), yr(2023, -5), yr(2024, 120)];
  assert.strictEqual(earningsTrendFittedLatest(years), undefined, "insufficient positive points");
}
console.log("Task1 structuralConfidence trend-fit: OK");
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd web && npx tsx src/lib/valuation/structuralConfidence.check.ts`
Expected: FAIL(`Cannot find module './structuralConfidence'` 或导出缺失)。

- [ ] **Step 3: 写最小实现**

在 `structuralConfidence.ts`:
```ts
import type { ValuationFloorYear } from "./types";

// ── 待标定常量(Task 8 真数据确认;初值取 spec §9 建议)──
export const MIN_STRUCT_YEARS = 3;

export function logSlope(points: { x: number; y: number }[]): { slope: number; intercept: number } | undefined {
  const n = points.length;
  if (n < 2) return undefined;
  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (!(denom > 0)) return undefined;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

/**
 * 盈利序列 log 回归拟合的最新财年水平(平滑单年尖峰),而非裸 latest。
 * 正盈利守卫:log 要求正值;正点 <MIN_STRUCT_YEARS → undefined(调用方回退 latest)。
 * 只吃传入的 FY 行(调用方保证 fiscal_period=FY)。刻意不复用 growthBaseRate(那是营收增长率、
 * 且处在 impliedExpectations↔ownerEarningsDcf 循环敏感模块,保持独立)。
 */
export function earningsTrendFittedLatest(years: ValuationFloorYear[]): number | undefined {
  const pts = years
    .filter((y) => y.net_income != null && Number.isFinite(y.net_income) && (y.net_income as number) > 0)
    .map((y) => ({ x: y.fiscal_year, y: Math.log(y.net_income as number) }));
  if (pts.length < MIN_STRUCT_YEARS) return undefined;
  const fit = logSlope(pts);
  if (!fit) return undefined;
  const maxYear = Math.max(...pts.map((p) => p.x));
  const v = Math.exp(fit.intercept + fit.slope * maxYear);
  return Number.isFinite(v) ? v : undefined;
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `cd web && npx tsx src/lib/valuation/structuralConfidence.check.ts`
Expected: PASS(`Task1 structuralConfidence trend-fit: OK`)。

- [ ] **Step 5: 提交**

```bash
cd web && git add src/lib/valuation/structuralConfidence.ts src/lib/valuation/structuralConfidence.check.ts
git commit -m "feat(valuation): 盈利趋势拟合基元(logSlope + earningsTrendFittedLatest,正盈利守卫)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 收入驱动度 `revenueDrivenRatio`

**Files:**
- Modify: `web/src/lib/valuation/structuralConfidence.ts`
- Test: `web/src/lib/valuation/structuralConfidence.check.ts`

**Interfaces:**
- Consumes: `ValuationFloorYear`(含 `revenue?`、`net_income?`、`fiscal_year`)、`logSlope`(Task 1)。
- Produces: `revenueDrivenRatio(years: ValuationFloorYear[]): number` ∈ [0,1] — 盈利增长中营收扩张(真需求)vs 净利润率扩张(可能周期定价峰值)的占比。营收 log 斜率 gRev、净利润率(net_income/revenue)log 斜率 gMar;`ratio = clamp01(gRev / (gRev + max(0, gMar)))`;gRev≤0 或数据不足 → 0(保守)。

- [ ] **Step 1: 写失败测试**

追加到 `structuralConfidence.check.ts`(import 加 `revenueDrivenRatio`):
```ts
function yrRev(fiscal_year: number, revenue: number, net_income: number): ValuationFloorYear {
  return { fiscal_year, revenue, net_income } as ValuationFloorYear;
}
// 纯营收驱动(利润率恒定)→ ratio≈1
{
  const years = [2020, 2021, 2022, 2023].map((y, i) => yrRev(y, 1000 * Math.pow(1.2, i), 100 * Math.pow(1.2, i)));
  assert.ok(revenueDrivenRatio(years) > 0.95, "revenue-driven → ~1");
}
// 纯利润率驱动(营收恒定,净利涨)→ ratio≈0
{
  const years = [2020, 2021, 2022, 2023].map((y, i) => yrRev(y, 1000, 50 * Math.pow(1.3, i)));
  assert.ok(revenueDrivenRatio(years) < 0.05, "margin-driven → ~0");
}
// 营收驱动 + 利润率反而收缩 → 全归营收,clamp 到 1
{
  const years = [yrRev(2020, 1000, 200), yrRev(2021, 1500, 240), yrRev(2022, 2200, 300), yrRev(2023, 3200, 380)];
  assert.ok(revenueDrivenRatio(years) > 0.95, "margin drag → revenue ~1");
}
console.log("Task2 revenueDrivenRatio: OK");
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd web && npx tsx src/lib/valuation/structuralConfidence.check.ts`
Expected: FAIL(`revenueDrivenRatio is not a function`)。

- [ ] **Step 3: 写最小实现**

追加到 `structuralConfidence.ts`:
```ts
function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * 收入驱动度 ∈[0,1]:盈利上行来自营收扩张(真需求,结构性)还是净利润率扩张(可能是周期定价峰值)。
 * gRev=营收 log 斜率,gMar=净利润率(ni/rev)log 斜率;ratio=clamp01(gRev/(gRev+max(0,gMar)))。
 * 利润率收缩(gMar<0,营收扛起增长)→ 分母=gRev → ratio=1。营收不增(gRev≤0)或点不足 → 0(保守)。
 */
export function revenueDrivenRatio(years: ValuationFloorYear[]): number {
  const revPts = years
    .filter((y) => y.revenue != null && (y.revenue as number) > 0)
    .map((y) => ({ x: y.fiscal_year, y: Math.log(y.revenue as number) }));
  const marPts = years
    .filter((y) => y.revenue != null && (y.revenue as number) > 0 && y.net_income != null && (y.net_income as number) > 0)
    .map((y) => ({ x: y.fiscal_year, y: Math.log((y.net_income as number) / (y.revenue as number)) }));
  if (revPts.length < MIN_STRUCT_YEARS || marPts.length < MIN_STRUCT_YEARS) return 0;
  const rev = logSlope(revPts);
  const mar = logSlope(marPts);
  if (!rev || !mar) return 0;
  const gRev = rev.slope;
  const gMar = mar.slope;
  if (gRev <= 0) return 0;
  return clamp01(gRev / (gRev + Math.max(0, gMar)));
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `cd web && npx tsx src/lib/valuation/structuralConfidence.check.ts`
Expected: PASS(`Task2 revenueDrivenRatio: OK`)。

- [ ] **Step 5: 提交**

```bash
cd web && git add src/lib/valuation/structuralConfidence.ts src/lib/valuation/structuralConfidence.check.ts
git commit -m "feat(valuation): 收入驱动度(营收扩张vs利润率扩张 log 斜率占比)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 未验证峰值顶 `validatedEarningsLevel` + `untestedPeakCap`

**Files:**
- Modify: `web/src/lib/valuation/structuralConfidence.ts`
- Test: `web/src/lib/valuation/structuralConfidence.check.ts`

**关键校准洞见(写进实现注释):** GOOGL(当前 ~1.7× 已验证水平)和 NVDA(~12×)**都**高于各自已验证水平——所以顶不能用"高于验证水平"判,必须用**跳升倍数** `target / 已验证水平 > UNVALIDATED_JUMP_RATIO` 才封,才分得开 GOOGL(不封)与 NVDA(封)。无下行史 → 拿 avg 当参照。

**Interfaces:**
- Consumes: `ValuationFloorYear`(`net_income`、`fiscal_year`)。
- Produces:
  - `validatedEarningsLevel(years: ValuationFloorYear[], downturnDrop: number): number | undefined` — 扛过一次 ≥downturnDrop 下行年的最高盈利水平(= 见过周期另一面的水平);无下行年 → undefined。按财年升序,下行年 i 满足 `ni[i] < ni[i-1]×(1−downturnDrop)`,取所有下行年的**前一年**盈利的最大值。
  - `untestedPeakCap(input: { target: number; avg: number; validatedLevel: number | undefined }): number` — 返回 s 上限:`ref = validatedLevel ?? avg`;`target > UNVALIDATED_JUMP_RATIO×ref → UNTESTED_S_CAP`,否则 1。
- 新常量:`DOWNTURN_DROP=0.20`、`UNVALIDATED_JUMP_RATIO=3.0`、`UNTESTED_S_CAP=0.5`。

- [ ] **Step 1: 写失败测试**

追加(import 加 `validatedEarningsLevel, untestedPeakCap, DOWNTURN_DROP, UNVALIDATED_JUMP_RATIO, UNTESTED_S_CAP`):
```ts
// validatedEarningsLevel: NVDA 型(FY22 9.8 峰 → FY23 4.4 崩 55% → 爆发)→ 验证水平=9.8
{
  const years = [yr(2021, 4.3), yr(2022, 9.8), yr(2023, 4.4), yr(2024, 30), yr(2025, 73)];
  assert.strictEqual(validatedEarningsLevel(years, DOWNTURN_DROP), 9.8, "validated = pre-crash peak 9.8");
}
// validatedEarningsLevel: 纯上行无下行 → undefined
{
  const years = [2020, 2021, 2022, 2023].map((y, i) => yr(y, 100 * Math.pow(1.15, i)));
  assert.strictEqual(validatedEarningsLevel(years, DOWNTURN_DROP), undefined, "no downturn → undefined");
}
// untestedPeakCap: NVDA(target 120, validated 9.8)→ 120 > 3×9.8 → 封 0.5
assert.strictEqual(untestedPeakCap({ target: 120, avg: 47, validatedLevel: 9.8 }), UNTESTED_S_CAP, "NVDA capped");
// untestedPeakCap: GOOGL(target 132, validated 76)→ 132 < 3×76=228 → 不封 =1
assert.strictEqual(untestedPeakCap({ target: 132, avg: 88, validatedLevel: 76 }), 1, "GOOGL uncapped");
// untestedPeakCap: 平滑复利(target 112, avg 99, 无验证水平)→ 112 < 3×99 → 不封
assert.strictEqual(untestedPeakCap({ target: 112, avg: 99, validatedLevel: undefined }), 1, "smooth uncapped");
// untestedPeakCap: 无下行史但爆炸(target 300, avg 90)→ 300 > 3×90=270 → 封
assert.strictEqual(untestedPeakCap({ target: 300, avg: 90, validatedLevel: undefined }), UNTESTED_S_CAP, "explosive no-history capped");
console.log("Task3 untestedPeakCap: OK");
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd web && npx tsx src/lib/valuation/structuralConfidence.check.ts`
Expected: FAIL(`validatedEarningsLevel is not a function`)。

- [ ] **Step 3: 写最小实现**

追加到 `structuralConfidence.ts`:
```ts
export const DOWNTURN_DROP = 0.20;          // 盈利 YoY 跌 ≥20% = 一次"下行年"
export const UNVALIDATED_JUMP_RATIO = 3.0;  // target > 3× 已验证水平 = 未验证爆炸峰值 → 封
export const UNTESTED_S_CAP = 0.5;          // 陡跳且未验证 → s 封 0.5

/**
 * 已验证盈利水平 = 扛过一次 ≥downturnDrop 下行年的最高盈利(见过周期另一面的水平)。
 * 按财年升序遍历,下行年 i: ni[i] < ni[i-1]×(1−downturnDrop);取所有下行年"前一年"盈利的最大值。
 * 无下行年 → undefined(调用方拿 avg 当参照)。
 */
export function validatedEarningsLevel(years: ValuationFloorYear[], downturnDrop: number): number | undefined {
  const seq = years
    .filter((y) => y.net_income != null && Number.isFinite(y.net_income))
    .slice()
    .sort((a, b) => a.fiscal_year - b.fiscal_year)
    .map((y) => y.net_income as number);
  let validated: number | undefined = undefined;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] < seq[i - 1] * (1 - downturnDrop)) {
      const peak = seq[i - 1];
      validated = validated == null ? peak : Math.max(validated, peak);
    }
  }
  return validated;
}

/**
 * 未验证峰值顶:s 上限。ref = 已验证水平 ?? avg;当前拟合水平 target 若 > UNVALIDATED_JUMP_RATIO×ref
 * = 未验证爆炸峰值 → 封 UNTESTED_S_CAP;否则不封(=1)。
 * ★ GOOGL/NVDA 都高于各自验证水平,靠"跳升倍数"(GOOGL~1.7× vs NVDA~12×)才分得开——不是"是否高于"。
 */
export function untestedPeakCap(input: { target: number; avg: number; validatedLevel: number | undefined }): number {
  const ref = input.validatedLevel ?? input.avg;
  if (ref > 0 && input.target > UNVALIDATED_JUMP_RATIO * ref) return UNTESTED_S_CAP;
  return 1;
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `cd web && npx tsx src/lib/valuation/structuralConfidence.check.ts`
Expected: PASS(`Task3 untestedPeakCap: OK`)。

- [ ] **Step 5: 提交**

```bash
cd web && git add src/lib/valuation/structuralConfidence.ts src/lib/valuation/structuralConfidence.check.ts
git commit -m "feat(valuation): 未验证峰值顶(跳升倍数判据,分开 GOOGL 稳升与 NVDA 爆炸)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 组合 `structuralConfidence`(s + target)

**Files:**
- Modify: `web/src/lib/valuation/structuralConfidence.ts`
- Test: `web/src/lib/valuation/structuralConfidence.check.ts`

**Interfaces:**
- Consumes: 前三任务全部纯函数。
- Produces:
  - `structuralConfidence(input: { years: ValuationFloorYear[]; allYears: ValuationFloorYear[]; roicLongTermStrong: boolean }): { s: number; target: number | undefined }`
    - `avg` = years 窗口 net_income 均值;`trendFit = earningsTrendFittedLatest(years)`;`latest = years[0].net_income`(按现有 epvFloor 约定 years 已降序,latest 在前)。
    - `target = trendFit == null ? (latest 可用 ? max(avg, latest) : undefined) : max(avg, min(latest, trendFit))`(保证 target≥avg,单调性;正盈利守卫回退 latest)。
    - `rawScore = W_REVENUE_DRIVEN×revenueDrivenRatio(years) + W_ROIC_DURABILITY×(roicLongTermStrong?1:0)`。
    - `cap = untestedPeakCap({ target: target ?? avg, avg, validatedLevel: validatedEarningsLevel(allYears, DOWNTURN_DROP) })`。
    - `s = target == null || target <= avg ? 0 : clamp01(Math.min(rawScore, cap))`(无有效抬升 → s=0 → 退今天行为)。
- 新常量:`W_REVENUE_DRIVEN=0.6`、`W_ROIC_DURABILITY=0.4`。

- [ ] **Step 1: 写失败测试**

追加(import 加 `structuralConfidence`):
```ts
function gy(fiscal_year: number, revenue: number, net_income: number): ValuationFloorYear {
  return { fiscal_year, revenue, net_income } as ValuationFloorYear;
}
// GOOGL 型:营收驱动 + roicLongTermStrong=true + 稳升(验证过)→ s 接近 1
{
  const years = [2024, 2023, 2022, 2021, 2020].map((y, i) => gy(y, 300000 * Math.pow(1.12, -i), 90000 * Math.pow(1.12, -i)));
  const r = structuralConfidence({ years, allYears: years, roicLongTermStrong: true });
  assert.ok(r.s > 0.85, `GOOGL-like s high, got ${r.s}`);
  assert.ok(r.target! > 0, "target positive");
}
// NVDA 型:爆炸(验证水平被 12× 甩开)→ 顶封 0.5,即便 rawScore 高
{
  const years = [gy(2025, 130000, 73000), gy(2024, 60000, 30000), gy(2023, 27000, 4400), gy(2022, 27000, 9800), gy(2021, 17000, 4300)];
  const r = structuralConfidence({ years, allYears: years, roicLongTermStrong: true });
  assert.ok(r.s <= 0.5 + 1e-9, `NVDA-like s capped ≤0.5, got ${r.s}`);
}
// 下行股(latest<avg 由调用方走 capped 分支;此处 target≤avg → s=0)
{
  const years = [gy(2024, 1000, 30), gy(2023, 1000, 80), gy(2022, 1000, 100), gy(2021, 1000, 90)];
  const r = structuralConfidence({ years, allYears: years, roicLongTermStrong: false });
  assert.strictEqual(r.s, 0, "declining latest → s=0");
}
console.log("Task4 structuralConfidence: OK");
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd web && npx tsx src/lib/valuation/structuralConfidence.check.ts`
Expected: FAIL(`structuralConfidence is not a function`)。

- [ ] **Step 3: 写最小实现**

追加到 `structuralConfidence.ts`:
```ts
export const W_REVENUE_DRIVEN = 0.6;
export const W_ROIC_DURABILITY = 0.4;

function avg(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

/**
 * 结构性置信分 s∈[0,1](连续加权基数用)。s 高 = 当前盈利结构性、可作正常化基数 + ai_capex 未扭曲可靠性。
 * 加分:收入驱动度 + ROIC 久期(roicLongTermStrong,调用方从原始 ROIC 算好传入)。
 * 硬顶:未验证峰值跳升倍数(NVDA 半放)。全部输入为原始 revenue/net_income/ROIC 序列——不碰 normalized/moat/EPV(破循环依赖)。
 * target(连续加权用)= max(avg, min(latest, trendFit)),保证 ≥avg(单调、只上不下);trendFit 不可算 → 回退 latest。
 */
export function structuralConfidence(input: {
  years: ValuationFloorYear[];
  allYears: ValuationFloorYear[];
  roicLongTermStrong: boolean;
}): { s: number; target: number | undefined } {
  const nis = input.years.map((y) => y.net_income).filter((v): v is number => v != null && Number.isFinite(v));
  if (nis.length === 0) return { s: 0, target: undefined };
  const a = avg(nis);
  const latest = input.years[0]?.net_income;
  const trendFit = earningsTrendFittedLatest(input.years);
  let target: number | undefined;
  if (trendFit != null) target = Math.max(a, Math.min(latest ?? trendFit, trendFit));
  else if (latest != null && Number.isFinite(latest)) target = Math.max(a, latest);
  else target = undefined;

  if (target == null || target <= a) return { s: 0, target };

  const rawScore =
    W_REVENUE_DRIVEN * revenueDrivenRatio(input.years) + W_ROIC_DURABILITY * (input.roicLongTermStrong ? 1 : 0);
  const cap = untestedPeakCap({
    target,
    avg: a,
    validatedLevel: validatedEarningsLevel(input.allYears, DOWNTURN_DROP),
  });
  return { s: clamp01(Math.min(rawScore, cap)), target };
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `cd web && npx tsx src/lib/valuation/structuralConfidence.check.ts`
Expected: PASS(`Task4 structuralConfidence: OK`)。

- [ ] **Step 5: 提交**

```bash
cd web && git add src/lib/valuation/structuralConfidence.ts src/lib/valuation/structuralConfidence.check.ts
git commit -m "feat(valuation): 结构性置信分 s 组合(收入驱动+ROIC久期 加分,未验证峰值 硬顶)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 提取 `roicHelpers(taxRate)` 到 moatCap.ts(供 s 与 assembleFloor 共用)

**Files:**
- Modify: `web/src/lib/valuation/moatCap.ts`(新增导出)
- Modify: `web/src/lib/valuation/epvFloor.ts:159-165`(assembleFloor 内联闭包改用 roicHelpers)
- Test: 现有 `web/src/lib/valuation/moatCap.check.ts` + `web/src/lib/valuation/epvFloor.check.ts` 保持全绿(行为不变的重构)。

**Interfaces:**
- Produces: `roicHelpers(taxRate: number): { nopatOf: (y: ValuationFloorYear) => number | undefined; investedCapitalOf: (y: ValuationFloorYear) => number | undefined }` — 逐字复刻 epvFloor.ts:159-165 现有闭包(nopatOf = operating_income×(1−tax);investedCapitalOf:权益≤0 返回 undefined,否则 net_debt+equity)。

- [ ] **Step 1: 读现有闭包,确认逐字复刻**

Run: `cd web && sed -n '158,166p' src/lib/valuation/epvFloor.ts`
Expected: 看到 `nopatOf`/`investedCapitalOf` 定义(operating_income×(1−roicTax);权益守卫 net_debt+equity)。

- [ ] **Step 2: 在 moatCap.ts 加导出(逐字搬运,不改语义)**

在 `moatCap.ts` 末尾追加:
```ts
/**
 * ROIC 口径闭包工厂(逐字提取自 epvFloor.assembleFloor,供结构性置信分 s 与 assembleFloor 共用,
 * 避免两处重复定义)。nopatOf=税后经营利润;investedCapitalOf 对负/零权益年返回 undefined(BUG1 口径守卫)。
 */
export function roicHelpers(taxRate: number): {
  nopatOf: (y: ValuationFloorYear) => number | undefined;
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
} {
  const nopatOf = (y: ValuationFloorYear): number | undefined =>
    y.operating_income != null ? y.operating_income * (1 - taxRate) : undefined;
  const investedCapitalOf = (y: ValuationFloorYear): number | undefined => {
    if (!(y.shareholders_equity != null && y.shareholders_equity > 0)) return undefined;
    const nd = y.net_debt ?? ((y.total_debt ?? 0) - (y.cash ?? 0));
    return nd + y.shareholders_equity;
  };
  return { nopatOf, investedCapitalOf };
}
```
(确认 `ValuationFloorYear` 已在 moatCap.ts import;若无则加到现有 type import。)

- [ ] **Step 3: epvFloor.assembleFloor 改用 roicHelpers**

在 `epvFloor.ts`:import 从 moatCap 增加 `roicHelpers`;删除 assembleFloor 内 line 159-165 的内联 `nopatOf`/`investedCapitalOf`,替换为:
```ts
  const roicTax = tax.rate;
  const { nopatOf, investedCapitalOf } = roicHelpers(roicTax);
```
其余引用(roicStability/roicTrend/sustainableGrowth/roicLongTermStrong/等)不变。

- [ ] **Step 4: 跑回归,确认行为不变**

Run: `cd web && npx tsx src/lib/valuation/moatCap.check.ts && npx tsx src/lib/valuation/epvFloor.check.ts && npx tsc --noEmit`
Expected: 两个 check 全 PASS,tsc 0 error(纯重构,数值逐位不变)。

- [ ] **Step 5: 提交**

```bash
cd web && git add src/lib/valuation/moatCap.ts src/lib/valuation/epvFloor.ts
git commit -m "refactor(valuation): 提取 roicHelpers(taxRate) 供 s 计算与 assembleFloor 共用

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `conservativeNormalized` 连续加权 + s 接线 + 挂 floor.structural_confidence

**Files:**
- Modify: `web/src/lib/valuation/types.ts`(`ValuationFloor.structural_confidence?: number`)
- Modify: `web/src/lib/valuation/epvFloor.ts`(conservativeNormalized 加 lift;buildBuffettLamp 收 s+target;buildFullFloor/buildSingleLampFloor 前置算 s;assembleFloor 挂 structural_confidence)
- Test: `web/src/lib/valuation/epvFloor.check.ts`

**Interfaces:**
- Consumes: `structuralConfidence`(Task 4)、`roicHelpers`(Task 5)、`roicLongTermStrong`(现有 moatCap 导出)。
- Produces:
  - `conservativeNormalized(series, latest, lift?: { s: number; target: number | undefined }): { value: number; capped: boolean; basisLift?: number }`。
  - `buildBuffettLamp(years, shares, yearsUsed, lift?: { s: number; target: number | undefined })`。
  - `floor.structural_confidence?: number`(s;单灯/全灯路径都挂)。

**★ 铁律:营业利润率消费者(buildGrahamLamp,epvFloor.ts:292)不传 lift → 逐字今天行为。只有净利消费者(buildBuffettLamp)传 lift。**

- [ ] **Step 1: 写失败测试**

追加到 `epvFloor.check.ts`(参照文件现有 import/fixture 风格):
```ts
import { conservativeNormalizedForTest } from "./epvFloor"; // 见 Step 3:导出测试钩子
// 上行 + s=1 → 抬到 target
{
  const r = conservativeNormalizedForTest([120, 60, 40, 30], 120, { s: 1, target: 100 });
  assert.ok(Math.abs(r.value - 100) < 1e-9, `s=1 → target, got ${r.value}`);
  assert.strictEqual(r.capped, false);
}
// 上行 + s=0.5 → avg + 0.5×(target−avg)
{
  const series = [120, 60, 40, 30]; const a = (120 + 60 + 40 + 30) / 4; // 62.5
  const r = conservativeNormalizedForTest(series, 120, { s: 0.5, target: 100 });
  assert.ok(Math.abs(r.value - (a + 0.5 * (100 - a))) < 1e-9, `half lift, got ${r.value}`);
}
// 无 lift → 今天行为(上行取 avg)
{
  const series = [120, 60, 40, 30]; const a = 62.5;
  const r = conservativeNormalizedForTest(series, 120, undefined);
  assert.ok(Math.abs(r.value - a) < 1e-9, "no lift → avg");
}
// 下行分支(latest<avg)+ 即便传 lift → 逐字保留 capped(取 latest)
{
  const r = conservativeNormalizedForTest([30, 80, 100, 90], 30, { s: 1, target: 999 });
  assert.strictEqual(r.value, 30, "down-branch unchanged");
  assert.strictEqual(r.capped, true);
}
// 单调性:target≤avg(守卫回退)→ 不降,取 avg
{
  const series = [70, 60, 40, 30]; const a = 50;
  const r = conservativeNormalizedForTest(series, 70, { s: 1, target: 40 }); // target<avg
  assert.ok(Math.abs(r.value - a) < 1e-9, "target<=avg → avg, never below");
}
console.log("Task6 conservativeNormalized lift: OK");
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: FAIL(`conservativeNormalizedForTest` 未导出)。

- [ ] **Step 3: 改实现**

`types.ts`:在 `ValuationFloor` 接口(structural 字段区,约 line 118-128 附近)加:
```ts
  /** Phase 3.7 结构性置信分 s∈[0,1];驱动净利基数连续加权 + assessReliability 的 ai_capex 解耦。 */
  structural_confidence?: number;
```

`epvFloor.ts` — 改 `conservativeNormalized`(line 37):
```ts
function conservativeNormalized(
  series: number[],
  latest: number | undefined,
  lift?: { s: number; target: number | undefined },
): { value: number; capped: boolean; basisLift?: number } {
  const a = avg(series);
  if (latest != null && Number.isFinite(latest) && latest < a) return { value: latest, capped: true };
  // 上行成长股:无 lift / s≤0 / target≤avg(守卫)→ 今天行为(取 avg,只上不下)。
  if (!lift || !(lift.s > 0) || lift.target == null || !(lift.target > a)) return { value: a, capped: false };
  return { value: a + lift.s * (lift.target - a), capped: false, basisLift: lift.s };
}

// 测试钩子(仅 .check.ts 用;不改变生产行为)。
export function conservativeNormalizedForTest(
  series: number[],
  latest: number | undefined,
  lift?: { s: number; target: number | undefined },
) {
  return conservativeNormalized(series, latest, lift);
}
```

`epvFloor.ts` — `buildBuffettLamp` 签名加 lift 并传入(line 338/342):
```ts
function buildBuffettLamp(
  years: ValuationFloorYear[],
  shares: number,
  yearsUsed: number[],
  lift?: { s: number; target: number | undefined },
): EpvLamp {
  const mc = maintenanceCapex(years);
  const niSeries = years.map((y) => y.net_income!);
  const normNi = conservativeNormalized(niSeries, niSeries[0], lift);
```
(buildGrahamLamp 的 line 292 `conservativeNormalized(margins, margins[0])` **不传第三参**,逐字不动。)

`epvFloor.ts` — buildFullFloor / buildSingleLampFloor 前置算 s,传入 buildBuffettLamp,并把 s 透传给 assembleFloor。import 增加 `roicHelpers`、`roicLongTermStrong`(已从 moatCap 导入则复用)、`structuralConfidence`。改 buildFullFloor:
```ts
function buildFullFloor(years, shares, isFinancial, allYears): ValuationFloor {
  ...
  const tax = normalizedTaxRate(years);
  const { nopatOf, investedCapitalOf } = roicHelpers(tax.rate);
  const roicLongStrong = roicLongTermStrong({ fyYears: allYears, nopatOf, investedCapitalOf });
  const sc = structuralConfidence({ years, allYears, roicLongTermStrong: roicLongStrong });
  const grahamEpv = buildGrahamLamp(years, cash, totalDebt, shares, yearsUsed, tax.rate);
  const buffettEpv = buildBuffettLamp(years, shares, yearsUsed, { s: sc.s, target: sc.target });
  return assembleFloor(years, shares, grahamEpv, buffettEpv, grahamEpv, undefined, isFinancial, allYears, sc.s);
}
```
buildSingleLampFloor 同样:算 sc、`buildBuffettLamp(years, shares, yearsUsed, { s: sc.s, target: sc.target })`、`assembleFloor(..., allYears, sc.s)`。

`assembleFloor` 签名末尾加 `structuralConfidence?: number`,并在返回对象里加 `structural_confidence: structuralConfidence`(与 kind/graham_epv 等并列)。assembleFloor 内 roicLongStrong 仍照旧计算(供 moat;与前置计算是同函数同输入的第二次调用,数值一致,不入 s 口径耦合)。

- [ ] **Step 4: 跑测试 + 回归 + 类型门**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts && npx tsx src/lib/valuation/moatCap.check.ts && npx tsx src/lib/valuation/moatGrowthFusion.check.ts && npx tsc --noEmit`
Expected: 全 PASS,tsc 0 error。(moatGrowthFusion 回归确认 Phase 3/3.5 IV 传导未被基数改动破坏。)

- [ ] **Step 5: 提交**

```bash
cd web && git add src/lib/valuation/types.ts src/lib/valuation/epvFloor.ts
git commit -m "feat(valuation): 净利基数连续加权(s×趋势)+ 挂 floor.structural_confidence;营业利润率消费者不动

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `assessReliability` 按 s 解耦 ai_capex 否决

**Files:**
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts:67`(+ 新常量 `S_RELIABLE`)
- Test: `web/src/lib/valuation/deriveValuationVerdict.check.ts`

**Interfaces:**
- Consumes: `floor.structural_confidence`(Task 6)、`floor.ai_capex_distortion_warning`(现有)。
- Produces: `assessReliability` 在 ai_capex 支路加 s 例外;新导出 `S_RELIABLE = 0.8`。

- [ ] **Step 1: 写失败测试**

追加到 `deriveValuationVerdict.check.ts`(参照现有 assessReliability 断言风格,构造最小 floor):
```ts
import { assessReliability, S_RELIABLE } from "./deriveValuationVerdict";
const baseFloor = { kind: "floor", high_leverage_warning: false } as any;
// ai_capex + s≥0.8(GOOGL 型)→ 否决被推翻 → reliable=true
assert.strictEqual(
  assessReliability({ floor: { ...baseFloor, ai_capex_distortion_warning: true, structural_confidence: 0.9 } }),
  true, "ai_capex + high s → reliable",
);
// ai_capex + s<0.8(NVDA 型 0.5)→ 仍 false
assert.strictEqual(
  assessReliability({ floor: { ...baseFloor, ai_capex_distortion_warning: true, structural_confidence: 0.5 } }),
  false, "ai_capex + mid s → still unreliable",
);
// ai_capex + 无 s → 逐字旧行为 false
assert.strictEqual(
  assessReliability({ floor: { ...baseFloor, ai_capex_distortion_warning: true } }),
  false, "ai_capex + no s → unreliable (legacy)",
);
// 其余条件不动:high_leverage 仍一票否决(即便 s 高)
assert.strictEqual(
  assessReliability({ floor: { ...baseFloor, high_leverage_warning: true, structural_confidence: 0.95 } }),
  false, "high leverage still vetoes regardless of s",
);
console.log("Task7 assessReliability s-decouple: OK");
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
Expected: FAIL(`S_RELIABLE` 未导出 / ai_capex+高 s 仍返回 false)。

- [ ] **Step 3: 改实现**

`deriveValuationVerdict.ts` — 在 `EXTREME_OE_YIELD` 等常量附近加:
```ts
/** Phase 3.7:结构性置信分 ≥ 此阈值 → ai_capex 敞口不再一票否决可靠性(高置信结构性盈利,非顺周期脉冲)。 */
export const S_RELIABLE = 0.8;
```
把第 67 行:
```ts
  if (floor?.ai_capex_distortion_warning) return false;
```
改为:
```ts
  // Phase 3.7:ai_capex 只在**未达结构性高置信**时才杀可靠性;s≥S_RELIABLE(如 GOOGL,结构性盈利、
  // 非顺周期脉冲)推翻否决。NVDA 型 s≈0.5<0.8 仍被挡在聚合面(个股页 IV 已按 s 半抬,互不冲突)。
  if (floor?.ai_capex_distortion_warning && !(floor?.structural_confidence != null && floor.structural_confidence >= S_RELIABLE))
    return false;
```
(其余 high_leverage/declined/quick_check_flag/极端 oe_yield 分支**逐字不动**。)

- [ ] **Step 4: 跑测试 + 回归 + 类型门**

Run: `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts && npx tsc --noEmit`
Expected: 全 PASS,tsc 0 error。

- [ ] **Step 5: 提交**

```bash
cd web && git add src/lib/valuation/deriveValuationVerdict.ts
git commit -m "feat(valuation): assessReliability 按 s 解耦 ai_capex 否决(S_RELIABLE=0.8;GOOGL放行/NVDA仍挡)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 真数据校准报告 + 常量确认

**Files:**
- Create: `docs/superpowers/data/2026-07-13-structural-confidence-calibration.md`
- (可能)Modify: `web/src/lib/valuation/structuralConfidence.ts` / `deriveValuationVerdict.ts`(仅调常量值)

**目的:** 用真引擎跑参照票,验证 s 把三类分开、常量初值合理,不合理则**只调常量**(不改逻辑)。前置 env:`SEC_USER_AGENT`(见 [[sec-valuation-ingest-ops]])。tsx 探针须走 `scripts/tsconfig.json` 桩(server-only,见 [[tsx-ingest-server-only-stub]])。

**参照票(必须覆盖三类 + 边界):**
- 放开预期:GOOGL、META、MSFT(结构性、已验证 → s≥0.8、reliable 翻 true)
- 半放预期:NVDA(爆炸未验证 → s≈0.5、reliable 仍 false、个股页 IV 半抬)
- 平滑预期:AAPL(缓升 → s 高但 target−avg 小,抬幅温和)
- 周期对照:CVX、NUE、FCX(latest<avg 多 → 走 capped 下行分支,s=0,不受影响)

- [ ] **Step 1: 写真数据探针脚本**

Create `web/scripts/probe-structural-confidence.ts`(走 `--tsconfig scripts/tsconfig.json`),对每票:拉 SEC 年数据 → `computeValuationFloor` → 打印 `{ ticker, structural_confidence, buffett_epv.normalized_earnings, ai_capex_distortion_warning, reliable(via assessReliability), validatedLevel, target, revenueDrivenRatio, roicLongTermStrong }`。复用 valuation-ingest.ts 的 SEC 装载与 `fundamentalsToFloorInput`(sic 运行时转 number,见 8311b4c)。

- [ ] **Step 2: 跑探针,记录真值**

Run: `cd web && SEC_USER_AGENT="<email>" npx tsx --tsconfig scripts/tsconfig.json scripts/probe-structural-confidence.ts`
Expected: 输出 10 票表。**判据**:GOOGL/META/MSFT 的 `structural_confidence≥0.8` 且 `reliable=true`;NVDA `≈0.5` 且 `reliable=false`;AAPL `target/avg` 温和(≤~1.3);CVX/NUE/FCX `structural_confidence=0`(capped 下行)。

- [ ] **Step 3: 写校准报告 + 按需调常量**

将真值表、是否达判据、最终常量取值(DOWNTURN_DROP / UNVALIDATED_JUMP_RATIO / UNTESTED_S_CAP / S_RELIABLE / W_*)写入 `docs/superpowers/data/2026-07-13-structural-confidence-calibration.md`。**若某票不达判据**(例如 NVDA 因 CV 波动 roicLongTermStrong=false 但 rawScore 仍>0.5 越顶,或 GOOGL 卡 0.79):只调常量值 + 记录理由,**不改逻辑**;调后重跑 Step 2 直到三类判据全绿。记录:GOOGL/META/MSFT 抬幅、NVDA 半抬幅、周期股零影响。

- [ ] **Step 4: 回归纯函数测试(常量若变)**

Run: `cd web && npx tsx src/lib/valuation/structuralConfidence.check.ts && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
Expected: PASS(若调了常量,同步更新 check 里依赖具体常量值的断言)。

- [ ] **Step 5: 提交**

```bash
cd web && git add scripts/probe-structural-confidence.ts ../docs/superpowers/data/2026-07-13-structural-confidence-calibration.md src/lib/valuation/structuralConfidence.ts src/lib/valuation/deriveValuationVerdict.ts
git commit -m "chore(valuation): 结构性置信分真数据校准(10 票三类判据 + 常量定值)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: 端到端融合断言 + 全链路回归 + 无环门

**Files:**
- Create: `web/src/lib/valuation/structuralBasisFusion.check.ts`
- Test: 自身 + 全 `.check.ts` 套件 + tsc + madge

**Interfaces:**
- Consumes: `computeValuationFloor` → `deriveStrikeZone` → `deriveOeDcf` → `reconcileMethods` → `deriveValuationVerdict` 全链路(参照 `moatGrowthFusion.check.ts` 的 import 与装配)。

- [ ] **Step 1: 写融合断言**

Create `structuralBasisFusion.check.ts`(合成 fixture,不碰生产)。断言:
```ts
// A. 抬基数×增长率 不被 80% 边际闸误杀:构造 NVDA 型 floor(s≈0.5,基数半抬)跑全链路,
//    deriveValuationVerdict 返回非 null(未被 isImplausibleBand/SANE_MARGIN_MAX 判坏)。
// B. capped=false 消费者审计:上行成长 fixture,断言 buffett_epv.normalized_earnings > 纯 avg
//    (s>0 生效);且 graham_epv(营业利润率灯)的 normalized 与"不传 lift"逐位一致(营业利润率消费者未被波及)。
// C. GOOGL 型(ai_capex + s≥0.8)→ verdict.reliable=true;NVDA 型(ai_capex + s≈0.5)→ reliable=false。
// D. 下行/周期 fixture(latest<avg)→ structural_confidence=0、buffett 基数=capped latest(逐字旧行为)。
// E. 单灯路径(operating_income 缺)→ structural_confidence 仍挂、buffett 基数按 s 抬(不崩)。
```
每条用 `node:assert` 明确期望值(参照 moatGrowthFusion.check.ts 写法,构造最小 `ValuationFloorInput` + `LatestPrice`)。

- [ ] **Step 2: 跑融合断言,确认失败→迭代到过**

Run: `cd web && npx tsx src/lib/valuation/structuralBasisFusion.check.ts`
Expected: 初次可能因 fixture 装配细节 FAIL;修正 fixture(非产品逻辑)到全绿。

- [ ] **Step 3: 全套 check 回归**

Run: `cd web && for f in src/lib/valuation/*.check.ts; do echo "== $f =="; npx tsx "$f" || break; done`
Expected: 全部 PASS(尤其 epvFloor / moatCap / moatGrowthFusion / deriveValuationVerdict / impliedExpectations / ownerEarningsDcf / growthValue)。

- [ ] **Step 4: 类型门 + 无环门**

Run: `cd web && npx tsc --noEmit && npx madge --circular --extensions ts src/lib/valuation`
Expected: tsc 0 error;madge `No circular dependency found`(证 structuralConfidence 未引入环)。

- [ ] **Step 5: 提交**

```bash
cd web && git add src/lib/valuation/structuralBasisFusion.check.ts
git commit -m "test(valuation): Phase 3.7 端到端融合断言(NVDA 不被80%闸杀/营业利润率灯不动/reliable分层/下行逐字/单灯)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review(计划对 spec 的覆盖核对)

**1. Spec coverage:**
- §4 判别器 s(收入驱动+ROIC久期+未验证峰值顶)→ Task 1-4 ✓
- §5 连续加权公式 + 单调性修正 target=max(a,min(latest,trendFit)) + 正盈利守卫 → Task 4(target)+ Task 6(blend)✓
- §5.2 未验证峰值顶(跳升倍数,砍行业先验)→ Task 3 ✓
- §6 可靠性解耦 s 一票两用 + S_RELIABLE → Task 7 ✓
- §7.1 四道下游闸保留 → Task 9-A/C 断言;逻辑上未触碰(禁改区)✓
- §7.2 抬基数×增长率必验 → Task 9-A ✓
- §7.3 循环依赖 madge 无环 → Task 9-D ✓
- §8 接口点(s 落点/正盈利守卫/capped 消费者审计/trendFit 不复用 base rate)→ Task 4/6 注释 + Task 9-B ✓
- §9 待标定常量 → Task 8 ✓
- §10 影响面(GOOGL/META/MSFT 放开、NVDA 半放、AAPL 温和、周期不动)→ Task 8 判据 ✓

**2. Placeholder scan:** 无 TBD/TODO;常量有初值(Task 8 确认);每步含真代码/真命令。

**3. Type consistency:** `structuralConfidence` 返回 `{ s, target }` 全程一致;`conservativeNormalized` lift 参数 `{ s, target }` 与 Task 6/4 一致;`roicHelpers(taxRate)` 返回 `{ nopatOf, investedCapitalOf }` 与 Task 5/6 一致;`floor.structural_confidence` 与 Task 6/7/9 一致;`S_RELIABLE`/`UNTESTED_S_CAP`/`DOWNTURN_DROP`/`UNVALIDATED_JUMP_RATIO`/`W_*` 命名全程统一。

**4. 禁改区核对:** conservativeNormalized 下行分支逐字保留(Task 6 测试 D);assessReliability 其余条件不动(Task 7 测试 high_leverage);判定链/moat/增长率封顶/GV 均未在 diff。
