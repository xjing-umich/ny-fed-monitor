# 件④ 控股集团口径一致性修正 + 诚实抑制 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让投资主导型控股集团（BRK 为标杆）不再被合并报表层面的 EPV/AV franchise 测试判成「价值毁灭 / 无护城河 / 贵 124%」——先修口径不对称，修完仍测不出 franchise 的诚实抑制。

**Architecture:** 提取层新增一个 instant 字段 `equity_securities_fv`（tag `EquitySecuritiesFvNi`）；引擎在既有 `epvAvRatioOperating` 通道里把剔除项从「超额现金」扩展为「超额现金 + 被 marks 剔了收益的权益证券」（仅当 marks 生效）；三闸全中则把 moat 判为 `not_assessable` 并在 floor 上打 `holdco_not_assessable`，verdict 经既有 fail-closed 通道整条抑制，页面出说明文案。

**Tech Stack:** TypeScript（web/）、Supabase migration、tsx check 脚本 + 真数据探针。

**Spec:** `docs/superpowers/specs/2026-08-02-valuation-holdco-not-assessable-design.md`

## Global Constraints

- 工作目录 = worktree `/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco`，TypeScript 项目在 `web/`，分支 `plan/valuation-holdco-not-assessable`（已建，off origin/db-foundation @eb39b98）。
- 本项目无测试套件：验证 = `cd web && npx tsx --tsconfig scripts/tsconfig.json <check/探针>` + `cd web && npx tsc --noEmit`。
- **权益证券只在 `marks_adjustment` 生效时才从资产分母剔除**——剔了它的收益，才剔它的资产。marks 未生效的票必须逐字段零漂移。
- 抑制三闸（全中才触发，缺一不可）：① marks 生效；② 修正后 `epvAvRatioOperating` 不存在或 `< MOAT_FRANCHISE_MULTIPLE`（=1.25，`epvFloor.ts` 既有常量）；③ 全窗 `operating_income` 缺失。
- 改 `moat_reading.signal` 必须 grep 全部 signal 消费者一并对齐（既往教训：改 signal 曾把 GV 零闸连带解开）。
- 文案 en/zh 各自独立成句，遵 `docs/copy-voice.md`，禁 AI 腔；zh 不得中英混排。
- 提交信息跟随仓库风格，末尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: 提取层 — equity_securities_fv 字段贯通

**Files:**
- Create: `web/supabase/migrations/20260802_add_equity_securities_fv.sql`
- Modify: `web/src/lib/sec/fundamental-tags.ts`（`FundamentalField` 联合类型 + `FUNDAMENTAL_TAGS` + `INSTANT_FIELDS`）
- Modify: `web/src/lib/sec/normalize-facts.ts`（`FundamentalPeriod` 类型 + `finalizeRow` 映射）
- Modify: `web/src/lib/valuation/types.ts`（`ValuationFloorYear` 加字段）
- Modify: `web/src/lib/valuation/fundamentalsToFloorInput.ts`（`toFloorYear` 映射）

**Interfaces:**
- Produces（Task 2 依赖）：`FundamentalPeriod.equity_securities_fv: number | null`；`ValuationFloorYear.equity_securities_fv?: number`。

- [ ] **Step 1: migration**

```sql
-- 权益证券公允价值(资产负债表时点项):us-gaap EquitySecuritiesFvNi。
-- 供估值引擎在 marks 调整生效时,把"已被剔除收益"的这部分资产同步从 EPV/AV 的资产分母
-- 里剔除(口径一致性),并作为控股集团不可评估判据的输入(spec 2026-08-02 件④)。
alter table public.company_fundamentals_periods
  add column if not exists equity_securities_fv numeric;
notify pgrst, 'reload schema';
```

- [ ] **Step 2: fundamental-tags.ts**

在 `FundamentalField` 联合类型里加 `| "equity_securities_fv"`（放在 `goodwill`/`intangibles` 等资产项附近）；在 `FUNDAMENTAL_TAGS` map 里加：

```ts
  // 权益证券公允价值(BRK FY2025 实测 $297.8B,标准无维度 tag)。件④:marks 生效时同步从
  // EPV/AV 资产分母剔除 —— 组合的重置成本就是它的市价,持有它不构成竞争壁垒。
  equity_securities_fv: ["EquitySecuritiesFvNi"],
```

在 `INSTANT_FIELDS` 集合里加 `"equity_securities_fv"`（它是资产负债表时点项，不是流量项——放错会导致取数窗口错配、恒为 null）。

- [ ] **Step 3: normalize-facts.ts**

`FundamentalPeriod` 类型加 `equity_securities_fv: number | null;`（放 `goodwill` / `intangibles` 旁）；`finalizeRow` 返回对象加 `equity_securities_fv: v.equity_securities_fv,`（同位置）。不要加进 `REQUIRED_HIGH`（quality 口径不动）。

- [ ] **Step 4: 引擎入口映射**

`web/src/lib/valuation/types.ts` 的 `ValuationFloorYear` 加：

```ts
  /** 权益证券公允价值(件④):marks 生效时从 EPV/AV 资产分母剔除,保持分子分母同源。 */
  equity_securities_fv?: number;
```

`web/src/lib/valuation/fundamentalsToFloorInput.ts` 的 `toFloorYear` 返回对象加一行（紧跟 `goodwill` / `intangibles` 之后即可）：

```ts
    equity_securities_fv: u(r.equity_securities_fv),
```

- [ ] **Step 5: 回归验证**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/normalize-facts.check.ts && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/ttmBasis.check.ts && npx tsc --noEmit`
Expected: 全绿。若某 check 的 fixture 因 `FundamentalPeriod` 新必填键报 tsc 错，补 `equity_securities_fv: null`（类型完备性修补，不改断言）；把改了哪些 fixture 写进报告。

- [ ] **Step 6: Commit**

```bash
git add web/supabase/migrations/20260802_add_equity_securities_fv.sql web/src/lib/sec/fundamental-tags.ts web/src/lib/sec/normalize-facts.ts web/src/lib/valuation/types.ts web/src/lib/valuation/fundamentalsToFloorInput.ts
git commit -m "feat(sec): 提取权益证券公允价值 equity_securities_fv(件④资产分母同源输入)"
```

---

### Task 2: 引擎 — 剔除项扩展 + 三闸抑制 + fixtures

**Files:**
- Modify: `web/src/lib/valuation/types.ts`（`ValuationFloor` 加 `holdco_not_assessable`）
- Modify: `web/src/lib/valuation/epvFloor.ts`（`assembleFloor` 约 268-292 行的经营资产块）
- Modify: `web/src/lib/valuation/runValuation.ts`（`SuppressedReason` 联合 + `suppressedReason()`）
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts`（抑制早返回）
- Create: `web/src/lib/valuation/holdcoNotAssessable.check.ts`

**Interfaces:**
- Consumes: Task 1 的 `ValuationFloorYear.equity_securities_fv`。
- Produces（Task 3/4 依赖）：`ValuationFloor.holdco_not_assessable?: boolean`；`SuppressedReason` 新增 `"holdco_not_assessable"`；`MoatSignal` 复用既有 `"not_assessable"`（不新增枚举值）。

- [ ] **Step 1: 先摸清 signal 消费者（既往教训）**

Run: `cd web && grep -rn "moat_reading\|moatReading\|moat.signal\|moatSignal" src/ --include="*.ts" --include="*.tsx" | grep -v "\.check\.ts"`
把每个消费点列进报告，确认 Step 3 里替换后的 `moatReadingFinal` 被**所有**下游消费（尤其 `computeGrowthValue` 的 `moatSignal` 参数与返回对象的 `moat_reading`）。若发现有消费点拿的是替换前的 `moatReading`，那就是必须修的漏点。

- [ ] **Step 2: 写 check（先红）**

`web/src/lib/valuation/holdcoNotAssessable.check.ts`（断言风格照 `src/lib/valuation/marksAdjustment.check.ts`）：

```ts
/**
 * holdcoNotAssessable.check.ts — 件④ 断言(纯 fixture,无网络)。
 * 覆盖:①marks 未生效时权益证券不剔除(零漂移) ②marks 生效时剔除生效、比值上升
 *      ③三闸全中 → moat=not_assessable + holdco_not_assessable + verdict 抑制
 *      ④缺闸③(有 operating_income) → 不抑制 ⑤修正后进 franchise → 不抑制
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoNotAssessable.check.ts
 */
import { computeValuationFloor, MOAT_FRANCHISE_MULTIPLE } from "./epvFloor";
import { deriveValuationVerdict } from "./deriveValuationVerdict";
import type { ValuationFloorInput, ValuationFloorYear, MarksAdjustment } from "./types";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failed++; console.error(`  ✗ ${msg}`); }
}

const B = 1e9;
/** BRK 形态:巨额权益证券 + 无营业利润(保险)+ 盈利相对有形净资产偏低。 */
function holdcoYears(over?: Partial<ValuationFloorYear>): ValuationFloorYear[] {
  return [2025, 2024, 2023, 2022, 2021].map((fy, i) => ({
    fiscal_year: fy,
    revenue: 240 * B,
    operating_income: undefined,      // 保险:不单独报营业利润
    net_income: (36 - i) * B,
    effective_tax_rate: 0.21,
    shareholders_equity: 700 * B,
    goodwill: 83 * B,
    cash: 52 * B,
    equity_securities_fv: 298 * B,
    shares_diluted: 2_157_000_000,
    d_and_a: 13 * B,
    capex: 20 * B,
    ppe_net: 180 * B,
    working_capital: 20 * B,
    total_liabilities: 500 * B,
    current_assets: 100 * B,
    current_liabilities: 60 * B,
    ...over,
  }));
}

const marks: MarksAdjustment = {
  tax_rate: 0.21,
  materiality: 0.53,
  per_year: [2025, 2024, 2023, 2022, 2021].map((fy, i) => ({
    fiscal_year: fy, pretax: 39 * B, net_income_reported: (67 - i) * B, net_income_adjusted: (36 - i) * B,
  })),
};

const floorOf = (input: ValuationFloorInput) => {
  const f = computeValuationFloor(input);
  if (!f || f.kind !== "floor") throw new Error(`expected floor, got ${f?.kind ?? "undefined"}`);
  return f;
};

console.log("场景 1: marks 未生效 → 权益证券不剔除(零漂移)");
const noMarks = floorOf({ ticker: "NOMARKS", years: holdcoYears(), sic: 6331 });
const withMarks = floorOf({ ticker: "HOLDCO", years: holdcoYears(), sic: 6331, marks_adjustment: marks });
assert(noMarks.holdco_not_assessable !== true, "marks 未生效 → 不触发抑制(闸①不满足)");
assert(noMarks.moat_reading.signal !== "not_assessable", "marks 未生效 → moat 判定不被改写");

console.log("场景 2: marks 生效 → 剔除生效、三闸全中");
assert(withMarks.holdco_not_assessable === true, "三闸全中 → holdco_not_assessable=true");
assert(withMarks.moat_reading.signal === "not_assessable", "moat 判为 not_assessable(不是 value_destruction)");
assert((withMarks.moat_reading.basis_note + withMarks.moat_reading.label).toLowerCase().includes("reproduction"), "说明句点明重置成本测试不适用");

console.log("场景 3: verdict 整条抑制");
const verdict = deriveValuationVerdict({
  floor: withMarks,
  strikeZone: { price: { close: 511, date: "2026-07-31", currency: "USD", source: "yahoo" }, stale: false,
    epv: { zone: "outside", floorConservative: 149, ceiling: 182, mosLow: -2.4, mosHigh: -1.8,
      valueFloor: 298.5, base: 298.5, position: "above_zero_growth", growthCollapsed: true } } as never,
  methods: { zeroGrowthEpv: true, oeDcf: false, greenwaldGrowthCeilings: false },
});
assert(verdict === null, "holdco_not_assessable → verdict 为 null(整条抑制)");

console.log("场景 4: 有营业利润 → 闸③不满足,不抑制");
const withOpInc = floorOf({ ticker: "OPINC", sic: 6331, marks_adjustment: marks,
  years: holdcoYears({ operating_income: 40 * B, operating_margin: 40 / 240 }) });
assert(withOpInc.holdco_not_assessable !== true, "有独立经营透镜(operating_income)→ 不抑制");

console.log("场景 5: 修正后进 franchise → 闸②不满足,不抑制");
// 权益证券占满有形净资产 → 剔除后经营资产极小 → 比值远超 1.25
const franchiseAfter = floorOf({ ticker: "FRAN", sic: 6331, marks_adjustment: marks,
  years: holdcoYears({ equity_securities_fv: 600 * B }) });
assert(franchiseAfter.holdco_not_assessable !== true, `修正后进 franchise(≥${MOAT_FRANCHISE_MULTIPLE})→ 不抑制`);

if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log("\n全部通过");
```

- [ ] **Step 3: 跑 check 确认红**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoNotAssessable.check.ts`
Expected: FAIL（`holdco_not_assessable` 尚不存在）。

- [ ] **Step 4: types.ts**

`ValuationFloor` 加：

```ts
  /**
   * 件④(spec 2026-08-02):投资主导型控股集团 —— 合并报表层面的盈利力/重置成本测试不适用。
   * 三闸全中(marks 生效 / 剔除被 marks 剔了收益的资产后仍进不了 franchise / 无营业利润)。
   * 消费者:deriveValuationVerdict 整条抑制、runValuation 的 suppressedReason、个股页说明文案。
   */
  holdco_not_assessable?: boolean;
```

- [ ] **Step 5: epvFloor.ts 经营资产块改造**

把 `assembleFloor` 里现有的 `assetOperating` / `epvAvRatioOperating` / `deriveMoatCap` 段落改成（`marks` 参数在件③已传入本函数，直接可用）：

```ts
  const latestRevenue = years.find((y) => y.fiscal_year === Math.max(...years.map((y2) => y2.fiscal_year)))?.revenue;
  const excessCashPerShare =
    latest.cash != null && latestRevenue != null && shares > 0
      ? Math.max(0, latest.cash - OPERATING_CASH_PCT * latestRevenue) / shares
      : 0;
  // 件④:marks 生效 = 我们已把这些证券的重估收益从盈利里剔除,则它们也必须从资产分母里剔除,
  // 否则分子(剔了组合回报的盈利)与分母(含组合市值的资产)不同源 —— BRK 被判 value_destruction
  // 的根因。marks 未生效的票(组合回报仍在盈利里)剔除量为 0,逐字段零漂移。
  const markedSecuritiesPerShare =
    marks != null && latest.equity_securities_fv != null && shares > 0
      ? latest.equity_securities_fv / shares
      : 0;
  const assetOperating =
    moatReading.asset_per_share_compared != null
      ? moatReading.asset_per_share_compared - excessCashPerShare - markedSecuritiesPerShare
      : undefined;
  const epvAvRatioOperating =
    epvMid != null && assetOperating != null && assetOperating > 0 ? epvMid / assetOperating : undefined;

  // 件④ 三闸:① marks 生效 ② 修正后仍进不了 franchise ③ 无营业利润(无独立经营透镜)。
  // 全中 → 合并层面的 EPV/AV 测试对这类主体没有经济含义(组合的重置成本就是其市价,
  // 持有它不构成竞争壁垒),判 not_assessable 并整条抑制,而不是给一个"价值毁灭"的假结论。
  const noOperatingIncome = years.every((y) => y.operating_income == null);
  const holdcoNotAssessable =
    marks != null &&
    !(epvAvRatioOperating != null && epvAvRatioOperating >= MOAT_FRANCHISE_MULTIPLE) &&
    noOperatingIncome;
  const moatReadingFinal: MoatReading = holdcoNotAssessable
    ? {
        signal: "not_assessable",
        label: "Moat not assessed: at the consolidated level this is an investment-led holding company.",
        basis_note:
          "Earnings power versus reproduction value does not describe this issuer: a marketable-securities portfolio reproduces at its own market price, so holding it cannot be a competitive barrier. The asset floor below is still shown as a floor.",
      }
    : moatReading;

  const moatCap = deriveMoatCap({
    moat: moatReadingFinal,
    epvAvRatio,
    epvAvRatioOperating,
    ...
```

（`deriveMoatCap` 之后的 `computeGrowthValue` 调用把 `moatSignal: moatReading.signal` 改为 `moatSignal: moatReadingFinal.signal`；返回对象里 `moat_reading: moatReading` 改为 `moat_reading: moatReadingFinal`，并加 `holdco_not_assessable: holdcoNotAssessable || undefined,`。Step 1 grep 出的其余 signal 消费点一并对齐。）

若 `MoatReading` 类型未 import，在文件顶部既有 `import type { ... } from "./types";` 里补 `MoatReading`。

- [ ] **Step 6: 抑制通道**

`web/src/lib/valuation/runValuation.ts`：`SuppressedReason` 联合类型加 `| "holdco_not_assessable"`；`suppressedReason()` 里在 `capital_structure_distorted` 那行**之前**插入：

```ts
  if (input.floor.holdco_not_assessable) return "holdco_not_assessable";
```

`web/src/lib/valuation/deriveValuationVerdict.ts`：在 `if (!floor || floor.kind !== "floor") return null;` 那行**之后**插入：

```ts
  if (floor.holdco_not_assessable) return null; // 件④:投资主导型控股集团,合并层面测试不适用 → 无可信判定
```

- [ ] **Step 7: check 绿 + 全量回归**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoNotAssessable.check.ts && for f in src/lib/valuation/*.check.ts; do npx tsx --tsconfig scripts/tsconfig.json "$f" >/dev/null || echo "FAILED: $f"; done && npx tsc --noEmit`
Expected: 新 check 全过；存量 check 零 FAILED；tsc 0 错误。

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/valuation/types.ts web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/runValuation.ts web/src/lib/valuation/deriveValuationVerdict.ts web/src/lib/valuation/holdcoNotAssessable.check.ts
git commit -m "feat(valuation): 件④ 资产分母同源修正+控股集团诚实抑制(BRK 不再判价值毁灭)"
```

---

### Task 3: 页面文案 — en/zh 说明句 + 渲染分支

**Files:**
- Modify: `web/src/lib/stocks/stockCopy.ts`（zh 约 94 行、en 约 142 行的 `valuation` 段）
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`（约 627-631 的抑制说明链）

**Interfaces:**
- Consumes: Task 2 的 `ValuationFloor.holdco_not_assessable`。

- [ ] **Step 1: 文案**

`stockCopy.ts` 的 zh `valuation` 段，在 `moatDistorted` 那行之后加：

```ts
      holdcoNotAssessable: "这是一家以投资组合为主体的控股集团。把整体盈利力和资产重置价值放在一起比，对它没有经济含义——一个可交易的证券组合，重置成本就是它当时的市价，持有它本身不构成竞争壁垒。这里不给出价值带和护城河判定，下面的资产底只作参考下限。",
```

en 段同位置加：

```ts
      holdcoNotAssessable: "This is a holding company whose balance sheet is led by an investment portfolio. Comparing consolidated earnings power against reproduction value says nothing here — a marketable portfolio reproduces at its own market price, so owning it is not a competitive barrier. No value range or moat verdict is shown; the asset floor below is a floor only.",
```

（两句各自独立成文，不是互译；zh 不出现英文词。）

- [ ] **Step 2: 渲染分支**

`page.tsx`：先在 `capitalStructureDistorted` 常量附近加：

```ts
  const holdcoNotAssessable =
    valuationFloor?.kind === "floor" && valuationFloor.holdco_not_assessable === true;
```

再把抑制说明链里的分支加在 `capitalStructureDistorted` **之前**（它更具体，应先命中）：

```tsx
              ) : holdcoNotAssessable ? (
                <p className="mt-3 text-sm text-[var(--tt-muted)]">{page.valuation.holdcoNotAssessable}</p>
```

- [ ] **Step 3: 验证**

Run: `cd web && npx tsc --noEmit`
Expected: 0 错误（若 `page.valuation.holdcoNotAssessable` 报类型缺失，说明 zh/en 两处只加了一处——两处都必须加）。

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/stocks/stockCopy.ts "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(stocks): 件④ 控股集团不可评估说明文案(en/zh)+个股页渲染分支"
```

---

### Task 4: 真数据探针 — 触发集 + 零漂移

**Files:**
- Create: `web/scripts/probe-holdco-not-assessable.ts`

**Interfaces:**
- Consumes: Task 1 的提取字段（经真 `normalizeCompanyFacts` in-memory 产出，不依赖 DB 新列）、Task 2 的引擎行为。

- [ ] **Step 1: 写探针**

头注释与契约：

```ts
/**
 * probe-holdco-not-assessable.ts — 件④ 真数据验收探针(只读,不写库)。
 * 候选组(marks 生效的五家):BRK.B BRK.A MKL RLI WTM RGA;零漂移组:PGR CB AFL MSFT V AXP。
 * 每票 live fetchCompanySubmissions+fetchCompanyFacts → normalizeCompanyFacts(真提取,含
 * equity_securities_fv,in-memory) → BRK.A/BRK.B 额外跑件① applyClassSharesFallback 补股数 →
 * 双路真引擎:(a) baseline = 每行 equity_securities_fv 置 null(旧行为) (b) 保留字段(新行为)。
 * 打印:ticker | marks | equity_sec | EPV/AV(oper) a→b | moat a→b | verdict a→b。
 * 硬断言(违反 exit 1):
 *   1. BRK.B:(a) moat=value_destruction 且 verdict 非 null;(b) moat=not_assessable 且 verdict=null;
 *   2. BRK.B (b) 路修正后 epvAvRatioOperating ∈ [0.9, 1.2];
 *   3. MKL/RLI:(b) 路 moat 仍为 franchise 且 verdict 非 null(未被误伤);
 *   4. 零漂移组六票:(a)(b) 两路 verdict JSON 逐字段全等且 moat signal 相同;
 *   5. RGA/WTM 只打印不断言(实测供主线程逐票裁决)。
 * 引擎组装镜像 valuation-ingest.ts:130-180;ads 简化 resolveAds(undefined,null)(本组均本土非 ADR)。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-holdco-not-assessable.ts
 */
```

实现要点：env 加载样板照 `web/scripts/probe-ttm-basis.ts:40-49`；整体结构照 `web/scripts/probe-marks-adjustment.ts`（同款双路 baseline/adjusted 对比，把其中「置 null 的字段」从 `investment_fv_gain_loss` 换成 `equity_securities_fv`，annual 与 quarterly 都要置）；sic 从 `sec_companies` 读并 text→number；每票 `sleep(300)`。

- [ ] **Step 2: 跑探针（需网络 + env）**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-holdco-not-assessable.ts`
Expected: 五条断言全过。**完整对比表逐字贴进 task 汇报**（RGA/WTM 的实测走向是主线程裁决的依据）。

- [ ] **Step 3: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 4: Commit**

```bash
git add web/scripts/probe-holdco-not-assessable.ts
git commit -m "chore(valuation): 件④ 真数据探针(触发集+零漂移+BRK 前后对比)"
```

---

## Self-Review 记录

- Spec 覆盖：§1 件④-1 → Task 1+2 Step 5；§1 件④-2 三闸与抑制 → Task 2 Step 5/6；卡片与说明 → Task 3；§3 验收 1→Task 2 check、2→Task 4 探针、3→各 task 验证步、4→Task 3；§4 运维属合并后主线程职责。
- 类型一致性：`equity_securities_fv` / `holdco_not_assessable` / `"holdco_not_assessable"` / `moatReadingFinal` 在各 task 的 Interfaces 与代码块中同名同形。
- 无占位符：所有代码步给出完整代码或指名照抄来源（文件:行号）。
- 已知实现注意：`MOAT_FRANCHISE_MULTIPLE` 与 `OPERATING_CASH_PCT` 是既有导出常量，不新增；`MoatSignal` 复用既有 `"not_assessable"`，不扩枚举。
