# 护城河 → 竞争优势期(CAP)层 Implementation Plan（估值改造 Phase 2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把竞争优势期(CAP)按护城河分级并拉长（强franchise≈20/中≈10/无=0），只抬乐观上沿、不动保守地基，让优质股天花板可信化。

**Architecture:** 新增 `moatCap.ts`（护城河档→CAP + 耐久性闸，纯函数）。参数化 `ownerEarningsDcf` 的 `projectOe`/`dcfTier`（默认值向后兼容，中性/乐观档传 moat-CAP，悲观档保持基线）。提高 `growthValue` 的 duration。Phase 1 的 `solveImpliedGrowth` 传入同一 CAP。全程只抬 `rangeHi`，`valueFloor`/悲观档不变。

**Tech Stack:** TypeScript 纯函数 + `.check.ts`（tsx 断言）、Next.js RSC、Supabase 快照。

## Global Constraints

- 分支：`plan/valuation-moat-cap-layer`，off `db-foundation` @ 3cc6fa8。
- **执行依赖**：在 Phase 1（`plan/valuation-expectations-layer`）合并**之后**再执行——本层改 Phase 1 复用的 `projectOe`/`dcfTier`。执行时 off 已含 Phase 1 的最新 `db-foundation`。
- **保守地基禁改**：悲观档、`valueFloor`、击球区/安全边际锚**数值不变**；CAP 只抬中性/乐观档 → `rangeHi`。守 [[valuation-mainstream-alignment]]「只温和抬上沿、不放松买入门槛」。
- **终值不动**：GDP 封顶、零超额（`GDP_NOMINAL_CAP`/`MIN_RG_SPREAD` 逻辑不变）。CAP 只延长显式期。
- **护城河不进可靠性闸**：`assessReliability` 不变；护城河只抬内在值。
- **强档 CAP 硬证据闸**：`EPV/AV≥2.0`+dual-AV+盈利未 `declined`+无 AI-hog/高杠杆+ROIC>资本成本历史稳定（只吃 `fiscal_period=FY` 行）。任一缺 → 降中档或不延长。
- 无常驻测试（solo dev）：验证 = `npx tsc --noEmit`（`web/` 下）+ 跑 `.check.ts` + 部署后真数据抽查。**禁** `next build`。
- **禁**碰无关在途文件；**用独立 worktree**（`superpowers:using-git-worktrees`）。

## File Structure

- 新建 `web/src/lib/valuation/moatCap.ts` + `.check.ts` — 护城河档 → CAP + 耐久性闸（纯函数）。
- 改 `web/src/lib/valuation/ownerEarningsDcf.ts` — `projectOe`/`dcfTier` 参数化 CAP（默认向后兼容）；中性/乐观档传 moat-CAP。
- 改 `web/src/lib/valuation/growthValue.ts` — `DURATION_STRONG/MODERATE` 提高、接 moat-CAP。
- 改 `web/src/lib/valuation/impliedExpectations.ts`（Phase 1）— `solveImpliedGrowth` 接受并传入 CAP。
- 改 `web/scripts/valuation-ingest.ts` + `valuationSnapshot.ts` — CAP 判据写入/读回 payload。
- 改 `web/src/app/[lang]/stocks/[ticker]/page.tsx` /（或 `EarningsPowerFloorCard.tsx`）— 披露 CAP 假设。

---

### Task 1: `moatCap` 护城河档 → CAP + 耐久性闸（TDD）

**Files:**
- Create: `web/src/lib/valuation/moatCap.ts`
- Test: `web/src/lib/valuation/moatCap.check.ts`
- Modify: `web/src/lib/valuation/types.ts`（`MoatCapAssessment` 类型）

**Interfaces:**
- Consumes: 现有 `MoatReading`（`epvFloor` 的 `buildMoatReading`，字段 `signal`/`epv_per_share_compared`/`asset_per_share_compared`/`dual_test_passed`）；OE-DCF `declined` 标志；FY `ValuationFloorYear[]`。
- Produces:
  ```ts
  // types.ts
  export type MoatGrade = "strong" | "moderate" | "none";
  export type MoatCapAssessment = {
    grade: MoatGrade;
    capYears: number;          // strong→CAP_STRONG / moderate→CAP_MODERATE / none→0
    durablePassed: boolean;    // 耐久性闸是否通过（strong 必需）
    basis: string;             // 一句话判据（披露用）
    roicStable?: boolean;      // ROIC>资本成本稳定（可算时）
  };
  ```
  ```ts
  export function deriveMoatCap(input: {
    moat: MoatReading;
    epvAvRatio: number | undefined;     // EPV/AV，来自 moat.epv_per_share_compared / asset_per_share_compared
    declined: boolean;                   // OE-DCF 盈利下滑
    suppressedFlags: boolean;            // AI-hog / 高杠杆等（调用方汇总）
    roicStable: boolean | undefined;     // ROIC>贴现率历史稳定（Step 4 计算；不可算时 undefined）
  }): MoatCapAssessment;
  ```

- [ ] **Step 1: 常量 + 类型**

`moatCap.ts` 顶部：
```ts
export const CAP_STRONG = 20;
export const CAP_MODERATE = 10;
export const CAP_NONE = 0;
export const MOAT_STRONG_RATIO = 2.0;   // 与 growthValue.MOAT_STRONG_MULTIPLE 对齐
```
`types.ts` 加 `MoatGrade` / `MoatCapAssessment`（见上）。

- [ ] **Step 2: 写失败测试**

`moatCap.check.ts`：
```ts
import { deriveMoatCap, CAP_STRONG, CAP_MODERATE } from "./moatCap";
function assert(c: boolean, m: string){ if(!c){console.error("FAIL:",m);process.exitCode=1;} else console.log("ok:",m); }
const strongMoat = { signal: "franchise", epv_per_share_compared: 30, asset_per_share_compared: 10, dual_test_passed: true } as any; // ratio 3.0

// 强档：强franchise + 未下滑 + 无红旗 + ROIC 稳定 → CAP_STRONG
{ const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 3.0, declined: false, suppressedFlags: false, roicStable: true });
  assert(r.grade==="strong" && r.capYears===CAP_STRONG && r.durablePassed, "强franchise+稳定 → CAP 20"); }

// 强比率但盈利下滑 → 降中档
{ const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 3.0, declined: true, suppressedFlags: false, roicStable: true });
  assert(r.grade==="moderate" && r.capYears===CAP_MODERATE, "强比率但 declined → 降中档 10"); }

// 强比率但 ROIC 不稳 → 降中档
{ const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 3.0, declined: false, suppressedFlags: false, roicStable: false });
  assert(r.grade==="moderate", "强比率但 ROIC 不稳 → 降中档"); }

// 有红旗 → 降中档（franchise 仍在）
{ const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 3.0, declined: false, suppressedFlags: true, roicStable: true });
  assert(r.grade==="moderate", "红旗 → 不给强档 CAP"); }

// 中franchise（ratio 1.5）→ 中档
{ const mid = { signal:"franchise", epv_per_share_compared:15, asset_per_share_compared:10, dual_test_passed:true } as any;
  const r = deriveMoatCap({ moat: mid, epvAvRatio: 1.5, declined:false, suppressedFlags:false, roicStable:true });
  assert(r.grade==="moderate" && r.capYears===CAP_MODERATE, "中franchise → CAP 10"); }

// 非 franchise → CAP 0
{ const commodity = { signal:"commodity" } as any;
  const r = deriveMoatCap({ moat: commodity, epvAvRatio: 0.9, declined:false, suppressedFlags:false, roicStable:undefined });
  assert(r.grade==="none" && r.capYears===0, "commodity → CAP 0"); }

console.log(process.exitCode ? "SOME TESTS FAILED" : "ALL PASS");
```

- [ ] **Step 3: 运行确认失败**

Run（`web/` 下）：`npx tsx src/lib/valuation/moatCap.check.ts` → 失败（未实现）。

- [ ] **Step 4: 写实现**

`moatCap.ts`：
```ts
import type { MoatReading, MoatCapAssessment, MoatGrade } from "./types";

export const CAP_STRONG = 20;
export const CAP_MODERATE = 10;
export const CAP_NONE = 0;
export const MOAT_STRONG_RATIO = 2.0;

export function deriveMoatCap(input: {
  moat: MoatReading;
  epvAvRatio: number | undefined;
  declined: boolean;
  suppressedFlags: boolean;
  roicStable: boolean | undefined;
}): MoatCapAssessment {
  const { moat, epvAvRatio, declined, suppressedFlags, roicStable } = input;
  if (moat.signal !== "franchise" || epvAvRatio == null || !Number.isFinite(epvAvRatio)) {
    return { grade: "none", capYears: CAP_NONE, durablePassed: false, basis: "无护城河信号，不延长竞争优势期。" };
  }
  const strongRatio = epvAvRatio >= MOAT_STRONG_RATIO && moat.dual_test_passed === true;
  const durablePassed = strongRatio && !declined && !suppressedFlags && roicStable === true;
  if (durablePassed) {
    return { grade: "strong", capYears: CAP_STRONG, durablePassed: true, roicStable: true,
      basis: `强护城河（EPV/AV ${epvAvRatio.toFixed(1)}×、双资产测试通过、ROIC 历史稳定）→ 竞争优势期约 ${CAP_STRONG} 年。` };
  }
  // franchise 但未达强档或耐久性未过 → 中档
  const reason = !strongRatio ? "护城河存在但未达强档" : declined ? "盈利下滑" : suppressedFlags ? "资本开支/杠杆红旗" : "ROIC 稳定性不足";
  return { grade: "moderate", capYears: CAP_MODERATE, durablePassed: false,
    ...(roicStable != null ? { roicStable } : {}),
    basis: `${reason} → 竞争优势期约 ${CAP_MODERATE} 年。` };
}
```

- [ ] **Step 5: ROIC 稳定性度量（数据准确性硬门）**

在 `moatCap.ts` 加（**只吃 FY 行**，稳健、非单年）：
```ts
import type { ValuationFloorYear } from "./types";
export const ROIC_MIN_YEARS = 3;
/**
 * ROIC>资本成本 历史稳定性：逐 FY 年 ROIC = NOPAT / 投入资本，要求窗口内 ≥⅔ 年 > 贴现率。
 * NOPAT 与投入资本口径复用 growthValue/reproduction（实现时核实可干净取得；不可靠→返回 undefined，deriveMoatCap 据此降中档）。
 * 只吃 fiscal_period=FY 行（[[cusip-corruption-episode]] 纪律）；<3 年 → undefined。
 */
export function roicStability(input: {
  fyYears: ValuationFloorYear[];      // 已确认 FY 行
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
  nopatOf: (y: ValuationFloorYear) => number | undefined;
  discountRate: number;
}): boolean | undefined {
  const { fyYears, investedCapitalOf, nopatOf, discountRate } = input;
  const roics: number[] = [];
  for (const y of fyYears) {
    const ic = investedCapitalOf(y), np = nopatOf(y);
    if (ic == null || np == null || !(ic > 0)) continue;
    roics.push(np / ic);
  }
  if (roics.length < ROIC_MIN_YEARS) return undefined;
  const above = roics.filter((x) => x > discountRate).length;
  return above / roics.length >= 2 / 3;
}
```
配套测试（追加到 `.check.ts`）：全部 ROIC 高于贴现率 → true；半数以下 → false；<3 年 → undefined。

- [ ] **Step 6: 运行测试通过 + 类型门**

Run：`npx tsx src/lib/valuation/moatCap.check.ts`（ALL PASS）；`npx tsc --noEmit`（零错）。

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/valuation/moatCap.ts web/src/lib/valuation/moatCap.check.ts web/src/lib/valuation/types.ts
git commit -m "feat(valuation): 护城河档→CAP映射+耐久性闸(强franchise+ROIC稳定→20年)"
```

---

### Task 2: 参数化 OE-DCF 投影为 moat-CAP（保守地基不变）

**Files:**
- Modify: `web/src/lib/valuation/ownerEarningsDcf.ts`
- Test: `web/src/lib/valuation/ownerEarningsDcf.check.ts`（追加不变量断言）

**Interfaces:**
- Produces: `projectOe(oe0, g1, capYears?, highGrowthYears?)`、`dcfTier(oe0, g1, r, shares, gTerminal, capYears?)`——**新增可选参数，默认值 = 现有 10 年行为，完全向后兼容**（Phase 1 现有调用不受影响）。

- [ ] **Step 1: 追加不变量测试（先失败/或先固定基线）**

在 `ownerEarningsDcf.check.ts` 追加：
```ts
// 向后兼容：默认参数 = 原 10 年行为（同一 g 下 perShare 不变）
// 抬上沿：capYears=20 的 perShare > capYears=10（正增长时）
// 悲观档不变：g1=0（零增长）时，capYears 变化不改 perShare（无超额→CAP 无效）
```
（用 `dcfTier` 直接断言：`dcfTier(100,0.08,0.09,10,0.03)` 与 `dcfTier(100,0.08,0.09,10,0.03,10)` 相等；`...,20) > ...,10)`；`dcfTier(100,0,0.09,10,0.03,20) === dcfTier(100,0,0.09,10,0.03,10)`。）

- [ ] **Step 2: 参数化 projectOe**

```ts
export const HIGH_GROWTH_YEARS = 5; // 有界高增长子段（其后线性 fade 到 0）
/** 投影 OE 至 capYears 年：前 min(HIGH_GROWTH_YEARS,cap) 年恒 g1，其后线性 fade g1→0 到第 cap 年。 */
function projectOe(oe0: number, g1: number, capYears: number = PROJECTION_YEARS, highGrowthYears: number = HIGH_GROWTH_YEARS): number[] {
  const H = Math.min(highGrowthYears, capYears);
  const fadeSpan = Math.max(0, capYears - H);
  const path: number[] = [];
  let prev = oe0;
  for (let t = 1; t <= H; t++) { prev = prev * (1 + g1); path.push(prev); }
  for (let t = 1; t <= fadeSpan; t++) { const g = (g1 * (fadeSpan - t)) / fadeSpan; prev = prev * (1 + g); path.push(prev); }
  return path; // length = capYears；cap=10,H=5 时与原实现逐年相等
}
```

- [ ] **Step 3: 参数化 dcfTier**

```ts
function dcfTier(oe0: number, g1: number, r: number, shares: number, gTerminal: number, capYears: number = PROJECTION_YEARS): {
  equity: number; perShare: number; pvTv: number;
} {
  const oe = projectOe(oe0, g1, capYears);
  let pvExplicit = 0;
  for (let t = 1; t <= capYears; t++) pvExplicit += oe[t - 1] / Math.pow(1 + r, t);
  const oeN = oe[capYears - 1];
  const useGordon = gTerminal > 0 && r - gTerminal >= MIN_RG_SPREAD;
  const tv = useGordon ? (oeN * (1 + gTerminal)) / (r - gTerminal) : oeN / r;
  const pvTv = tv / Math.pow(1 + r, capYears);
  const equity = pvExplicit + pvTv;
  return { equity, perShare: equity / shares, pvTv };
}
```
（`export function dcfTier` 若 Phase 1 已导出则保留导出。）

- [ ] **Step 4: 中性/乐观档传 moat-CAP，悲观档保持基线**

读 `buildOeDcf`（或 tier 组装处），把 `deriveMoatCap(...).capYears` 传给**中性/乐观档**的 `dcfTier(..., capYears)`；**悲观档不传（保持默认 10 或其现有零增长底）** → `valueFloor` 不变。
- ⚠️ **可靠性 quick-check 接缝**：`hModelValue` 的 `H=PROJECTION_YEARS/2` 是 neutral 的对账基线。neutral 若用 cap=20，H 应相应用 `capYears/2` 保持可比，避免 `quick_check_flag` 误触发改变 `reliable`。读 quick-check 处，把 neutral 的 capYears 一并传入其 H。

- [ ] **Step 5: 运行测试 + 类型门**

`npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`（含新不变量，ALL PASS）；`npx tsc --noEmit` 零错。

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/valuation/ownerEarningsDcf.ts
git commit -m "feat(valuation): OE-DCF投影参数化为moat-CAP(向后兼容/悲观档不变/只抬上沿)"
```

---

### Task 3: 提高 Greenwald 增长价值 duration 接 moat-CAP

**Files:**
- Modify: `web/src/lib/valuation/growthValue.ts`
- Test: `web/src/lib/valuation/growthValue.check.ts`（若存在，追加；否则加断言块）

**Interfaces:**
- Consumes: `MoatGrade`/CAP（Task 1）。
- 现有：`DURATION_STRONG=10`/`DURATION_MODERATE=8`、franchise-gate、AI-hog gate、`annuityFactor`。

- [ ] **Step 1: duration 接 CAP**

把 `DURATION_STRONG` 提到 `20`、`DURATION_MODERATE` 提到 `10`（与 `moatCap` 的 `CAP_STRONG/CAP_MODERATE` 对齐；或直接 import 复用常量避免漂移）。选 duration 的判据从「EPV/AV≥MOAT_STRONG_MULTIPLE」升级为**复用 `deriveMoatCap` 的 grade**（强→20、中→10），保证增长价值与 OE-DCF 用**同一个 CAP**、同一耐久性闸。franchise-gate/AI-hog gate 不变（无护城河仍 GV=0）。

- [ ] **Step 2: 测试 duration 抬升只增天花板**

追加断言：同一 franchise 输入，duration 20 的 growth value ≥ duration 10；非 franchise 仍 gated_to_zero；`DURATION_PESSIMISTIC_DELTA` 行为保留。

- [ ] **Step 3: 运行 + 类型门**

跑对应 `.check.ts`；`npx tsc --noEmit` 零错。

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/valuation/growthValue.ts
git commit -m "feat(valuation): Greenwald增长价值duration接moat-CAP(强20/中10,同耐久闸)"
```

---

### Task 4: 组合 Phase 1 + ingest/快照 + 呈现披露

**Files:**
- Modify: `web/src/lib/valuation/impliedExpectations.ts`（Phase 1 的 `solveImpliedGrowth` 接 CAP）
- Modify: `web/scripts/valuation-ingest.ts`、`web/src/lib/valuation/valuationSnapshot.ts`
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`（或 `EarningsPowerFloorCard.tsx`）

**Interfaces:**
- Consumes: `deriveMoatCap`（Task 1）、参数化 `dcfTier`（Task 2）。

- [ ] **Step 1: Phase 1 反向解传入 CAP**

`solveImpliedGrowth`/`deriveExpectations` 增加可选 `capYears`，内部 `dcfTier(..., capYears)`。ingest 处把 `deriveMoatCap(...).capYears`（**中性/乐观档同一 CAP**）传入 → 优质股隐含增长自动变低。加断言：同票 capYears↑ → 解出的隐含 g↓。

- [ ] **Step 2: 写入/读回 payload**

`valuation-ingest.ts` 把 `MoatCapAssessment`（grade/capYears/basis）塞进 `valuation_snapshot.payload.moatCap`；`valuationSnapshot.ts` 读回强类型。无需改表。

- [ ] **Step 3: 呈现披露 CAP 假设**

个股页估值小节标注（仅当 `moatCap.grade!=="none"`）：
- zh：「假设{强/一般}护城河 · 竞争优势期约 {capYears} 年（{basis}）。」
- en：同构。
- 无买卖/目标价；`--tt-*` token；双 locale 纯本语言（遵 `web/docs/copy-voice.md`）。
- 降级：`grade==="none"` 或缺字段 → 不渲染披露、天花板等同基线。

- [ ] **Step 4: 类型门 + 组合验证**

`npx tsc --noEmit` 零错；跑 Phase 1/Task 1 的 `.check.ts` 确认组合不回归。

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/valuation/impliedExpectations.ts web/scripts/valuation-ingest.ts web/src/lib/valuation/valuationSnapshot.ts web/src/app/\[lang\]/stocks/\[ticker\]/page.tsx
git commit -m "feat(valuation): moat-CAP组合Phase1反向解+写快照+个股页披露竞争优势期"
```

---

## 验收（部署后）

1. 各 Task `.check.ts` 全 PASS、`npx tsc --noEmit` 零错。
2. **保守地基不变量**：抽查数只票，确认 `valueFloor`/悲观档/安全边际数值 Phase 2 前后**不变**，仅 `rangeHi` 升（用 tsx 对比）。
3. 跑 `npm run valuation:ingest`（授权后）→ `payload.moatCap` 落字段。
4. 真数据抽查：
   - AAPL/GOOGL/MCO/V 等强护城河股：`rangeHi` 明显升高、bucket 从 above_optimistic 更可能落 within/approaching；个股页出现「竞争优势期约 20 年」披露。**但天花板≠现价**（不追涨），仍高于时由 Phase 1 反向解释。
   - 周期/高杠杆/盈利下滑股：CAP 不延长（grade none/moderate），不受益。
   - 强比率但 `declined` 的周期峰值股：降中档，验证耐久性闸生效。
5. **ROIC 准确性对账**：对 AAPL/MCO/一只周期股打印逐 FY 年 ROIC（NOPAT/投入资本）+ 稳定性判定，人工比对 SEC 口径；ROIC 不可干净计算时确认已降级为「franchise 稳定性」近似并披露。
6. 合规核对：无买卖/目标价；CAP 假设已披露可辩。

## Self-Review

- **Spec 覆盖**：§三分级 CAP → Task 1；§三两条腿 → Task 2(OE-DCF)+Task 3(GV)；§四只抬上沿 → Task 2 Step 1/4 不变量 + 悲观档不传 CAP；§五耐久性闸 → Task 1 Step 4/5；§七 Phase 1 组合 → Task 4 Step 1；§八披露 → Task 4 Step 3；§九留存 → Task 4 Step 2；§十测试 → 各 Task `.check.ts` + 验收。无遗漏。
- **占位扫描**：无 TBD/TODO；映射/投影/ROIC 均有实现代码；ROIC 口径「实现时核实、不可靠则降级披露」是显式降级路径非占位。
- **类型一致**：`MoatCapAssessment`（grade/capYears/durablePassed/basis/roicStable）Task 1 定义，Task 3/4 消费同名；`projectOe`/`dcfTier` 新增可选参数默认向后兼容，Phase 1 旧调用不破。
- **数据准确性**：ROIC 稳定性只吃 FY 行、≥⅔ 年阈值、<3 年 undefined→降级；验收 #5 SEC 对账。守 CLAUDE.md。
- **顺序/不变量**：Task 1（映射）→ 2（OE-DCF 参数化，含向后兼容不变量）→ 3（GV duration）→ 4（组合+呈现）；每步保守地基数值不变、任一提交点不破坏构建。执行须在 Phase 1 合并后、off 含 Phase 1 的 db-foundation。
