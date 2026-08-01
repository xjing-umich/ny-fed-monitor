# 件③ marks adjustment 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对投资性重估损益主导净利的公司（BRK/MKL/RLI/WTM/RGA，材料性 ≥25%），把估值引擎的盈利基数从 GAAP 净利切换为「净利 − 投资损益×(1−21%)」的经营口径，并全链路披露。

**Architecture:** 提取层加一个流量字段 `investment_fv_gain_loss`（migration + tag map + normalize + TTM 增量法）；引擎层在 `fundamentalsToFloorInput` 单注入点做整窗一致的 NI 调整（三闸 fail-closed：整窗覆盖/≥3年/材料性≥0.25），下游全部消费者自动吃同一序列；披露经 `marks_adjustment` 字段 + `earnings_basis_note` 到卡片。

**Tech Stack:** TypeScript（web/）、Supabase migration、tsx check 脚本、真数据探针（live companyfacts → 真 normalize → 真引擎，只读）。

**Spec:** `docs/superpowers/specs/2026-07-26-valuation-ni-marks-adjustment-design.md`

## Global Constraints

- 工作目录仓库根；TypeScript 项目在 `web/`；分支 `plan/valuation-ni-marks`（已建，off origin/db-foundation @39bcf4c）。
- 本项目无测试套件：验证 = `cd web && npx tsx --tsconfig scripts/tsconfig.json <check/探针>` + `cd web && npx tsc --noEmit`。
- 常量口径（spec §2.2 逐字）：`MARKS_TAX_RATE = 0.21`、`MARKS_MATERIALITY_MIN = 0.25`、对齐年数 ≥ 3；三闸任一不过 → **不调整**（fail-closed，宁缺毋假）。
- 调整必须整窗一致：FY 行中每个有净利的年份都有 gains 才调；TTM 行 gains 缺/降级 → **丢弃 TTM 整体回退纯 FY**。
- tag 优先级 `["GainLossOnInvestments", "EquitySecuritiesFvNiGainLoss"]`；新字段**不进 REQUIRED_HIGH**；不做 crypto tag（spec §2.3）。
- 探针只读不写库；披露文案英文、数据先行、禁 AI 腔（对照 `docs/copy-voice.md`）。
- 提交信息跟随仓库风格，末尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: 提取层 — migration + tag + normalize + TTM 字段贯通

**Files:**
- Create: `web/supabase/migrations/20260726_add_investment_fv_gain_loss.sql`
- Modify: `web/src/lib/sec/fundamental-tags.ts`（FundamentalField 联合类型 + FUNDAMENTAL_TAGS map）
- Modify: `web/src/lib/sec/normalize-facts.ts`（`FundamentalPeriod` 类型 + `finalizeRow` 映射）
- Modify: `web/src/lib/valuation/ttmBasis.ts`（`FLOW_FIELDS` 数组）

**Interfaces:**
- Produces: `FundamentalPeriod.investment_fv_gain_loss: number | null`（Task 2/3 依赖此字段名）；TTM 合成行同字段走增量法，缺季度值落 `degraded_fields`。

- [ ] **Step 1: migration**

```sql
-- 投资性重估损益(税前,GAAP 利润表行):GainLossOnInvestments / EquitySecuritiesFvNiGainLoss。
-- 供估值引擎把 marks 主导型公司(BRK/MKL 等)的盈利基数还原为经营口径(spec 2026-07-26 件③)。
alter table public.company_fundamentals_periods
  add column if not exists investment_fv_gain_loss numeric;
notify pgrst, 'reload schema';
```

- [ ] **Step 2: fundamental-tags.ts**

在 `FundamentalField` 联合类型里加 `| "investment_fv_gain_loss"`（放在流量字段区，如 `dividends_paid` 旁）；在 `FUNDAMENTAL_TAGS` map 加：

```ts
  // 投资性重估损益(税前):GainLossOnInvestments 含衍生品口径更完整(BRK 实测两 tag 几乎同值,
  // FY2023 74.9B vs 71.8B),优先;EquitySecuritiesFvNiGainLoss(ASU 2016-01 权益证券 FV-NI)兜底。
  investment_fv_gain_loss: ["GainLossOnInvestments", "EquitySecuritiesFvNiGainLoss"],
```

**不要**把它加进任何 INSTANT/REQUIRED_HIGH 列表（它是 duration 流量项；grep 确认 `FLOW_FIELDS` 在 normalize-facts.ts:76 由 `ALL_FIELDS.filter(!INSTANT)` 自动导出后已包含它）。

- [ ] **Step 3: normalize-facts.ts**

`FundamentalPeriod` 类型加 `investment_fv_gain_loss: number | null;`（放 `dividends_paid` 旁）；`finalizeRow` 的返回对象加 `investment_fv_gain_loss: v.investment_fv_gain_loss,`（同位置）。

- [ ] **Step 4: ttmBasis.ts**

`FLOW_FIELDS` 数组末尾加 `"investment_fv_gain_loss"`（TTM = FY + Σ新Q − Σ同期Q；任一部件缺 → 回退 FY 原值并落 `degraded_fields`，Task 2 据此丢 TTM）。确认合成 `row` 的构造会带上该字段（`FundamentalPeriod` 类型现在要求它，tsc 会强制）。

- [ ] **Step 5: 回归验证**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/normalize-facts.check.ts && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/ttmBasis.check.ts && npx tsc --noEmit`
Expected: 全绿（若 check 因 FundamentalPeriod 新必填键报 tsc 错，把 check 内的 fixture 行补 `investment_fv_gain_loss: null`——属类型完备性修补，不改断言）。

- [ ] **Step 6: Commit**

```bash
git add web/supabase/migrations/20260726_add_investment_fv_gain_loss.sql web/src/lib/sec/fundamental-tags.ts web/src/lib/sec/normalize-facts.ts web/src/lib/valuation/ttmBasis.ts
git commit -m "feat(sec): 提取投资性重估损益字段 investment_fv_gain_loss(annual+quarterly+TTM 增量法)"
```

---

### Task 2: 引擎层 — 单注入点 NI 调整 + 三闸 + 披露 + fixtures

**Files:**
- Modify: `web/src/lib/valuation/types.ts`（`MarksAdjustment` 类型 + `ValuationFloorInput.marks_adjustment` + `ValuationFloor.marks_adjustment`）
- Modify: `web/src/lib/valuation/fundamentalsToFloorInput.ts`（推导 + 应用 + TTM 一致性）
- Modify: `web/src/lib/valuation/epvFloor.ts`（透传发布 + basis note）
- Create: `web/src/lib/valuation/marksAdjustment.check.ts`

**Interfaces:**
- Consumes: Task 1 的 `FundamentalPeriod.investment_fv_gain_loss`。
- Produces:
  - `types.ts`: `export type MarksAdjustment = { tax_rate: number; materiality: number; per_year: { fiscal_year: number; pretax: number; net_income_reported: number; net_income_adjusted: number }[] }`
  - `fundamentalsToFloorInput.ts`: `export const MARKS_TAX_RATE = 0.21`、`export const MARKS_MATERIALITY_MIN = 0.25`、`export const MARKS_MIN_ALIGNED_YEARS = 3`、`export function deriveMarksAdjustment(fyRows: FundamentalPeriod[]): MarksAdjustment | undefined`
  - floor 输出：`floor.marks_adjustment`（payload 可见）+ `provenance.earnings_basis_note` 含 marks 句。

- [ ] **Step 1: 先写 check（红）**

`web/src/lib/valuation/marksAdjustment.check.ts`（断言风格照 `normalizeDilutedShares.check.ts`）：

```ts
/**
 * marksAdjustment.check.ts — 件③盈利基数调整断言(纯 fixture,无网络)。
 * 覆盖:BRK 真数字对账(Buffett op earnings ±1%)/整窗覆盖闸/材料性闸(24% vs 26%)/
 * 对称性(负 gains 抬升)/TTM 不一致丢弃/引擎端到端(基数切换+披露发布)。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/marksAdjustment.check.ts
 */
import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";
import { deriveMarksAdjustment, fundamentalsToFloorInput, MARKS_MATERIALITY_MIN, MARKS_TAX_RATE } from "./fundamentalsToFloorInput";
import { computeValuationFloor } from "./epvFloor";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failed++; console.error(`  ✗ ${msg}`); }
}

/** FundamentalPeriod 全键工厂:未给字段一律 null(与 DB 可空列一致)。 */
function mkRow(over: Partial<FundamentalPeriod> & { fiscal_year: number; period_end: string }): FundamentalPeriod {
  return {
    ticker: "TEST", cik: "0000000000", form: "10-K", fiscal_period: "FY", filing_date: null, accession_number: null,
    revenue: null, gross_profit: null, operating_income: null, net_income: null, eps_diluted: null, shares_diluted: null,
    operating_cash_flow: null, capex: null, free_cash_flow: null, d_and_a: null, stock_based_comp: null,
    rd_expense: null, sga_expense: null, interest_expense: null, pretax_income: null, income_tax_expense: null,
    dividends_paid: null, share_repurchases: null, cash_and_equivalents: null, short_term_investments: null,
    current_assets: null, current_liabilities: null, total_assets: null, total_liabilities: null, total_debt: null,
    ppe_net: null, goodwill: null, intangibles: null, shareholders_equity: null, minority_interest: null,
    preferred_equity: null, shares_outstanding: null, ebitda: null, working_capital: null, effective_tax_rate: null,
    revenue_yoy: null, net_income_yoy: null, fcf_yoy: null, gross_margin: null, operating_margin: null,
    net_margin: null, fcf_margin: null, roe: null, debt_to_equity: null, net_debt: null,
    is_derived: false, data_quality: "high", missing_fields: {}, raw_facts: {},
    investment_fv_gain_loss: null,
    ...over,
  } as FundamentalPeriod;
}

const B = 1e9;
// BRK 真实 FY2020-2025(净利 / GainLossOnInvestments,单位 B):
const BRK: [number, number, number][] = [
  [2025, 66.968, 39.1], [2024, 88.995, 52.8], [2023, 96.223, 74.9],
  [2022, -22.819, -67.9], [2021, 89.795, 77.6], [2020, 42.521, 40.9],
];
const brkRows = BRK.map(([fy, ni, g]) => mkRow({ fiscal_year: fy, period_end: `${fy}-12-31`, net_income: ni * B, investment_fv_gain_loss: g * B, shares_diluted: 2_157_000_000, shareholders_equity: 700 * B }));

console.log("场景 1: BRK 真数字对账");
const brkAdj = deriveMarksAdjustment(brkRows);
assert(brkAdj != null, "BRK 材料性 ~53% ≥ 25% → 调整启用");
const byFy = new Map(brkAdj!.per_year.map((p) => [p.fiscal_year, p.net_income_adjusted]));
// Buffett 股东信 operating earnings: FY2022=30.8B / FY2023=37.4B / FY2024=47.4B(±1B 容差,tag 口径差异)
assert(Math.abs(byFy.get(2022)! - 30.8 * B) < 1 * B, `FY2022 GAAP 亏损年还原 ≈30.8B(实际 ${(byFy.get(2022)! / B).toFixed(1)}B)`);
assert(Math.abs(byFy.get(2023)! - 37.4 * B) < 1.5 * B, `FY2023 ≈37.4B(实际 ${(byFy.get(2023)! / B).toFixed(1)}B)`);
assert(Math.abs(byFy.get(2024)! - 47.4 * B) < 1.5 * B, `FY2024 ≈47.4B(实际 ${(byFy.get(2024)! / B).toFixed(1)}B)`);
assert(Math.abs(brkAdj!.materiality - 0.534) < 0.03, `材料性 ≈53.4%(实际 ${(brkAdj!.materiality * 100).toFixed(1)}%)`);

console.log("场景 2: 整窗覆盖闸");
const gapRows = brkRows.map((r, i) => (i === 3 ? { ...r, investment_fv_gain_loss: null } : r));
assert(deriveMarksAdjustment(gapRows) === undefined, "任一有净利年缺 gains → 整体不调(fail-closed)");

console.log("场景 3: 材料性闸 24% vs 26%");
const mk = (ratio: number) => [0, 1, 2].map((i) => mkRow({ fiscal_year: 2025 - i, period_end: `${2025 - i}-12-31`, net_income: 10 * B, investment_fv_gain_loss: ratio * 10 * B }));
assert(deriveMarksAdjustment(mk(0.24)) === undefined, "24% < 25% → 不调");
assert(deriveMarksAdjustment(mk(0.26)) != null, "26% ≥ 25% → 调");

console.log("场景 4: 对称性(负 gains 抬升)");
const neg = deriveMarksAdjustment(mk(-0.30));
assert(neg != null && neg.per_year[0].net_income_adjusted > 10 * B, "gains 均值为负 → NI_adj 抬升(对称口径)");

console.log("场景 5: 引擎端到端(基数切换+披露)");
const input = fundamentalsToFloorInput("BRK.B", "BRK.B", brkRows, 1, 6331);
assert(input.marks_adjustment != null, "floorInput 带 marks_adjustment");
assert(Math.abs((input.years[1].net_income ?? 0) - byFy.get(2024)!) < 1, "years 序列吃的是调整后 NI");
const floor = computeValuationFloor(input);
assert(floor != null && floor.kind === "floor", "floor 可算");
if (floor && floor.kind === "floor") {
  assert(floor.marks_adjustment != null, "floor 发布 marks_adjustment");
  assert((floor.provenance.earnings_basis_note ?? "").toLowerCase().includes("investment"), "earnings_basis_note 含 marks 披露句");
}

console.log("场景 6: 未启用时零披露零改动");
const plain = fundamentalsToFloorInput("PLAIN", "PLAIN", brkRows.map((r) => ({ ...r, investment_fv_gain_loss: null })), 1, 6331);
assert(plain.marks_adjustment == null, "无 gains 数据 → 不调");
assert(plain.years[0].net_income === 66.968 * B, "NI 保持 GAAP 原值");

if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log("\n全部通过");
```

（TTM 丢弃逻辑在 Step 3 以导出谓词 `shouldDropTtmForMarks` 实现，加两条直测断言：`degraded_fields` 含字段 → true；行值为 null → true。写进同一 check 的场景 7。）

- [ ] **Step 2: 跑 check 确认红**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/marksAdjustment.check.ts`
Expected: FAIL（`deriveMarksAdjustment` 不存在）。

- [ ] **Step 3: 实现**

`types.ts` 加（与 `ValuationFloorInput`/`ValuationFloor` 同文件）：

```ts
/** 件③(spec 2026-07-26):投资性重估损益税后剔除的盈利基数调整披露。 */
export type MarksAdjustment = {
  tax_rate: number;
  materiality: number;
  per_year: { fiscal_year: number; pretax: number; net_income_reported: number; net_income_adjusted: number }[];
};
```

`ValuationFloorInput` 加 `marks_adjustment?: MarksAdjustment;`；`ValuationFloor` 加 `marks_adjustment?: MarksAdjustment;`。

`fundamentalsToFloorInput.ts`：

```ts
export const MARKS_TAX_RATE = 0.21;
export const MARKS_MATERIALITY_MIN = 0.25;
export const MARKS_MIN_ALIGNED_YEARS = 3;

/**
 * 件③三闸(spec §2.2,fail-closed):①整窗覆盖(每个有净利的 FY 都有 gains,防序列内口径混杂)
 * ②对齐年数≥3 ③材料性 |mean(gains)|/mean(|NI|) ≥ 0.25(校准:BRK 53%/MKL 53%/RLI 37%/WTM 34%/
 * RGA 33% vs FAF 20.6%,~8pp 实测间隔)。税率用法定 21% 常量——分年 effective rate 被 marks 本身
 * 污染;21% 有 BRK 股东信 operating earnings 逐年对账背书(FY2022 −22.8→+30.8B)。调整对称:
 * gains 均值为负(RGA)同式抬升,口径一致性优先。
 */
export function deriveMarksAdjustment(fyRows: FundamentalPeriod[]): MarksAdjustment | undefined {
  const niYears = fyRows.filter((r) => r.net_income != null);
  if (niYears.length < MARKS_MIN_ALIGNED_YEARS) return undefined;
  if (!niYears.every((r) => r.investment_fv_gain_loss != null)) return undefined;
  const meanGain = niYears.reduce((s, r) => s + (r.investment_fv_gain_loss as number), 0) / niYears.length;
  const meanAbsNi = niYears.reduce((s, r) => s + Math.abs(r.net_income as number), 0) / niYears.length;
  if (!(meanAbsNi > 0)) return undefined;
  const materiality = Math.abs(meanGain) / meanAbsNi;
  if (materiality < MARKS_MATERIALITY_MIN) return undefined;
  return {
    tax_rate: MARKS_TAX_RATE,
    materiality,
    per_year: niYears.map((r) => ({
      fiscal_year: r.fiscal_year as number,
      pretax: r.investment_fv_gain_loss as number,
      net_income_reported: r.net_income as number,
      net_income_adjusted: (r.net_income as number) - (r.investment_fv_gain_loss as number) * (1 - MARKS_TAX_RATE),
    })),
  };
}

/** TTM 与调整后 FY 序列口径不一致(gains 降级回退/缺失)→ 丢 TTM 整体回退纯 FY。 */
export function shouldDropTtmForMarks(ttmSyn: { degraded_fields: string[]; row: FundamentalPeriod }): boolean {
  return ttmSyn.degraded_fields.includes("investment_fv_gain_loss") || ttmSyn.row.investment_fv_gain_loss == null;
}
```

`fundamentalsToFloorInput` 主体改造（保持现有行为为默认路径）：

```ts
  const fyRows = (rows ?? [])
    .filter((r) => r.fiscal_period === "FY" && r.fiscal_year != null)
    .sort((a, b) => (b.period_end ?? "").localeCompare(a.period_end ?? ""));
  const marks = deriveMarksAdjustment(fyRows);
  const adjNiByFy = new Map((marks?.per_year ?? []).map((p) => [p.fiscal_year, p.net_income_adjusted]));
  const applyMarks = (r: FundamentalPeriod): FundamentalPeriod =>
    adjNiByFy.has(r.fiscal_year as number) ? { ...r, net_income: adjNiByFy.get(r.fiscal_year as number)! } : r;
  const years: ValuationFloorYear[] = fyRows.map((r) => toFloorYear(marks ? applyMarks(r) : r, adsRatio));
  const ttmSyn = quarterRows?.length ? buildTtm(rows ?? [], quarterRows) : null;
  // 件③口径一致性:调整启用而 TTM 的 gains 不可得 → 丢 TTM(回退纯 FY),防止 GAAP-TTM 顶替经营口径 FY0。
  const ttmUsable = ttmSyn && !(marks && shouldDropTtmForMarks(ttmSyn));
  const ttm = ttmUsable
    ? {
        year: toFloorYear(
          marks
            ? { ...ttmSyn.row, net_income: (ttmSyn.row.net_income as number) - (ttmSyn.row.investment_fv_gain_loss as number) * (1 - MARKS_TAX_RATE) }
            : ttmSyn.row,
          adsRatio,
        ),
        period_end: ttmSyn.period_end,
        quarters_used: ttmSyn.quarters_used,
        shares_from_fy: ttmSyn.shares_from_fy,
      }
    : undefined;
  return { ticker, company_name: companyName ?? undefined, years, sic: sic ?? undefined, ...(ttm ? { ttm } : {}), ...(marks ? { marks_adjustment: marks } : {}) };
```

`epvFloor.ts`：
- `computeValuationFloor` 把 `input.marks_adjustment` 传给两条 build 路径（`buildFullFloor`/`buildSingleLampFloor` 加参数 `marks?: MarksAdjustment`），再传 `assembleFloor`（同名参数）。
- basis note 常量 + 组合：

```ts
const MARKS_BASIS_NOTE =
  "Earnings basis: reported net income minus investment and derivative fair-value gains/losses, net of tax at the statutory 21% — portfolio marks flow through GAAP net income (ASU 2016-01) but are not operating earnings power.";
```

单灯路径 `earningsBasisNote = marks ? `${SINGLE_LAMP_BASIS_NOTE} ${MARKS_BASIS_NOTE}` : SINGLE_LAMP_BASIS_NOTE`；全量路径 `marks ? MARKS_BASIS_NOTE : undefined`。`assembleFloor` 返回对象加 `marks_adjustment: marks,`。

- [ ] **Step 4: check 绿 + 全量回归**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/marksAdjustment.check.ts && for f in src/lib/valuation/*.check.ts; do npx tsx --tsconfig scripts/tsconfig.json "$f" >/dev/null || echo "FAILED: $f"; done && npx tsc --noEmit`
Expected: 新 check 全过；存量 check 零失败；tsc 0 错误。

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/valuation/types.ts web/src/lib/valuation/fundamentalsToFloorInput.ts web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/marksAdjustment.check.ts
git commit -m "feat(valuation): 件③盈利基数剔除投资性重估损益(三闸fail-closed+TTM一致性+披露)"
```

---

### Task 3: 真数据探针 — 五票 before/after + 零漂移 sweep

**Files:**
- Create: `web/scripts/probe-marks-adjustment.ts`

**Interfaces:**
- Consumes: Task 1 提取字段（经真 `normalizeCompanyFacts` in-memory 产出，不依赖 DB 列）；Task 2 的 `deriveMarksAdjustment`/引擎行为；件① `needsClassSharesFallback`/`applyClassSharesFallback`（BRK 股数 in-memory 回退）。

- [ ] **Step 1: 写探针**

头注释 + 结构（env 加载样板照 `web/scripts/probe-ttm-basis.ts:40-49`；引擎组装照 `web/scripts/valuation-ingest.ts:130-180`，ads 简化 `resolveAds(undefined, null)` 注明）：

```ts
/**
 * probe-marks-adjustment.ts — 件③真数据验收探针(只读,不写库)。
 * 调整组:BRK.B MKL RLI WTM RGA;零漂移组:FAF(阈值下最近邻20.6%) PGR V AXP MSFT。
 * 每票:live fetchCompanySubmissions+fetchCompanyFacts → normalizeRecentFilings →
 * normalizeCompanyFacts(真提取,含新字段,in-memory) → BRK.B/BRK.A 额外跑件①
 * applyClassSharesFallback 补股数(生产行可能尚无) → 双路真引擎:
 *   (a) baseline = annual/quarterly 的 investment_fv_gain_loss 全置 null(旧行为)
 *   (b) adjusted = 保留字段(新行为)
 * 打印表:ticker | materiality | 调整? | a(bucket,reliable,band,declined) | b(同) 。
 * 硬断言(违反 exit 1):
 *   1. 调整组五票 deriveMarksAdjustment 非空且 materiality ≥ 0.25;
 *   2. BRK.B FY2022 调整后 NI ∈ [29.5B, 32B](Buffett op earnings 对账);
 *   3. BRK.B (b) 路 verdict 非 null;
 *   4. 零漂移组五票 (a)(b) 两路 verdict JSON 逐字段全等;
 *   5. FAF 的 materiality < 0.25(阈值下最近邻,确认闸位)。
 * 价格/DGS10 从 DB 只读;SEC 请求经 sec-client(带 UA),每票间 sleep(300)。
 */
```

实现要点：
1. import 全走 `@/lib/*`（`resolveTickerCik`/`fetchCompanySubmissions`/`normalizeRecentFilings`/`fetchCompanyFacts`/`normalizeCompanyFacts`/`needsClassSharesFallback`/`applyClassSharesFallback`/`fundamentalsToFloorInput`/`deriveMarksAdjustment`/`runValuation`/`getLatestPrice`/`getLatestSplit`/`getLatestDgs10`/`isFundamentalsStale`/`isSplitCoverageStale`/`fundamentalsIntegrityViolated`）。
2. baseline 路用 `structuredClone` 后把 annual+quarterly 每行 `investment_fv_gain_loss = null`；两路各自完整走 `fundamentalsToFloorInput → runValuation`（guards 组装照 valuation-ingest）。
3. sic 从 `sec_companies` DB 行取（text→number 镜像 ingest）；BRK.B/BRK.A 在两路都先跑件①股数回退（`needsClassSharesFallback` 为真才跑；对账日志打印 patched 年数）。
4. verdict 全等比较用 `JSON.stringify` 前先删易变字段（无——两路同一进程同价同 DGS10，直接全等）。
5. 表格输出 + 断言结果 + `process.exit`。

- [ ] **Step 2: 跑探针（需网络+env）**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-marks-adjustment.ts`
Expected: 五条断言全过；**完整对比表逐字贴进 task 汇报**（RLI/WTM 现 true,below → (b) 路便宜信号预期收紧、RGA 抬升方向、BRK.B declined 是否解除——主线程逐票裁决用）。

- [ ] **Step 3: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 4: Commit**

```bash
git add web/scripts/probe-marks-adjustment.ts
git commit -m "chore(valuation): 件③真数据探针(五票before/after+零漂移sweep+Buffett对账断言)"
```

---

## Self-Review 记录

- Spec 覆盖：§2.1→Task 1；§2.2→Task 2；§3 验收 1→T2 check、2→T3 探针、3→T3 零漂移组、4→各 task 验证步；§4 运维属合并后主线程职责。
- 类型一致性：`MarksAdjustment`/`deriveMarksAdjustment`/`shouldDropTtmForMarks`/常量名在 Interfaces 与代码块一致；`FundamentalPeriod.investment_fv_gain_loss` 贯穿三个 task 同名。
- 无占位符：所有代码步给出完整代码或指名照抄来源（文件:行号）。
- 已知实现注意：Task 2 场景 5 的 `input.years[1]` 假设 most-recent-first 排序（FY2024 在 index 1），与 `fundamentalsToFloorInput` 排序一致。
