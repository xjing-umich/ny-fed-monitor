# 估值编排清晰化（`runValuation` + coverage）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 抽出单一编排入口 `runValuation`，并把 `coverage=full` 纠正为「零增长 EPV + OE-DCF 都齐」（不再绑 Greenwald GV ceilings），使 AI-hog 等票不再被误标单法。

**Architecture:** 新增纯函数 `deriveValuationMethods`（三旗唯一派生点）→ `deriveValuationVerdict` 用其填 `coverage`/`methods`；`runValuation` 固定 pipeline 供 page/ingest 共用；卡片用三态 `verdict` prop 消灭双算。公式、bucket、IV 锚、MOS、`assessReliability` 零漂移。

**Tech Stack:** TypeScript（`web/`）；纯函数 + `.check.ts`（`npx tsx --tsconfig scripts/tsconfig.json <file>.check.ts`）；RSC page + `valuation-ingest` 脚本。

**Spec:** `docs/superpowers/specs/2026-07-19-valuation-orchestration-clarity-design.md`

## Global Constraints

- **约束 A：** coverage / badge `*` / badge 文案允许变；bucket / reliable / IV / MOS **逐位不变**（有 IV 路径）。
- **不擅自跑写库：** `npm run valuation:ingest` 须用户显式授权。
- **文案：** `docs/copy-voice.md`；en/zh 独立。
- **回复与 plan 正文中文**（[[reply-and-plan-in-chinese]]）。
- **TDD：** 每个纯函数改动先改/加 `.check.ts` 再实现。
- **卡片 prop：** `verdict?: ValuationVerdict | null` — `undefined`=遗留自算；`null`=权威抑制不渲染 spine；对象=只展示。生产 page **必须**传 `run.verdict`。

## File map

| 文件 | 职责 |
|---|---|
| Create `web/src/lib/valuation/deriveValuationMethods.ts` | 三旗派生 |
| Create `web/src/lib/valuation/deriveValuationMethods.check.ts` | 单测 |
| Create `web/src/lib/valuation/runValuation.ts` | 编排入口 |
| Create `web/src/lib/valuation/runValuation.check.ts` | 编排测 |
| Modify `deriveValuationVerdict.ts` | coverage 新语义；入参 `methods`；返回带 `methods` |
| Modify `deriveValuationVerdict.check.ts` | 改期望 + IV 零漂移断言 |
| Modify `index.ts` | 导出 |
| Modify `page.tsx` / `valuation-ingest.ts` | 调 `runValuation` |
| Modify `EarningsPowerFloorCard.tsx` | 三态 verdict prop；夹逼句用 methods |
| Modify `ValuationBadge.tsx` | lamp 文案 |
| Modify `valuationSnapshot.ts` | payload.methods 透传 |
| Modify fusion/probe/calibrate 调用点 | 传入 methods |
| Modify 两份旧 spec | 勘误条 |

---

### Task 1: `deriveValuationMethods`

**Files:**
- Create: `web/src/lib/valuation/deriveValuationMethods.ts`
- Create: `web/src/lib/valuation/deriveValuationMethods.check.ts`
- Modify: `web/src/lib/valuation/index.ts`

- [ ] **Step 1: 写失败测试**

```ts
// deriveValuationMethods.check.ts
import assert from "node:assert/strict";
import { deriveValuationMethods } from "./deriveValuationMethods";
import type { OeDcfAssessment, StrikeZoneAssessment, ValuationFloor } from "./types";

const epvBase = {
  zone: "outside" as const,
  floorConservative: 10,
  ceiling: 20,
  mosLow: -1,
  mosHigh: -0.5,
  valueFloor: 10,
  base: 20,
  position: "above_zero_growth" as const,
  growthCollapsed: true,
};

const sz = (over: Partial<StrikeZoneAssessment["epv"]> = {}): StrikeZoneAssessment => ({
  price: { close: 50, date: "2026-07-01", currency: "USD", source: "yahoo" },
  stale: false,
  currencyMismatch: false,
  epv: { ...epvBase, ...over },
});

const oe = (assessable: boolean, lo = 15, hi = 40): OeDcfAssessment =>
  assessable
    ? {
        assessable: true,
        per_share_low: lo,
        per_share_high: hi,
        tiers: {
          pessimistic: { growth_stage1: 0, discount_rate: 0.12, equity_value: 1, per_share: lo },
          neutral: { growth_stage1: 0.1, discount_rate: 0.1, equity_value: 2, per_share: (lo + hi) / 2 },
          optimistic: { growth_stage1: 0.1, discount_rate: 0.09, equity_value: 3, per_share: hi },
        },
        no_bridge_note: "",
      }
    : { assessable: false, no_bridge_note: "" };

const floor = { kind: "floor" } as ValuationFloor;

{
  const m = deriveValuationMethods({ floor, strikeZone: sz(), oeDcf: oe(true) });
  assert.equal(m.zeroGrowthEpv, true);
  assert.equal(m.oeDcf, true);
  assert.equal(m.greenwaldGrowthCeilings, false);
}
{
  const m = deriveValuationMethods({
    floor,
    strikeZone: sz({
      ceilings: { pessimistic: 25, neutral: 30, optimistic: 35 },
      growthCollapsed: false,
    }),
    oeDcf: oe(true),
  });
  assert.equal(m.greenwaldGrowthCeilings, true);
}
{
  // assessable 但 low 非正 → oeDcf false（与 verdict oeOk 同口径）
  const m = deriveValuationMethods({ floor, strikeZone: sz(), oeDcf: oe(true, 0, 40) });
  assert.equal(m.oeDcf, false);
}
{
  const m = deriveValuationMethods({ floor, strikeZone: undefined, oeDcf: oe(true) });
  assert.equal(m.zeroGrowthEpv, false);
  assert.equal(m.oeDcf, true);
}
console.log("deriveValuationMethods.check.ts OK");
```

- [ ] **Step 2: 跑测确认失败**

```bash
cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/deriveValuationMethods.check.ts
```

Expected: 模块找不到 / 导出不存在。

- [ ] **Step 3: 实现**

```ts
// deriveValuationMethods.ts
import type { OeDcfAssessment, PerShareUnavailable, StrikeZoneAssessment, ValuationFloor } from "./types";

export type ValuationMethods = {
  zeroGrowthEpv: boolean;
  oeDcf: boolean;
  greenwaldGrowthCeilings: boolean;
};

function finitePositive(n: number | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

export function deriveValuationMethods(args: {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
}): ValuationMethods {
  const epv = args.strikeZone?.epv;
  const zeroGrowthEpv = !!epv;
  const oe = args.oeDcf;
  const oeDcf =
    !!oe?.assessable &&
    finitePositive(oe.per_share_low) &&
    finitePositive(oe.per_share_high);
  const greenwaldGrowthCeilings = !!epv?.ceilings;
  return { zeroGrowthEpv, oeDcf, greenwaldGrowthCeilings };
}
```

- [ ] **Step 4: 跑测通过；从 `index.ts` 导出类型与函数**

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/valuation/deriveValuationMethods.ts web/src/lib/valuation/deriveValuationMethods.check.ts web/src/lib/valuation/index.ts
git commit -m "$(cat <<'EOF'
Add deriveValuationMethods for valuation coverage flags.

EOF
)"
```

---

### Task 2: `deriveValuationVerdict` 新 coverage（TDD：先测后改）

**Files:**
- Modify: `web/src/lib/valuation/deriveValuationVerdict.check.ts`（先）
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts`（后）
- Modify: `web/src/lib/valuation/structuralBasisFusion.check.ts`
- Modify: `web/src/lib/valuation/moatGrowthFusion.check.ts`

- [ ] **Step 1: 先改 checks（期望新语义；调用补 `methods`）——此时实现未改，应 FAIL**

每个 `deriveValuationVerdict({...})` 加：

```ts
methods: deriveValuationMethods({ floor, strikeZone, oeDcf }),
```

关键期望：
- 有 OE-DCF、**无 ceilings** → `coverage === "full"`（改掉旧 `single_lamp` 期望）。
- 无 OE-DCF → `single_lamp`。
- 有 IV 的 bucket / inStrikeZone / marginPct **逐位不变**（保留旧断言数字）。
- 返回值含 `methods` 且与入参一致（可先写断言，实现后才绿）。

fusion checks 同步补 `methods`；若有 coverage 断言按新语义改。

- [ ] **Step 2: 跑测确认失败**

```bash
cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/deriveValuationVerdict.check.ts
```

Expected: FAIL（缺 `methods` 入参 / coverage 旧语义不符）。

- [ ] **Step 3: 改实现**

`ValuationVerdict` 增加 `methods: ValuationMethods`；入参 **必填** `methods`。

```ts
const canReconcile = methods.oeDcf && methods.greenwaldGrowthCeilings;
const coverage: VerdictCoverage =
  methods.oeDcf && methods.zeroGrowthEpv ? "full" : "single_lamp";
// 无 IV：bucketFromConsistency 仅当 canReconcile
// return { ..., coverage, methods }
```

- [ ] **Step 4: 跑测全绿**

```bash
cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/deriveValuationVerdict.check.ts
cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/structuralBasisFusion.check.ts
cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/moatGrowthFusion.check.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Redefine valuation coverage as zero-growth EPV plus OE-DCF.

EOF
)"
```

---

### Task 3: `runValuation` 编排（TDD：先写 check 清单与失败用例）

**Files:**
- Create: `web/src/lib/valuation/runValuation.check.ts`（先，引用尚未存在的模块 → FAIL）
- Create: `web/src/lib/valuation/runValuation.ts`（后）
- Modify: `web/src/lib/valuation/index.ts`

- [ ] **Step 1: 写 check（真实最小 `ValuationFloorInput` years：正 revenue/opInc/NI、shares、tax、capex/D&A）**

必须覆盖（spec §2.4 / §6）：
1. `adsSuppressed` → 早退，`suppressedReason=ads_suppressed`，无 floor  
2. `fundamentalsStale` → `fundamentals_stale`  
3. `priceStale:true, price:null` vs `priceStale:false, price:null` → reason 分别为 `price_stale` / `no_price`  
4. 无 OE-DCF（构造不可评估 OE 的输入或 stub 路径）→ `expectations.reason==="no_oe_dcf"`  
5. 有 DCF 潜力但 `splitCoverageStale`/`fundamentalsCorrupt` 致 verdict null → `expectations.reason==="no_verdict"`（**不得** `no_oe_dcf`）  
6. 多条件优先级（至少）：`splitCoverageStale`+`priceStale` → `split_coverage_stale`；`fundamentalsCorrupt`+`priceStale` → `fundamentals_corrupt`；ads/stale 早退压过一切后续  
7. happy path：`methods` 与 `verdict.methods` 一致；有 DCF → `coverage=full`

- [ ] **Step 2: 跑测确认失败（模块不存在）**

```bash
cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/runValuation.check.ts
```

- [ ] **Step 3: 实现 `runValuation.ts`（严格 spec §2.4；生产路径禁止测试专用分支）**

- [ ] **Step 4: 跑测全绿并导出**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Add runValuation as the single valuation orchestration entry.

EOF
)"
```

---

### Task 4: page + ingest 接线

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`
- Modify: `web/scripts/valuation-ingest.ts`

- [ ] **Step 1: page — 删除旧链，禁止新旧并存**

删除本地对 `computeValuationFloor` / `deriveStrikeZone` / `deriveOeDcf` / `reconcileMethods` / `deriveValuationVerdict` / `deriveExpectations` 的逐步调用（I/O 保留）。

在 `runValuation` **之前**算好：
- `floorInput`（含 sic）
- `fundamentalsStale`
- `fetchedPrice` → `priceStale` / `valuationPrice`
- `latestSplitDate = await getLatestSplit(ticker)` → `splitCoverageStale = isSplitCoverageStale({ fundamentalsAsOf, latestSplitDate })`
- `fundamentalsCorrupt = fundamentalsIntegrityViolated(floorInput.years)`
- `dgs10`（可与今日一样在有估值意图时读取）

然后只调一次 `runValuation`；`handoffVerdict = run.verdict`；expectations 用 `run.expectations`；卡片 **`verdict={run.verdict}`**（含 `null`）。

- [ ] **Step 2: ingest — 保留删除/保留历史语义**

替换内环为 `runValuation`。计数与集合：

| 情况 | 行为 |
|---|---|
| `ads` / 非经营 / `fundamentalsStale` / `!run.verdict`（含 price_stale、split、corrupt 等） | `intentionallyUnvaluable.add`；不写新行；稍后删旧行 |
| `getSecCompanyData` 空 / throw / 其它瞬时异常 | **不**进 intentionallyUnvaluable；`exceptionSkipped++`；**保留历史快照行** |

写库仅当 `run.verdict` 非 null：

```ts
payload: {
  ...run.verdict,
  expectations: run.expectations,
  methods: run.methods,
  ...(run.oeDcf?.assessable && run.oeDcf.moatCap ? { moatCap: run.oeDcf.moatCap } : {}),
}
```

`suppressExpectations: false`。本 Task **不**跑 `valuation:ingest`。

- [ ] **Step 3: `npx tsc --noEmit`（web）**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
Wire stock page and valuation ingest through runValuation.

EOF
)"
```

---

### Task 5: 卡片三态 verdict + 文案对齐

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`

- [ ] **Step 1: 增加 prop `verdict?: ValuationVerdict | null`**

`ValueSpine` / 顶层：
- `verdict === undefined` → 内部 `deriveValuationMethods` + `deriveValuationVerdict`（遗留）
- `verdict === null` → 不渲染 ValueSpine（可只留 MethodDetails 或由 page 外层已处理）
- `verdict` 为对象 → **禁止**再 derive

夹逼句：`methods.oeDcf && methods.greenwaldGrowthCeilings`；否则沿用「保守价值带」句（已有 UX）。

- [ ] **Step 2: page 确认传入 `verdict={run.verdict}`（含 null）**

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
Pass authoritative verdict into EarningsPowerFloorCard.

EOF
)"
```

---

### Task 6: Badge + snapshot methods

**Files:**
- Modify: `web/src/components/valuation/ValuationBadge.tsx`
- Modify: `web/src/lib/valuation/valuationSnapshot.ts`
- Create（可选）: `web/src/components/valuation/ValuationBadge.check.ts` 或在既有 check 中断言 COPY 常量

- [ ] **Step 1: Badge COPY**

```ts
zh: lamp: "单法口径（无所有者盈利 DCF）",
en: lamp: "Single-method basis (no owner-earnings DCF)",
```

- [ ] **Step 2: 验收（常量断言或手工 QA 清单写入 PR）**

- zh/en `lamp` 字符串等于上表（可用 `assert` 导出 COPY 供 check，或 grep 验收）。  
- `*` 仅当 `coverage==="single_lamp"` 且非 unconfirmedCheap（逻辑不改，回归确认）。  
- NVDA 类 `full` → 无 `*`（真数据或 fixture SnapshotVerdict）。

- [ ] **Step 3: Snapshot**

`SnapshotVerdict` 加可选 `methods?: ValuationMethods`；`Row.payload` 含 `methods`；解码透传 `methods: r.payload?.methods`。

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
Align single-lamp badge copy and snapshot methods passthrough.

EOF
)"
```

---

### Task 7: 探针 / 校准调用点

**Files:**
- Modify: `web/scripts/probe-moat-intangibles.ts`
- Modify: `web/scripts/probe-klac-split.ts`
- Modify: `web/scripts/probe-growth-franchise.ts`
- Modify: `web/scripts/leverage-premium-calibrate.ts`

- [ ] **Step 1: 凡 `deriveValuationVerdict` 补 `methods: deriveValuationMethods(...)`**  
  或改为 `runValuation`（优先最小改动：只补 methods）。

- [ ] **Step 2: `tsc --noEmit`**

- [ ] **Step 3: Commit**

---

### Task 8: 文档勘误

**Files:**
- Modify: `docs/superpowers/specs/2026-06-21-valuation-engine-v2-canonical-design.md`（顶部勘误：折现 9–11%）
- Modify: `docs/superpowers/specs/2026-06-23-valuation-oe-dcf-cross-check-design.md`（coverage ≠ 夹逼）
- Modify: `docs/superpowers/specs/2026-07-19-valuation-orchestration-clarity-design.md`（状态 → 实现中/已计划）

- [ ] **Step 1: 写勘误条（短段落，链到本 plan/spec）**

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
Document valuation coverage and discount-band errata.

EOF
)"
```

---

### Task 9: 验收（只读）

- [ ] **Step 1: 跑全部相关 checks**

```bash
cd web && for f in \
  src/lib/valuation/deriveValuationMethods.check.ts \
  src/lib/valuation/deriveValuationVerdict.check.ts \
  src/lib/valuation/runValuation.check.ts \
  src/lib/valuation/structuralBasisFusion.check.ts \
  src/lib/valuation/moatGrowthFusion.check.ts; do
  npx tsx --tsconfig scripts/tsconfig.json "$f" || exit 1
done
```

- [ ] **Step 2: 真数据抽检（有凭据时）**

用临时脚本或改探针调 `runValuation`：NVDA → `coverage=full`、`reliable=false`、`bucket=above`、`greenwaldGrowthCeilings=false`。

- [ ] **Step 3: 向用户确认是否授权 `npm run valuation:ingest`**

未授权则停在只读验收，PR 说明「需重跑 ingest 刷新 coverage」。

---

## 完成定义

- [ ] page / ingest 无重复编排链  
- [ ] NVDA 类不再 `single_lamp`  
- [ ] Badge 文案不再写「仅金融」  
- [ ] 有 IV 路径 bucket 零漂移（checks 锁定）  
- [ ] spec §4 决策表与代码一致  
