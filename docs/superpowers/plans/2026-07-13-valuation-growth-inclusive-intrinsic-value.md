# 含增长内在值 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把内在值/买点的锚从「零增长 EPV 底」升到「含增长中枢 IV」,让优质成长股的估值有信息量,同时用四道闸 + 三处主流对齐调整防止为抬估值而抬。

**Architecture:** 增长率来源从端点净利 CAGR 换成「min(历史营收 log 回归, ROIC×再投资率) 再受 franchise 分档量级封顶」(改 A/B);中枢 IV 复用已有的 `oeDcf.tiers.neutral.per_share`(无需新字段);`deriveValuationVerdict` 判定改锚 IV 并把固定 1/3 折价换成随 growthReliance 浮动(改 C);零增长 F 保留为披露的下行锚;单一价值带呈现只换头条锚不新增范围。

**Tech Stack:** TypeScript 纯函数层(`web/src/lib/valuation/`)、`.check.ts` 断言(`npx tsx`)、`tsc --noEmit` 门;RSC 组件(`EarningsPowerFloorCard.tsx`);ingest 快照(Supabase)。

## Global Constraints

- **实施分支**:off `plan/valuation-aicapex-moat-decouple`(含 Phase 1/2/2.5;2.5 尚未并入 db-foundation)。worktree 用 subagent-driven 执行时创建。
- **回复/文档正文一律中文**(代码/术语/路径除外)。
- **数据准确性**:任何真数据抽查必须标来源(SEC/生产 Supabase)+ 日期。
- **CAGR 硬门**:`g_raw` 只用 `historicalGrowthBaseRate`(FY 行、营收 log 回归),**禁**用 `netIncomeCagr` 充当 `g_raw`;`sustainableGrowth` 同守 FY 行 + 有效性过滤。
- **地基护栏(端到端逐位不变,禁破)**:`assessReliability` 及其全部输入、`isImplausibleBand`/`SANE_MARGIN_MAX`、`netNet`、`coverage`、零增长 `F`(`epv.valueFloor`)的计算、Phase 2/2.5 的 `moatCap` 判定——全不改,只**消费**。
- **单一估值展示位**:沿用现有价值带(ValueSpine),只换头条锚,**不新增第二条范围 / 第二个估值展示位**。
- **禁 `next build`**(本机 google fonts 被墙);本地门 = `tsc --noEmit` + `.check.ts`。
- **禁裸 `git stash`**。
- **`npm run valuation:ingest` 写生产 Supabase 需用户授权**;只读抽查可借 env。
- **PR 走网页**(用户非 collaborator)。
- 常量集中:`GROWTH_CAP_FRANCHISE=0.20`、`GROWTH_CAP_BASE=0.07`、`MOS_BASE=1/3`、`MOS_MAX=0.45`;移除/替换旧 `GROWTH_CAP=0.10`。

---

### Task 1: `sustainableGrowth` 纯函数 + 字段可得性验证 + epvFloor 接线

**Files:**
- Modify: `web/src/lib/valuation/moatCap.ts`(新增 `sustainableGrowth` + 常量,与 `roicStability`/`roicTrend` 并列)
- Modify: `web/src/lib/valuation/types.ts`(`ValuationFloor` 加 `sustainable_growth?: number`)
- Modify: `web/src/lib/valuation/epvFloor.ts`(在 `computeValuationFloor` 里调用并存 `sustainable_growth`,复用已有 `nopatOf`/`investedCapitalOf` 闭包)
- Test: `web/src/lib/valuation/moatCap.check.ts`(追加 `sustainableGrowth` 断言)
- Verify(经验未知): 真数据字段填充率探针(临时脚本,验后删)

**Interfaces:**
- Consumes: `ValuationFloorYear`(有 `capex`/`d_and_a`/`working_capital`/`operating_income`/`income_tax_expense`/`net_income`/`shareholders_equity`,均 optional);epvFloor 已有的 `nopatOf(y)`/`investedCapitalOf(y)`(负/零权益 → undefined)。
- Produces:
  ```ts
  export const SUSTAINABLE_MIN_YEARS = 3;
  export function sustainableGrowth(input: {
    fyYears: ValuationFloorYear[];
    nopatOf: (y: ValuationFloorYear) => number | undefined;
    investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
  }): number | undefined;   // = ROIC × 净再投资率,年化;不可评估 → undefined
  ```
  `ValuationFloor` 新增字段 `sustainable_growth?: number`。

- [ ] **Step 1: 字段可得性探针(先验证经验未知,决定口径)**

写临时脚本 `web/scripts/probe-reinvestment.ts`(参照现有 probe 模式:`async function main(){...} main().catch(...)`,scripts/tsconfig.json 桩),用真 loader 对 AAPL / MSFT / NVDA 取 `ValuationFloorYear[]`,打印每年 `capex`/`d_and_a`/`working_capital`/`operating_income`/`income_tax_expense` 的非空率。

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-reinvestment.ts`
Expected: 打印三票近 6 年各字段填充情况。**判定**:若 `capex`+`d_and_a` 基本齐(≥4 年)→ 用净再投资口径;若 `working_capital` 稀疏 → ΔWC 缺失年按 0 处理(退化为 (capex−D&A)/NOPAT)。记录结论到 report,**删除探针**。

- [ ] **Step 2: 写失败测试(`sustainableGrowth`)**

在 `moatCap.check.ts` 追加(合成 IC=100 序列,ROIC=NOPAT/100;再投资率由 capex/D&A/WC 合成):
```ts
import { sustainableGrowth, SUSTAINABLE_MIN_YEARS } from "./moatCap";
// G) 稳健:ROIC 20% × 净再投资率 40% → g ≈ 8%
{ const years = [2020,2021,2022,2023].map((fy,i)=>({ fiscal_year: fy,
    operating_income: 20, income_tax_expense: 0, capex: 12, d_and_a: 4, working_capital: 0,
  })) as ValuationFloorYear[];
  const r = sustainableGrowth({ fyYears: years,
    nopatOf: () => 20, investedCapitalOf: () => 100 });
  assert(r != null && Math.abs(r - 0.20*((12-4)/20)) < 1e-6, "sustainableGrowth = ROIC×净再投资率 (0.20×0.40=0.08)"); }
// H) NOPAT≤0 的年被有效性过滤;有效年 <SUSTAINABLE_MIN_YEARS → undefined
{ const years = [2022,2023].map((fy)=>({ fiscal_year: fy, capex: 10, d_and_a: 3 })) as ValuationFloorYear[];
  const r = sustainableGrowth({ fyYears: years, nopatOf: () => 20, investedCapitalOf: () => 100 });
  assert(r === undefined, `<${SUSTAINABLE_MIN_YEARS} 有效年 → undefined`); }
// I) 再投资率为负(D&A>capex,净收缩)→ clamp 到 0(不给负增长,交给 declined 处理)
{ const years = [2020,2021,2022,2023].map((fy)=>({ fiscal_year: fy, capex: 2, d_and_a: 8, working_capital: 0 })) as ValuationFloorYear[];
  const r = sustainableGrowth({ fyYears: years, nopatOf: () => 20, investedCapitalOf: () => 100 });
  assert(r === 0, "净再投资率<0 → g clamp 到 0"); }
// J) investedCapital 全 undefined(负权益)→ undefined
{ const years = [2020,2021,2022,2023].map((fy)=>({ fiscal_year: fy, capex: 12, d_and_a: 4 })) as ValuationFloorYear[];
  const r = sustainableGrowth({ fyYears: years, nopatOf: () => 20, investedCapitalOf: () => undefined });
  assert(r === undefined, "investedCapital 不可得 → undefined"); }
```

Run: `cd web && npx tsx src/lib/valuation/moatCap.check.ts`
Expected: FAIL(`sustainableGrowth` 未定义)

- [ ] **Step 3: 实现 `sustainableGrowth`**

在 `moatCap.ts` 加(紧邻 `roicTrend`):
```ts
export const SUSTAINABLE_MIN_YEARS = 3;
/**
 * 可持续增长率 g = ROIC × 净再投资率(Damodaran 增长内生化)。用作 g_used 的基本面上限。
 * ROIC = 成熟段 NOPAT/投入资本(复用有效性过滤:investedCapital 负/零权益→undefined;剔非有限);
 * 净再投资率 = mean((capex − d_and_a + ΔWC) / NOPAT);ΔWC 缺失年按 0。负再投资率 clamp 到 0。
 * 上限用途,偏低不偏高;有效年 <SUSTAINABLE_MIN_YEARS 或分母不成立 → undefined。
 */
export function sustainableGrowth(input: {
  fyYears: ValuationFloorYear[];
  nopatOf: (y: ValuationFloorYear) => number | undefined;
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
}): number | undefined {
  const { fyYears, nopatOf, investedCapitalOf } = input;
  const sorted = [...fyYears].sort((a, b) => a.fiscal_year - b.fiscal_year); // 升序,供 ΔWC
  const roics: number[] = [];
  const reinvest: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const y = sorted[i];
    const nopat = nopatOf(y);
    const ic = investedCapitalOf(y);
    if (nopat == null || ic == null || !(ic > 0) || !Number.isFinite(nopat)) continue;
    const roic = nopat / ic;
    if (!Number.isFinite(roic) || Math.abs(roic) > ROIC_SANITY) continue;
    if (!(nopat > 0)) continue; // 净再投资率分母须正
    roics.push(roic);
    const capex = y.capex ?? 0;
    const da = y.d_and_a ?? 0;
    const prevWc = i > 0 ? sorted[i - 1].working_capital : undefined;
    const dWc = y.working_capital != null && prevWc != null ? y.working_capital - prevWc : 0;
    const rate = (capex - da + dWc) / nopat;
    reinvest.push(Math.max(0, rate)); // 负再投资率(净收缩)→ 0
  }
  if (roics.length < SUSTAINABLE_MIN_YEARS) return undefined;
  const meanRoic = roics.reduce((s, v) => s + v, 0) / roics.length;
  const meanReinvest = reinvest.reduce((s, v) => s + v, 0) / reinvest.length;
  const g = meanRoic * meanReinvest;
  return Number.isFinite(g) ? Math.max(0, g) : undefined;
}
```
(`ROIC_SANITY` 已在 `moatCap.ts` 导出,复用。)

- [ ] **Step 4: 运行测试通过**

Run: `cd web && npx tsx src/lib/valuation/moatCap.check.ts`
Expected: `ALL PASS`

- [ ] **Step 5: epvFloor 接线 + types 字段**

在 `types.ts` 的 `ValuationFloor` 加 `sustainable_growth?: number;`(紧邻 `moat_cap`)。
在 `epvFloor.ts` 的 `computeValuationFloor` 里,`moat_cap` 计算处附近(已有 `nopatOf`/`investedCapitalOf` 闭包),加:
```ts
const sustainable_growth = sustainableGrowth({ fyYears: years, nopatOf, investedCapitalOf });
```
并把 `sustainable_growth` 放进返回的 `ValuationFloor` 对象(`kind:"floor"` 分支)。import 从 `./moatCap`。

- [ ] **Step 6: tsc + 全套 check 门**

Run: `cd web && npx tsc --noEmit && npx tsx src/lib/valuation/moatCap.check.ts && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: tsc 零错;两 check `ALL PASS`。

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/valuation/moatCap.ts web/src/lib/valuation/types.ts web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/moatCap.check.ts
git commit -m "feat(valuation): sustainableGrowth 纯函数(ROIC×净再投资率)+ epvFloor 接线 floor.sustainable_growth

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `g_used` 推导改造(证据驱动 + 基本面上限 + franchise 分档)

**Files:**
- Modify: `web/src/lib/valuation/ownerEarningsDcf.ts:13`(常量)、`:276-279`(g1 推导)
- Test: `web/src/lib/valuation/ownerEarningsDcf.check.ts`(g1 推导断言)

**Interfaces:**
- Consumes: `historicalGrowthBaseRate(years)`(`./impliedExpectations`,营收 log 回归);`floor.sustainable_growth`(Task 1);`floor.moat_cap.grade`(`"strong"|"moderate"|"none"`);现有 `netIncomeCagr`(保留供 `declined` + `cagr_raw` 披露)。
- Produces: `deriveOeDcf` 内 `g1` 语义变为 `declined ? 0 : clamp(min(finite[gRaw,gFund,cagrFallback]), 0, cap)`;`tiers.neutral.per_share` 自动成为新的含增长中枢 IV(下游 Task 3 消费)。导出 `GROWTH_CAP_FRANCHISE`/`GROWTH_CAP_BASE`。

- [ ] **Step 1: 写失败测试**

在 `ownerEarningsDcf.check.ts` 加(若无该文件则创建,参照其它 `.check.ts` 的 `assert`/`ALL PASS` 收尾;用真 `deriveOeDcf` + 合成 `ValuationFloor`):
```ts
// 构造 helper:合成一个 assessable 的 ValuationFloor,可注入 revenue 序列 / sustainable_growth / moat grade。
// 断言(用返回的 oeDcf.growth_g1):
// K) strong 档 + 历史增速 15% + 基本面 25% → g_used = min(15%,25%) 受 franchise cap 20% → 0.15
// L) strong 档 + 历史 25% + 基本面 25% → min=25% 被 cap 20% 封 → 0.20
// M) 非 strong(moderate)+ 历史 12% → 被 GROWTH_CAP_BASE 0.07 封 → 0.07
// N) 基本面 5% < 历史 15%(无 franchise 支撑的历史外推)→ min → 0.05(基本面上限咬住)
// O) declined(净利下滑)→ g_used = 0
// P) gRaw 与 gFund 都缺 → 退回 clamp(netIncomeCagr,0,cap)
```

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`
Expected: FAIL

- [ ] **Step 2: 常量**

`ownerEarningsDcf.ts:13` 替换:
```ts
export const GROWTH_CAP_FRANCHISE = 0.20; // 已验证 franchise(moat strong):Mauboussin 上沿,须 ROIC×再投资支撑
export const GROWTH_CAP_BASE = 0.07;      // 非 franchise:贴近名义 GDP+小幅;主流不认无护城河的长期高增长
```
全量搜旧 `GROWTH_CAP` 引用(`grep -rn "GROWTH_CAP" web/src`),逐一迁移或删除,确保无遗留裸 `GROWTH_CAP`。

- [ ] **Step 3: g1 推导改造**

`ownerEarningsDcf.ts:276-279` 改为:
```ts
const windowYears = years.filter((y) => lamp.method.years_used.includes(y.fiscal_year));
const { cagr, window } = netIncomeCagr(windowYears.length >= 2 ? windowYears : years); // 保留:declined + cagr_raw 披露
const declined = cagr != null && cagr < 0;

// 证据驱动增长:历史营收 log 回归(抗端点)与基本面上限(ROIC×再投资)取小,再受 franchise 分档量级封顶。
const gRaw = historicalGrowthBaseRate(years);                 // 全历史 FY 营收 log 回归
const gFund = floor.sustainable_growth;                        // Task 1
const cap = floor.moat_cap?.grade === "strong" ? GROWTH_CAP_FRANCHISE : GROWTH_CAP_BASE;
const cagrFallback = cagr != null && cagr > 0 ? cagr : undefined;
const candidates = [gRaw, gFund, cagrFallback].filter(
  (n): n is number => n != null && Number.isFinite(n) && n >= 0,
);
// gRaw/gFund 皆缺 → candidates 仅剩 cagrFallback(今天行为,但用新 cap);全缺 → 0。
const g1 = declined ? 0 : candidates.length ? clamp(Math.min(...candidates), 0, cap) : 0;
```
import `historicalGrowthBaseRate` from `./impliedExpectations`。**注意循环依赖**:`impliedExpectations.ts` 已 `import { dcfTier } from "./ownerEarningsDcf"`;新增反向 import 会成环。**解法**:把 `historicalGrowthBaseRate` 移到无依赖的小模块(如新建 `web/src/lib/valuation/growthBaseRate.ts`),两处都从它 import;或在 `deriveOeDcf` 的调用方(epvFloor/组合层)预算 `gRaw` 传入。**Task 2 采用**:新建 `growthBaseRate.ts` 承载 `historicalGrowthBaseRate` + `MIN_BASE_RATE_YEARS`,`impliedExpectations.ts` 改从它 re-export(保持对外 API 不变),`ownerEarningsDcf.ts` 从它 import。先做这步再改 g1。

- [ ] **Step 4: 运行测试通过 + 循环依赖验证**

Run: `cd web && npx tsc --noEmit && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts && npx tsx src/lib/valuation/impliedExpectations.check.ts`
Expected: tsc 零错(无循环依赖报错);两 check `ALL PASS`。

- [ ] **Step 5: 地基解耦回归(reliable 逐位不变)**

确认 `neutralBaselineRun`(cap=10)、`quickPerShare`(hModel 同 g1)、`assessReliability` 输入不受 g1 量级改变影响其**布尔结论**:新加断言证明——同一 floor 下,把 g1 从旧 0.10 口径换到新口径后,`diagnostics.quick_check_flag`、`declined`、`high_leverage_warning`、`oe_yield_flag` 不变(reliable 稳定)。

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`
Expected: `ALL PASS`

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/valuation/ownerEarningsDcf.ts web/src/lib/valuation/growthBaseRate.ts web/src/lib/valuation/impliedExpectations.ts web/src/lib/valuation/ownerEarningsDcf.check.ts
git commit -m "feat(valuation): g_used 证据驱动(min(历史log回归, ROIC×再投资率))+ franchise 分档封顶(strong 20%/其它 7%)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `deriveValuationVerdict` 判定改锚含增长中枢 IV + 浮动安全边际

**Files:**
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts`
- Test: `web/src/lib/valuation/deriveValuationVerdict.check.ts`

**Interfaces:**
- Consumes: `oeDcf.tiers?.neutral.per_share`(含增长中枢 IV)、`oeDcf.assessable`;`epv.valueFloor`(F,下行锚)、`epv.position`(单灯兜底);现有 `conservative`/`growth`/`ends`/`rangeHi`。
- Produces: `ValuationVerdict` 语义变化——`inStrikeZone`/`bucket`/`marginPct` 锚 IV(有中枢时);`rangeLo` 仍 = F。新增内部 `MOS_BASE`/`MOS_MAX` 常量。**类型 shape 不变**(下游零改动)。

- [ ] **Step 1: 写失败测试**

在 `deriveValuationVerdict.check.ts` 加:
```ts
// 有中枢 IV:锚换到 IV,浮动 MOS
// Q) 纯价值股 IV≈F(growthReliance≈0)→ MOS=1/3;price ≤ IV×2/3 → inStrikeZone
// R) 重增长股 IV=2×F(growthReliance=0.5)→ MOS=1/3+(0.45−1/3)×0.5;price 需更低才 inStrikeZone
// S) bucket:price<IV→below;IV≤price≤H→within;price>H→above
// T) marginPct = (IV−price)/IV(非 valueFloor)
// U) 单灯兜底:oeDcf 不可评估/tiers 缺 → 退回 epv.position 锚(今天行为逐位不变)
// V) reliable=false(如 declined)仍不标 inStrikeZone(四闸保留)
// W) 地基回归:isImplausibleBand/netNet/coverage 在换锚后逐位不变(构造对照断言)
```

Run: `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
Expected: FAIL

- [ ] **Step 2: 实现改锚 + 浮动 MOS**

`deriveValuationVerdict.ts`:加常量
```ts
export const MOS_BASE = 1 / 3;   // Graham 经典折价(纯价值股)
export const MOS_MAX = 0.45;     // 重增长/长 CAP 依赖时折价上限(Graham 随激进度浮动)
```
在 `rangeHi`/`rangeLo` 之后、`bucket` 之前插入中枢锚逻辑:
```ts
const F = epv.valueFloor;
const ivRaw = oeDcf?.assessable ? oeDcf.tiers?.neutral.per_share : undefined;
const hasIv = ivRaw != null && Number.isFinite(ivRaw) && ivRaw > 0;
const IV = hasIv ? (ivRaw as number) : undefined;
```
把 `bucket`/`inStrikeZone`/`marginPct` 改为:
```ts
let bucket: VerdictBucket;
let inStrikeZone: boolean;
let marginPct: number | null;
if (IV != null) {
  const growthReliance = IV > F ? clamp01((IV - F) / IV) : 0;
  const mos = MOS_BASE + (MOS_MAX - MOS_BASE) * growthReliance;
  bucket = price < IV ? "below" : price <= rangeHi ? "within" : "above";
  inStrikeZone = price <= IV * (1 - mos);
  marginPct = IV > 0 ? (IV - price) / IV : null;
} else {
  // 单灯兜底:无含增长中枢 → 退回今天的 EPV 锚(保守,逐字保留)
  bucket = (bothMethods ? bucketFromConsistency(reconciliation?.consistency) : null) ?? bucketFromPosition(epv.position);
  inStrikeZone = epv.position === "in_strike_zone";
  const valueFloor = epv.valueFloor;
  marginPct = valueFloor > 0 ? (valueFloor - price) / valueFloor : null;
}
```
加内部 `function clamp01(x:number){return Math.min(1,Math.max(0,x));}`。`rangeLo` 仍 = `epv.valueFloor`(F)。**`isImplausibleBand` 调用移到 `marginPct` 之后**,用新 `marginPct`(锚 IV)入参——验证 §Step 3。更新 `ValuationVerdict` 字段 JSDoc(marginPct/inStrikeZone/rangeLo 改述为「有中枢时锚含增长中枢 IV,单灯退回零增长底」)。

- [ ] **Step 3: 换锚后 isImplausibleBand 正确性验证**

新加断言:IV≥F 时同价位下 `marginPct` 变小,`isImplausibleBand` 的 `marginPct>0.8` 更难触发(不会把健康成长股误判坏数据抑制);退化带(price/rangeLo/rangeHi 非法)仍抑制。

Run: `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
Expected: `ALL PASS`

- [ ] **Step 4: tsc + 全 valuation check 门**

Run: `cd web && npx tsc --noEmit && for f in web/src/lib/valuation/*.check.ts; do npx tsx "$f" || exit 1; done`
Expected: tsc 零错;全部 `ALL PASS`。

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/valuation/deriveValuationVerdict.ts web/src/lib/valuation/deriveValuationVerdict.check.ts
git commit -m "feat(valuation): 判定改锚含增长中枢 IV + 安全边际随 growthReliance 浮动(1/3→45%);单灯退回 EPV 锚;四闸保留

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 单一价值带呈现(头条锚 IV + 假设明示行)

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`(ValueSpine 头条数与假设行)
- 只读参照: masthead / 投资人页叠加 / screener 徽章(确认都走 `deriveValuationVerdict`,不另算)

**Interfaces:**
- Consumes: `ValuationVerdict`(bucket/inStrikeZone/rangeLo=F/rangeHi=H/marginPct/reliable);`oeDcf.tiers.neutral.per_share`(IV,展示头条);`oeDcf.growth_g1`、`moat_cap.capYears`、`discount.midpoint`、`F` 用于假设行。
- Produces: 单一价值带 UI:头条 = IV;带 `F ●━IV━● H` + 现价标记;假设行「营收增 X% · 护城河 Y 年 · 折现 W% · 零增长下行 $F」;reliable=false 标低信心。**不新增第二条范围。**

- [ ] **Step 1: 读现有 ValueSpine 呈现,定位头条数与带端点**

读 `EarningsPowerFloorCard.tsx`,找到现有价值带渲染(rangeLo/rangeHi/现价标记)与头条数字来源。确认现在头条=零增长底,改为 IV。

- [ ] **Step 2: 头条换 IV + 假设行**

- 头条数字 → `oeDcf.tiers.neutral.per_share`(IV);徽章/安全边际用 `verdict`(已锚 IV)。
- 带:下沿 `verdict.rangeLo`(F)→ 中枢 IV 标记 → 上沿 `verdict.rangeHi`(H);现价标记不变。
- 假设行(中文,遵 `docs/copy-voice.md` 去 AI 腔):`营收增 {g_used%}(近{n}年营收回归·基本面封顶) · 护城河 {capYears}年 · 折现 {midpoint%} · 零增长下行 ${F}`。
- reliable=false:整带照显 + 「当年数字低信心,不触发击球区」注脚(复用现有 reliable 文案位)。
- **不新增第二条带**;masthead/投资人/screener 不改(已引用同一 verdict)。

- [ ] **Step 3: tsc 门(禁 next build)**

Run: `cd web && npx tsc --noEmit`
Expected: 零错。(组件渲染验证靠 tsc + 部署后真机;本机 google fonts 被墙不跑 build。)

- [ ] **Step 4: Commit**

```bash
git add web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(valuation): 单一价值带头条锚含增长中枢 IV + 假设明示行(增长来源/护城河/折现/零增长下行)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 组合验证 + 快照 payload 确认 + 真数据全景抽查

**Files:**
- 只读/确认: `web/scripts/*ingest*`（valuation 快照写入路径,确认 verdict 字段随口径变自动更新,无需改 schema）
- Verify: 真引擎全景抽查脚本(临时,验后删)

**Interfaces:**
- Consumes: 全链 `computeValuationFloor` → `deriveOeDcf` → `deriveValuationVerdict`。
- Produces: 抽查报告(哪些票迁档、是否正当);确认快照 payload 无需 schema 改动(bucket/inStrikeZone/marginPct/rangeLo/rangeHi 已在快照,重跑 ingest 即更新)。

- [ ] **Step 1: 快照 payload 审查**

读 ingest 写快照处,确认存的是 `deriveValuationVerdict` 结论字段(bucket/inStrikeZone/rangeLo/rangeHi/marginPct/reliable)。若字段名不变 → 无需改 ingest 代码,仅重跑;若快照另存了「零增长底」语义字段需随头条改 → 在此调整并说明。

- [ ] **Step 2: 真数据全景抽查(经验未知,需 env 只读)**

临时脚本对 **AAPL / MSFT / NVDA / META / GOOGL + 一个无护城河高价股(如某周期股)+ 一个 reliable=false 股** 跑全链,打印每票:`gRaw / gFund / cap / g_used / F / IV / H / growthReliance / MOS / bucket / inStrikeZone / reliable`。

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-growth-verdict.ts`
Expected 并**记录**:
- MSFT/NVDA(Phase 2.5 已确认 strong)→ IV 显著 > F、g_used 可达 20% 档、bucket 从 above 迁 within/below **且理由正当**(增长有 gFund 支撑);
- 无护城河高价股 → cap=7% 压住,IV 不虚高;
- reliable=false 股 → 即便 IV 高**不触发 inStrikeZone**;
- 如实记录哪几只迁档、哪几只仍 above(正当)。数据来源标 SEC/生产 Supabase + 日期(2026-07-13)。**删除探针。**

- [ ] **Step 3: 全量门 + 地基回归总证**

Run: `cd web && npx tsc --noEmit && for f in web/src/lib/valuation/*.check.ts; do npx tsx "$f" || exit 1; done`
Expected: tsc 零错;全 `ALL PASS`(含 Task 1-3 的地基逐位不变断言)。

- [ ] **Step 4: Commit(若 Step 1 有 ingest 调整;否则跳过)**

```bash
git add web/scripts/... && git commit -m "chore(valuation): 快照 payload 随含增长口径确认/微调 + 真数据抽查记录"
```

---

### Task 6: 终审 + PR

- [ ] **Step 1: 全量验证门**

Run: `cd web && npx tsc --noEmit && for f in web/src/lib/valuation/*.check.ts; do echo "== $f"; npx tsx "$f" || exit 1; done`
Expected: 零错 + 全 `ALL PASS`。

- [ ] **Step 2: 地基护栏终证(逐条对照 Global Constraints)**

人工核 diff:`assessReliability` 及输入、`isImplausibleBand`/`SANE_MARGIN_MAX`、`netNet`、`coverage`、零增长 F 计算、moatCap 判定——逐位未改(只消费)。单一估值展示位未新增第二范围。

- [ ] **Step 3: opus 终审(subagent-driven 的 final whole-branch review)**

由控制器 dispatch 最强模型做 whole-branch review(Critical/Important 必修)。

- [ ] **Step 4: PR(走网页)**

用户非 collaborator:准备 PR 标题/正文(中文),提示用户在网页开 PR → db-foundation(或 base = `plan/valuation-aicapex-moat-decouple`,取决于 2.5 是否已先合)。**部署待办**:合并后跑 `npm run valuation:ingest`(GitHub Actions「Valuation Snapshot」workflow_dispatch,授权)重刷快照面;个股页实时算合并即生效。

---

## Self-Review(plan 对照 spec)

- **spec §4.1 g_used** → Task 2 ✅;**§4.2 中枢 IV** → 复用 `tiers.neutral.per_share`,Task 3 消费 ✅(spec 说「新增 per_share_mid」,实现发现已存在 → 用现成,更省,已在 Task 3 注明);**§4.3 判定改锚+四闸+单灯兜底** → Task 3 ✅;**§4.4 单一价值带** → Task 4 ✅;**§5 sustainableGrowth** → Task 1 ✅;**§6 常量** → Task 1/2/3 ✅;**§7 地基护栏** → Task 3/5/6 回归断言 ✅;**§8 QA(数据可得性+全景抽查+CAGR硬门)** → Task 1 Step 1 + Task 5 Step 2 ✅。
- **类型一致**:`sustainableGrowth` 签名(Task 1)= `deriveOeDcf` 消费 `floor.sustainable_growth`(Task 2)= `types.ValuationFloor.sustainable_growth`;`IV=oeDcf.tiers.neutral.per_share`(Task 3)与 `OeDcfAssessment.tiers`(现有)一致。
- **循环依赖**:Task 2 Step 3 已识别 `impliedExpectations↔ownerEarningsDcf` 环,解法=抽 `growthBaseRate.ts`。
- **无占位符**:所有 Step 含具体代码/命令/期望;真数据具体数值下放到 `.check.ts` 与抽查(经验未知,plan 不硬编真值)。
