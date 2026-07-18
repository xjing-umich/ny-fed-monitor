# 成长型 franchise 护城河信号（`moat_via_growth`）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给"当期 EPV/AV 测试判 commodity、但历史已证实营业利润在持续复利增长"的真 franchise 一条护城河信号旁路（`moat_via_growth`），使其成长不再被封死在 5%（标杆 AMZN）。

**Architecture:** 在 `buildMoatReading`（epvFloor.ts）本会返回 `commodity` 的三个出口前，插入成长型 franchise 判别（非金融 + 各年营业利润全正 + 营业利润 log 回归年化增长达标 + 年数够）→ 命中即改判 `signal="franchise", moat_via_growth=true`；`deriveMoatCap`（moatCap.ts）对 `moat_via_growth` 按利润增速强度定 moderate/strong 档，照抄现有 `moat_via_roic` 的 roicOnly 分支。判别器不依赖 ROIC/structural_confidence（那是被划出范围的机制）；grade 抬升后 `gFund` 仍在 OE-DCF 里兜住 `g1`，只解开 cap、不改基本面量。

**Tech Stack:** TypeScript（Next.js 项目 `web/`）；纯函数 + `.check.ts` 断言脚本（`npx tsx --tsconfig scripts/tsconfig.json <file>.check.ts`，无测试框架，见 [[no-tests-solo-dev]]）；真引擎探针 + 只读全 universe 校准脚本走 Supabase。

## Global Constraints

- **CAGR 准确性硬门**：增长率一律 FY log-线性回归年化斜率，**禁用端点对端点 CAGR**（[[valuation-reform-expectations-roadmap]]）。营业利润增速沿用 `historicalGrowthBaseRate` 同口径（本 plan 新写 `operatingIncomeLogGrowth`，因该函数是营收专用）。
- **只吃 fiscal_period=FY 行**：调用方已过滤；不得用派生 Q4 行（[[cusip-corruption-episode]]）。
- **常量必须校准、禁拍脑袋**：4 个新常量的值由 Task 2 全 universe 校准锁定，provenance 落 `docs/superpowers/calibration/2026-07-18-growth-franchise-threshold.md`。
- **保守边界**：本旁路只解开 grade cap，不改任何基本面量（gRaw/gFund/cagr/EPV/AV 均不动）；`value_destruction`/`declined`/拆股护栏/`capital_structure_distorted` 优先级更高。
- **金融股排除**：`is_financial===true` 不进本旁路（无营业利润口径），走既有 SGR/pathB。
- **零漂移/零误伤**：既有 franchise（走 pathA/ROIC）、value_destruction、拆股护栏、资本结构死角判定不得改变。
- **文案**：用户可见 copy 遵守 `docs/copy-voice.md`，en/zh 各自独立、无 AI 腔（[[anti-ai-product-sense]]、[[no-mixed-language-copy]]）。
- **回复与文档正文中文**（[[reply-and-plan-in-chinese]]）。
- **数据准确性**：真数据验收须标 computed_at/价格日期与来源。
- **不擅自跑写库脚本**：`valuation:ingest` 等生产写库须用户显式授权。

---

### Task 1: 真引擎探针 + BEFORE 基线

**Files:**
- Create: `web/scripts/probe-growth-franchise.ts`
- Create: `web/scripts/.growth-franchise-before.txt`（探针 BEFORE 输出存档）

**Interfaces:**
- Consumes: `getSecCompanyData`（`@/lib/sec/read`）、`fundamentalsToFloorInput`/`computeValuationFloor`（`@/lib/valuation`）、`historicalGrowthBaseRate`（`@/lib/valuation/growthBaseRate`）。
- Produces: 命令行探针，打印每票 `signal / grade / capYears / moat_via_growth / g1 / IV(neutral) / verdict.bucket / marginPct`，供各 Task BEFORE↔AFTER 逐项对照。

- [ ] **Step 1: 写探针脚本**

```ts
// web/scripts/probe-growth-franchise.ts
/**
 * 成长型 franchise 旁路探针（只读）。BEFORE/AFTER 打印标杆集 moat 信号/grade/g1/IV/verdict。
 * 用法: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-growth-franchise.ts [TICKER...]
 */
import * as fs from "fs"; import * as path from "path"; import { fileURLToPath } from "url";
import { getSecCompanyData } from "@/lib/sec/read";
import { getLatestPrice } from "@/lib/managers/priceRead";
import { fundamentalsToFloorInput, computeValuationFloor, deriveStrikeZone, deriveOeDcf } from "@/lib/valuation";
import { getMarketRate } from "@/lib/valuation/marketRates";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../.env.local"); const out: Record<string, string> = {};
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...out, ...process.env } as Record<string, string>;
}
// 救回集(疑真franchise) + 对照集(真大宗,必须仍 commodity) + 零漂移对照
const DEFAULT = ["AMZN","ARM","EQIX","EW","AMD","CEG","CELH","EMN","AGCO","DINO","ARW","ATI","MSFT","NFLX","MA"];
const TICKERS = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  const dgs10 = (await getMarketRate("DGS10")) ?? 0.044;
  console.log("ticker  signal          grade    via_growth  g1     IV       verdict   margin");
  for (const ticker of TICKERS) {
    try {
      const sec = await getSecCompanyData(ticker);
      const sicRaw = (sec.company as { sic?: unknown } | null)?.sic;
      const sic = sicRaw != null && Number.isFinite(Number(sicRaw)) ? Number(sicRaw) : undefined;
      const fi = fundamentalsToFloorInput(ticker, ticker, sec.annual, 1, sic);
      const floor = computeValuationFloor(fi);
      if (!floor || floor.kind !== "floor") { console.log(`${ticker.padEnd(6)} (no floor)`); continue; }
      const price = await getLatestPrice(ticker);
      const sz = deriveStrikeZone(floor, price);
      const oe = deriveOeDcf(floor, fi.years, dgs10, price);
      const mr = floor.moat_reading; const mc = floor.moat_cap;
      const g1 = (oe as { g1?: number } | undefined)?.g1;
      const iv = (oe as { intrinsic_value_neutral?: number } | undefined)?.intrinsic_value_neutral;
      console.log(
        `${ticker.padEnd(6)} ${String(mr?.signal).padEnd(15)} ${String(mc?.grade).padEnd(8)} ` +
        `${String(mr?.moat_via_growth ?? false).padEnd(10)} ${g1 != null ? (g1*100).toFixed(1) : "—"}   ` +
        `${iv != null ? iv.toFixed(1) : "—"}    ${sz ? "(see verdict)" : "—"}`
      );
    } catch (e) { console.log(`${ticker.padEnd(6)} ERR ${String(e).slice(0,60)}`); }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

> 注：实现者须先 `grep -n "deriveStrikeZone\|deriveOeDcf\|intrinsic_value_neutral\|getMarketRate\|export" web/src/lib/valuation/index.ts web/src/lib/valuation/ownerEarningsDcf.ts web/src/lib/valuation/marketRates.ts` 核实真实导出名与返回字段名，按真实签名微调打印字段（探针只为观测，字段名对不上就改成真实名，不要硬凑）。目标是稳定打印 signal/grade/via_growth/g1/IV。

- [ ] **Step 2: 跑探针，确认 BEFORE 基线**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-growth-franchise.ts | tee scripts/.growth-franchise-before.txt`
Expected（BEFORE，本 Task 不改引擎）：AMZN/ARM/EQIX/EW/AMD/CEG/CELH/EMN/AGCO/DINO/ARW/ATI 全部 `signal=commodity`、`via_growth=false`；AMZN `g1≈5.0`；MSFT/NFLX/MA `signal=franchise`（零漂移对照）。

- [ ] **Step 3: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/scripts/probe-growth-franchise.ts web/scripts/.growth-franchise-before.txt
git commit -m "test(valuation): 成长型 franchise 旁路探针 + BEFORE 基线

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 全 universe 校准 → 锁定 4 个阈值常量 + provenance

**Files:**
- Create: `web/scripts/growth-franchise-calibrate.ts`（只读，不写库）
- Create: `docs/superpowers/calibration/2026-07-18-growth-franchise-threshold.md`

**Interfaces:**
- Consumes: 全 universe 迭代（照抄 `web/scripts/structural-growth-calibrate.ts` 的 `collectUniverse`/securities 读取/并发 worker 骨架）、`computeValuationFloor`、本 plan 的 `operatingIncomeLogGrowth` 口径（脚本内**本地内联**同一算法，不 import 未落地的 Task 3 函数）。
- Produces: provenance 文档，锁定 `GROWTH_FRANCHISE_MIN_CAGR / GROWTH_FRANCHISE_MIN_YEARS / GROWTH_FRANCHISE_STRONG_CAGR / GROWTH_FRANCHISE_STRONG_MIN_YEARS` 四个值（Task 3 据此写死）。

- [ ] **Step 1: 写校准脚本**

以 `web/scripts/structural-growth-calibrate.ts` 为骨架（collectUniverse / securities 分页 / isOperatingSecurity / resolveAds / CONCURRENCY worker），对每个 `moat_reading.signal==="commodity"` 且 `is_financial!==true` 的票，本地内联计算：
- `allOpIncPositive`：全 FY 年 operating_income 均 >0；
- `opIncLogGrowth`：对 `ln(operating_income)` 做 FY log-线性回归年化斜率（各年正才有意义，算法与 §Task3 `operatingIncomeLogGrowth` 逐字一致）；
- `years`：参与回归的有效 FY 年数；
- `epvAvCons`：`moat_reading.epv_per_share_compared / asset_per_share_compared`。

对每个候选阈值网格 `MIN_CAGR ∈ {0.04,0.05,0.06,0.07,0.08}`、`MIN_YEARS ∈ {4,5,6}`、`STRONG_CAGR ∈ {0.12,0.15,0.18,0.20}` 输出：命中集大小、命中集里的 ticker 列表、strong/moderate 拆分。每行 `console.log(JSON.stringify(row))` 打 NDJSON，`console.error` 打进度。

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/growth-franchise-calibrate.ts > /tmp/gfcal.ndjson 2> /tmp/gfcal.log`

- [ ] **Step 2: 定阈值（人工判读校准输出）**

判读标准（provenance 文档写明依据，不空谈）：
1. **必须命中**：AMZN、ARM、EQIX（真 franchise）。**必须落 strong**：AMZN（利润 log 增速应 ~0.25+）。
2. **必须不命中**：EMN、AGCO、DINO、ARW、ATI（真大宗）、CELH（未证实，各年利润非全正会自然出局）。
3. 在满足 1、2 的前提下选**最稳的中间值**（不贴边），使命中集里可辨识的真 franchise 比例最高、可疑周期名最少。
4. 记录候选值下命中集的完整 ticker 清单与人工甄别标注（真/疑/假），作为 provenance。

预期落点（校准若与此矛盾以校准为准）：`MIN_CAGR≈0.05`、`MIN_YEARS=5`、`STRONG_CAGR≈0.15`、`STRONG_MIN_YEARS=5`。

- [ ] **Step 3: 写 provenance 文档**

`docs/superpowers/calibration/2026-07-18-growth-franchise-threshold.md`：记录数据源与 computed_at、universe 大小、候选网格、每候选命中集、最终四值 + 选择依据、真/假分离验证表（含标杆 10 名实际算得的 opIncLogGrowth/years/allPositive/命中与否/档位）。

- [ ] **Step 4: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/scripts/growth-franchise-calibrate.ts docs/superpowers/calibration/2026-07-18-growth-franchise-threshold.md
git commit -m "docs(valuation): 成长型 franchise 阈值全 universe 校准 + provenance

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `growthFranchise` 纯函数 + 常量（moatCap.ts）

**Files:**
- Modify: `web/src/lib/valuation/moatCap.ts`（新增常量 + `operatingIncomeLogGrowth` + `growthFranchise` + 类型 `GrowthFranchiseResult`）
- Test: `web/src/lib/valuation/moatCap.check.ts`（追加断言）

**Interfaces:**
- Consumes: `ValuationFloorYear`（`./types`，字段 `fiscal_year`、`operating_income?`）。
- Produces:
  - `export const GROWTH_FRANCHISE_MIN_CAGR / GROWTH_FRANCHISE_MIN_YEARS / GROWTH_FRANCHISE_STRONG_CAGR / GROWTH_FRANCHISE_STRONG_MIN_YEARS`
  - `export type GrowthFranchiseResult = { passes: boolean; strong: boolean; opIncLogGrowth: number | undefined; years: number }`
  - `export function operatingIncomeLogGrowth(fyYears: ValuationFloorYear[]): number | undefined`
  - `export function growthFranchise(input: { fyYears: ValuationFloorYear[]; isFinancial: boolean }): GrowthFranchiseResult`

- [ ] **Step 1: 追加失败断言到 moatCap.check.ts**

在文件末尾追加（先 import 新符号：把 `growthFranchise, operatingIncomeLogGrowth, GROWTH_FRANCHISE_MIN_YEARS` 加进顶部 `from "./moatCap"` 的解构）：

```ts
// ── growthFranchise（成长型 franchise 判别器）─────────────────────────────
const yr = (fiscal_year: number, operating_income: number): ValuationFloorYear =>
  ({ fiscal_year, operating_income } as ValuationFloorYear);

// 各年营业利润全正 + log 增速达标 + 年数够 → passes；极高增速 + 年数够 → strong
{ const fy = [yr(2020,23), yr(2021,25), yr(2022,12), yr(2023,37), yr(2024,69), yr(2025,80)]; // AMZN 型
  const r = growthFranchise({ fyYears: fy, isFinancial: false });
  assert(r.passes === true, "各年利润全正+高增速 → passes"); 
  assert(r.strong === true, "利润增速极高+年数够 → strong"); }

// 有一年营业利润 ≤0 → 不 passes（周期坑,DINO/EMN 型）
{ const fy = [yr(2020,10), yr(2021,-2), yr(2022,15), yr(2023,20), yr(2024,25), yr(2025,30)];
  const r = growthFranchise({ fyYears: fy, isFinancial: false });
  assert(r.passes === false, "有亏损年 → 不 passes"); }

// 利润全正但平/降 → 不 passes（AGCO/ARW 型）
{ const fy = [yr(2020,30), yr(2021,29), yr(2022,28), yr(2023,30), yr(2024,29), yr(2025,30)];
  const r = growthFranchise({ fyYears: fy, isFinancial: false });
  assert(r.passes === false, "利润平/降 → 不 passes"); }

// 年数不足 GROWTH_FRANCHISE_MIN_YEARS → 不 passes（不可评估不放行,保守）
{ const fy = [yr(2023,10), yr(2024,20), yr(2025,40)];
  const r = growthFranchise({ fyYears: fy, isFinancial: false });
  assert(r.passes === false, "年数不足 → 不 passes"); }

// 金融股 → 不进旁路
{ const fy = [yr(2020,10), yr(2021,12), yr(2022,15), yr(2023,20), yr(2024,25), yr(2025,35)];
  const r = growthFranchise({ fyYears: fy, isFinancial: true });
  assert(r.passes === false, "金融股 → 不进旁路"); }

// operatingIncomeLogGrowth：全正序列返回有限正值,含非正年跳过后不足则 undefined
{ const g = operatingIncomeLogGrowth([yr(2021,10), yr(2022,12), yr(2023,14), yr(2024,17), yr(2025,20)]);
  assert(g != null && g > 0.1 && g < 0.3, "log 增速在合理区间"); }
{ const g = operatingIncomeLogGrowth([yr(2024,-5), yr(2025,10)]);
  assert(g === undefined, "有效正年不足 → undefined"); }
```

- [ ] **Step 2: 跑 check，确认失败**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/moatCap.check.ts`
Expected: 报错（`growthFranchise is not a function` / import 解析失败）。

- [ ] **Step 3: 实现常量 + 两个函数**

在 `moatCap.ts` 顶部常量区（`STRONG_MIN_PROFIT_STREAK` 附近）加常量，值取自 Task 2 provenance（下方为预期锁定值，若 provenance 不同以 provenance 为准）：

```ts
// ── 成长型 franchise 判别（moat_via_growth，spec §3）───────────────────────────
// 当期 EPV/AV 判 commodity、但历史营业利润已证实持续复利增长 → 给护城河信号。
// 阈值经全 universe 校准锁定,provenance: docs/superpowers/calibration/2026-07-18-growth-franchise-threshold.md
export const GROWTH_FRANCHISE_MIN_CAGR = 0.05;        // 营业利润 log 年化增速下限
export const GROWTH_FRANCHISE_MIN_YEARS = 5;          // 证实性:参与回归的有效 FY 年数下限
export const GROWTH_FRANCHISE_STRONG_CAGR = 0.15;     // 强档利润增速阈值
export const GROWTH_FRANCHISE_STRONG_MIN_YEARS = 5;   // 强档年数下限

export type GrowthFranchiseResult = { passes: boolean; strong: boolean; opIncLogGrowth: number | undefined; years: number };
```

在函数区（`sustainedProfitStreak` 之后）加：

```ts
/**
 * 营业利润 FY log-线性回归年化增速（CAGR 准确性硬门:回归非端点）。各年 operating_income 须 >0
 * 才计入(log 定义域);有效正点 <GROWTH_FRANCHISE_MIN_YEARS → undefined。与 growthBaseRate 同口径。
 */
export function operatingIncomeLogGrowth(fyYears: ValuationFloorYear[]): number | undefined {
  const pts = fyYears
    .filter((y) => y.operating_income != null && Number.isFinite(y.operating_income) && (y.operating_income as number) > 0)
    .map((y) => ({ x: y.fiscal_year, y: Math.log(y.operating_income as number) }));
  if (pts.length < GROWTH_FRANCHISE_MIN_YEARS) return undefined;
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (!(denom > 0)) return undefined;
  const slope = (n * sxy - sx * sy) / denom;
  const g = Math.exp(slope) - 1;
  return Number.isFinite(g) ? g : undefined;
}

/**
 * 成长型 franchise 判别器（spec §3）。非金融 + 窗口内各年营业利润全正 + 营业利润 log 增速 ≥ 下限
 * + 有效年数 ≥ 下限 → passes（改判 franchise 的资格）。增速 ≥ 强档阈值且年数够 → strong。
 * 判别器不依赖 ROIC/structural_confidence（被划出范围的机制）;只用已证实的营业利润轨迹。
 */
export function growthFranchise(input: { fyYears: ValuationFloorYear[]; isFinancial: boolean }): GrowthFranchiseResult {
  const fail: GrowthFranchiseResult = { passes: false, strong: false, opIncLogGrowth: undefined, years: 0 };
  if (input.isFinancial) return fail;
  const withOi = input.fyYears.filter((y) => y.operating_income != null && Number.isFinite(y.operating_income));
  const years = withOi.length;
  if (years < GROWTH_FRANCHISE_MIN_YEARS) return fail;
  if (!withOi.every((y) => (y.operating_income as number) > 0)) return fail; // G1 各年利润全正
  const g = operatingIncomeLogGrowth(withOi);
  if (g == null) return fail;
  const passes = g >= GROWTH_FRANCHISE_MIN_CAGR;
  const strong = passes && g >= GROWTH_FRANCHISE_STRONG_CAGR && years >= GROWTH_FRANCHISE_STRONG_MIN_YEARS;
  return { passes, strong, opIncLogGrowth: g, years };
}
```

- [ ] **Step 4: 跑 check，确认通过**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/moatCap.check.ts`
Expected: 全部 `ok:`，无 `FAIL:`。

- [ ] **Step 5: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/lib/valuation/moatCap.ts web/src/lib/valuation/moatCap.check.ts
git commit -m "feat(valuation): growthFranchise 判别器 + 营业利润 log 增速(CAGR硬门)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `buildMoatReading` 旁路 + `assembleFloor` 接线（epvFloor.ts）+ 类型

**Files:**
- Modify: `web/src/lib/valuation/types.ts`（`MoatReading` 加 `moat_via_growth?: boolean`）
- Modify: `web/src/lib/valuation/epvFloor.ts`（`buildMoatReading` 加参数 + 三处 commodity 出口旁路；`assembleFloor` 算 `growthFr` 并传入）
- Test: `web/src/lib/valuation/epvFloor.check.ts`（追加断言）

**Interfaces:**
- Consumes: `growthFranchise` / `GrowthFranchiseResult`（Task 3，`./moatCap`）。
- Produces: `buildMoatReading(epvLamp, reproduction, shares, roicLongStrong, growthFr)` 新增第 5 参 `growthFr: GrowthFranchiseResult`；命中时 MoatReading 带 `signal:"franchise", moat_via_growth:true`，保留原 dual/single 字段，`dual_test_passed:false`。

- [ ] **Step 1: types.ts 加字段**

在 `MoatReading` 的 `moat_via_roic?` 之后加：

```ts
  /** true when the franchise signal came from proven operating-income growth (EPV/AV test would call it commodity). */
  moat_via_growth?: boolean;
```

- [ ] **Step 2: 追加失败断言到 epvFloor.check.ts**

先看 epvFloor.check.ts 现有 `buildMoatReading` 调用样式（`grep -n "buildMoatReading" src/lib/valuation/epvFloor.check.ts`），照其构造 epvLamp/reproduction 夹具，追加：

```ts
// ── 成长型 franchise 旁路（moat_via_growth）────────────────────────────────
// EPV/AV_cons 落 commodity 区间(1.14),但 growthFr.passes → 改判 franchise via growth
{ const epvLamp = { assessable: true, per_share_low: 39, per_share_high: 41 } as any; // epvMid≈40
  const repro = { assessable: true, per_share: 35, dual_av_comparable: true, reproduction_per_share: 36, intangibles_separated: true } as any; // ratioCons≈1.14
  const gfPass = { passes: true, strong: true, opIncLogGrowth: 0.25, years: 6 } as any;
  const gfFail = { passes: false, strong: false, opIncLogGrowth: 0.01, years: 6 } as any;
  const withGrowth = buildMoatReading(epvLamp, repro, 1000, false, gfPass);
  assert(withGrowth.signal === "franchise" && withGrowth.moat_via_growth === true, "commodity 区间 + growthFr.passes → franchise via growth");
  assert(withGrowth.dual_test_passed !== true, "via growth 不声称通过 dual EPV 测试");
  const noGrowth = buildMoatReading(epvLamp, repro, 1000, false, gfFail);
  assert(noGrowth.signal === "commodity", "同票 growthFr 不过 → 仍 commodity"); }

// 机制2:EPV/AV_cons≥1.25 但被 reproduction 挡(blocked_by_reproduction)+ growthFr.passes → franchise
{ const epvLamp = { assessable: true, per_share_low: 47, per_share_high: 49 } as any; // epvMid≈48
  const repro = { assessable: true, per_share: 30, dual_av_comparable: true, reproduction_per_share: 45, intangibles_separated: true } as any; // ratioCons 1.6, ratioRepr 1.07
  const gfPass = { passes: true, strong: false, opIncLogGrowth: 0.10, years: 6 } as any;
  const r = buildMoatReading(epvLamp, repro, 1000, false, gfPass);
  assert(r.signal === "franchise" && r.moat_via_growth === true, "reproduction 挡下 + growthFr.passes → franchise via growth"); }

// value_destruction(EPV<AV commodity floor 之下)即便 growthFr.passes 也不救(优先级更高)
{ const epvLamp = { assessable: true, per_share_low: 20, per_share_high: 22 } as any; // epvMid 21, ratioCons 0.6
  const repro = { assessable: true, per_share: 35, dual_av_comparable: true, reproduction_per_share: 36, intangibles_separated: true } as any;
  const gfPass = { passes: true, strong: true, opIncLogGrowth: 0.3, years: 6 } as any;
  const r = buildMoatReading(epvLamp, repro, 1000, false, gfPass);
  assert(r.signal === "value_destruction", "value_destruction 优先,growthFr 不救"); }

// 零漂移:真 franchise(ratioCons 3.0 双过)不受影响
{ const epvLamp = { assessable: true, per_share_low: 100, per_share_high: 110 } as any;
  const repro = { assessable: true, per_share: 35, dual_av_comparable: true, reproduction_per_share: 36, intangibles_separated: true } as any;
  const gfFail = { passes: false, strong: false, opIncLogGrowth: 0, years: 0 } as any;
  const r = buildMoatReading(epvLamp, repro, 1000, false, gfFail);
  assert(r.signal === "franchise" && r.moat_via_growth !== true, "真 franchise 走 dual,不打 via_growth"); }
```

> 若 epvLamp/reproduction 的真实必填字段与上方夹具不符，实现者按 `types.ts` 的 `EpvLamp`/`ReproductionValue` 补齐必填字段（保持 ratio 目标值不变）。

- [ ] **Step 3: 跑 check，确认失败**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/epvFloor.check.ts`
Expected: 报错（`buildMoatReading` 只接 4 参 / `moat_via_growth` 恒 undefined → 断言 FAIL）。

- [ ] **Step 4: 实现旁路**

4a. `buildMoatReading` 签名加第 5 参：

```ts
export function buildMoatReading(epvLamp: EpvLamp, reproduction: ReproductionValue, shares: number, roicLongStrong: boolean, growthFr: GrowthFranchiseResult): MoatReading {
```
并在 `epvFloor.ts` 顶部 import 补 `growthFranchise, GrowthFranchiseResult`（`GrowthFranchiseResult` 是类型，用 `import type` 或合并进现有 `from "./moatCap"`）。

4b. 在函数内 `const epvMid = ...; const avCons = ...; const ratioCons = ...`（现 515-517 行）之后、`if (dualComparable)` 之前，加一个复用的旁路 reading 构造器：

```ts
  // 成长型 franchise 旁路（spec §3）:纯比率本会判 commodity,但已证实营业利润持续增长 → 改判 franchise。
  // 保留原 dual/single 展示字段,dual_test_passed 保持 false（非经 dual EPV 测试而来）。
  const viaGrowth = (extraFields: Partial<MoatReading>): MoatReading => ({
    signal: "franchise",
    label: "Earnings power looks commodity-like today, but operating income has compounded for years — a franchise (moat) signal on proven earnings growth, not a verdict.",
    basis_note: basisNote,
    moat_via_growth: true,
    ...extraFields,
  });
```

4c. 三处 commodity 出口改为"先看 growthFr"（value_destruction 出口不动）：

- dual 分支「blocked_by_reproduction」（现 539-548）：在 `return { signal:"commodity", ... franchise_blocked_by_reproduction:true }` 之前插
  ```ts
      if (growthFr.passes) return viaGrowth({ ...dualFields, franchise_value: (epvMid - avCons) * shares });
  ```
- dual 分支「conservative commodity」（现 550-558）：在该 `return { signal:"commodity", ...dualFields }` 之前插同一行
  ```ts
      if (growthFr.passes) return viaGrowth({ ...dualFields, franchise_value: (epvMid - avCons) * shares });
  ```
- single-AV 分支「commodity」（现 579-580）：在该 return 之前插
  ```ts
    if (growthFr.passes) return viaGrowth({ epv_per_share_compared: epvMid, asset_per_share_compared: avCons, franchise_value: (epvMid - avCons) * shares });
  ```

4d. `assembleFloor`（现 173-177 附近）在 `roicLongStrongMoat` 之后、`buildMoatReading` 调用前加：

```ts
  const growthFr = growthFranchise({ fyYears: allYears, isFinancial });
```
并把调用改为：
```ts
  const moatReading = buildMoatReading(moatRefLamp, assetFloor, shares, roicLongStrongMoat, growthFr);
```
（`growthFr` 下一 Task 还要传给 `deriveMoatCap`；本 Task 先只喂 buildMoatReading。）

- [ ] **Step 5: 跑 check，确认通过 + tsc**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/epvFloor.check.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | head`
Expected: check 全 `ok:`；tsc 无新增错误（本机 google fonts 屏蔽不影响 tsc，见 [[local-build-google-fonts-blocked]]）。

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/lib/valuation/types.ts web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts
git commit -m "feat(valuation): buildMoatReading 成长型 franchise 旁路 + assembleFloor 接线

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `deriveMoatCap` 定档分支（moatCap.ts）

**Files:**
- Modify: `web/src/lib/valuation/moatCap.ts`（`deriveMoatCap` 加 `moat_via_growth` 分支 + 入参 `growthFranchiseStrong?`）
- Modify: `web/src/lib/valuation/epvFloor.ts`（`deriveMoatCap` 调用传 `growthFranchiseStrong: growthFr.strong`）
- Test: `web/src/lib/valuation/moatCap.check.ts`（追加断言）

**Interfaces:**
- Consumes: `MoatReading.moat_via_growth`（Task 4）、`growthFr.strong`（Task 3/4）。
- Produces: `deriveMoatCap` 对 `moat.moat_via_growth===true` 返回 `grade:"strong"`（当 `growthFranchiseStrong===true`）或 `grade:"moderate"`，`capYears` 对应 `CAP_STRONG`/`CAP_MODERATE`。

- [ ] **Step 1: 追加失败断言到 moatCap.check.ts**

```ts
// ── moat_via_growth 定档 ────────────────────────────────────────────────
const growthMoat = { signal: "franchise", moat_via_growth: true } as any;
// strong:growthFranchiseStrong=true → CAP_STRONG
{ const r = deriveMoatCap({ moat: growthMoat, epvAvRatio: undefined, declined: false, suppressedFlags: false, roicStable: undefined, growthFranchiseStrong: true });
  assert(r.grade === "strong" && r.capYears === CAP_STRONG, "via_growth + strong → CAP 20"); }
// moderate:growthFranchiseStrong=false → CAP_MODERATE
{ const r = deriveMoatCap({ moat: growthMoat, epvAvRatio: undefined, declined: false, suppressedFlags: false, roicStable: undefined, growthFranchiseStrong: false });
  assert(r.grade === "moderate" && r.capYears === CAP_MODERATE, "via_growth 非 strong → CAP 10"); }
// via_growth 即便 AV 比率缺失也不落 none（区别于普通 franchise 需要比率）
{ const r = deriveMoatCap({ moat: growthMoat, epvAvRatio: undefined, epvAvRatioOperating: undefined, declined: false, suppressedFlags: false, roicStable: undefined, growthFranchiseStrong: false });
  assert(r.grade !== "none", "via_growth 不因缺 AV 比率落 none"); }
```

（顶部 import 已含 `CAP_STRONG, CAP_MODERATE`，无需改 import。）

- [ ] **Step 2: 跑 check，确认失败**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/moatCap.check.ts`
Expected: `via_growth` 断言 FAIL（当前 `roicOnly=false` 且 `epvAvRatio==null` → 落 none）。

- [ ] **Step 3: 实现定档分支**

3a. `deriveMoatCap` 入参类型加（`sustainedProfitYears?` 之后）：

```ts
  /** 成长型 franchise 强档判据（Task 5）:growthFranchise().strong;仅当 moat.moat_via_growth 时有意义。 */
  growthFranchiseStrong?: boolean;
```
并把解构行加上 `growthFranchiseStrong`。

3b. 在函数体最前（`const profitStreakOk = ...` 之后、`const roicOnly = ...` 之前）加：

```ts
  const viaGrowth = moat.moat_via_growth === true;
```

3c. 把首个守卫（现 32-34 行）改为让 via_growth 也算"有信号"：

```ts
  if (moat.signal !== "franchise" || (!roicOnly && !viaGrowth && epvAvRatio == null && epvAvRatioOperating == null)) {
    return { grade: "none", capYears: CAP_NONE, durablePassed: false, basis: "无护城河信号，不延长竞争优势期。" };
  }
```

3d. 在 `if (roicOnly) { ... }` 块之后、`const ratioForMoat = ...`（现 49 行）之前，加 via_growth 分支：

```ts
  if (viaGrowth) {
    // 成长型 franchise:当期 EPV/AV 看不出护城河,凭已证实营业利润持续增长定档。
    // 强档由 growthFranchiseStrong 承担;仍受盈利下滑/红旗降档。gFund 在 OE-DCF 侧兜住 g1,此处只定 cap。
    const core = !declined && !suppressedFlags;
    if (core && growthFranchiseStrong === true) {
      return { grade: "strong", capYears: CAP_STRONG, durablePassed: true,
        basis: `强护城河（当期 EPV 呈商品化,但营业利润长期持续复利增长）→ 竞争优势期约 ${CAP_STRONG} 年。` };
    }
    const reason = declined ? "盈利下滑" : suppressedFlags ? "资本开支红旗" : "利润增速未达强档";
    return { grade: "moderate", capYears: CAP_MODERATE, durablePassed: false,
      basis: `${reason}（凭已证实利润增长的成长型护城河）→ 竞争优势期约 ${CAP_MODERATE} 年。` };
  }
```

3e. `epvFloor.ts` 的 `deriveMoatCap({...})` 调用（现 226-237）加一行：

```ts
    growthFranchiseStrong: growthFr.strong,
```

- [ ] **Step 4: 跑 check，确认通过 + tsc**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/moatCap.check.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | head`
Expected: 全 `ok:`；tsc 无新增错误。

- [ ] **Step 5: 探针 AFTER 验证引擎链路已通**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-growth-franchise.ts AMZN ARM EQIX EMN AGCO DINO`
Expected: AMZN/ARM/EQIX `signal=franchise`、`via_growth=true`、grade≠none、`g1` 明显 >5.0（AMZN 应 ~7–10.5）；EMN/AGCO/DINO 仍 `commodity`/`via_growth=false`。

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/lib/valuation/moatCap.ts web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/moatCap.check.ts
git commit -m "feat(valuation): deriveMoatCap 成长型 franchise 定档(moderate/strong)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 个股页 moat 说明（EarningsPowerFloorCard 双语标签）

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`（franchise 标签在 `moat_via_growth` 时加限定语）
- Test: 人工看渲染（本项目无组件测试，见 [[no-tests-solo-dev]]），用探针确认 floor 已带 `moat_via_growth`。

**Interfaces:**
- Consumes: `floor.moat_reading.moat_via_growth`（Task 4）。
- Produces: 卡内 moat 行,franchise 且 via_growth 时英文 "Franchise (via earnings growth)" / 中文 "特许经营（凭盈利增长）",否则保持既有 "Franchise (moat)" / "特许经营（护城河）"。

- [ ] **Step 1: 读现有标签映射**

`grep -n "franchise:\|commodity:\|moat:" src/components/valuation/EarningsPowerFloorCard.tsx`，定位英/中两处 `franchise:` 标签常量（现 48/54 行附近）与其消费点（渲染 `signalLabel[signal]` 的位置）。

- [ ] **Step 2: 消费点按 moat_via_growth 选标签**

在渲染 moat 信号标签处，把 `signalLabel[signal]` 改为：franchise 且 `floor.moat_reading.moat_via_growth === true` 时用新限定语，否则原值。新增双语串（en 块 / zh 块各一）：

```ts
// en 块
franchiseViaGrowth: "Franchise (via earnings growth)",
// zh 块
franchiseViaGrowth: "特许经营（凭盈利增长）",
```

渲染处（示意，按真实变量名接）：

```tsx
const moatLabel =
  signal === "franchise" && floor.moat_reading.moat_via_growth === true
    ? t.franchiseViaGrowth
    : signalLabel[signal];
```

文案须 en/zh 各自独立、无 AI 腔（[[anti-ai-product-sense]]、[[no-mixed-language-copy]]）。

- [ ] **Step 3: tsc + 探针确认数据侧就绪**

Run: `cd web && npx tsc --noEmit -p tsconfig.json 2>&1 | head && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-growth-franchise.ts AMZN`
Expected: tsc 无新增错误；AMZN `via_growth=true`（渲染侧会取到限定语）。

- [ ] **Step 4: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(stocks): moat 标签区分'凭盈利增长'的成长型 franchise (en/zh)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: 全套回归 + 标杆分离 + tsc 终验

**Files:**
- Modify: `web/scripts/.growth-franchise-before.txt` 对照（AFTER 存 `/tmp` 或追加对照说明，不覆盖 BEFORE）
- Test: 全 valuation `.check.ts` + tsc

**Interfaces:**
- Consumes: Task 1 探针、全部已落地引擎改动。
- Produces: 验收账本（写进本 plan 末尾或 commit message）：标杆集 AFTER 实际值、分离结论、tsc/check 结果。

- [ ] **Step 1: 探针 AFTER 全集**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-growth-franchise.ts | tee /tmp/gf-after.txt`
Expected 且逐条核对：
- **救回**：AMZN/ARM/EQIX → `franchise` + `via_growth=true` + grade≠none；EW ≥ moderate（若校准落其外则记录实际）。
- **零误放**：EMN/AGCO/DINO/ARW/ATI → 仍 `commodity` + `via_growth=false`。
- **零漂移**：MSFT/NFLX/MA → `franchise` + `via_growth≠true`（走原 pathA/ROIC，signal/grade 不变）。
- **AMZN g1**：从 ~5.0 升到 ~7–10.5（受 gFund≈10.5% 兜住,记录实际 g1/IV/verdict）。

- [ ] **Step 2: 跑全部 valuation check**

Run:
```bash
cd web && for f in src/lib/valuation/*.check.ts; do echo "== $f =="; npx tsx --tsconfig scripts/tsconfig.json "$f" 2>&1 | grep -E "FAIL|Error" && echo "  ^has failures" || echo "  all ok"; done
```
Expected: 每个文件 `all ok`，无 `FAIL`/`Error`。特别确认 `moatGrowthFusion.check.ts`、`ownerEarningsDcf.check.ts`、`deriveValuationVerdict.check.ts` 未被本改动打破（moat grade 影响成长 cap 链路）。

- [ ] **Step 3: tsc 终验**

Run: `cd web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "google" | head -20`
Expected: 无类型错误（google fonts 相关忽略）。

- [ ] **Step 4: 回填验收账本 + 更新 spec 实际值**

把 Step 1 的 AMZN 等实际 BEFORE→AFTER 值（signal/grade/g1/IV/verdict/margin）回填进 spec §7 或本 plan 末尾"验收结果"节。诚实记录：AMZN 若仍判 above 就写 above（本设计目标是消除定性错误与量级荒谬,不承诺翻正）。

- [ ] **Step 5: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add docs/superpowers/ web/scripts/
git commit -m "test(valuation): 成长型 franchise 旁路全套回归 + 标杆分离验收账本

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec 覆盖**：§2 目标（旁路救回 AMZN 类）→ Task 3/4/5；§2 非目标（不碰 EPV/structural_confidence/SOTP）→ 判别器只用营业利润，未触 EPV/sc；§3 判别器 G0-G3 → Task 3 `growthFranchise`（G0 isFinancial / G1 全正 / G2 log 增速 / G3 年数）；§3 两种机制 → Task 4 三处 commodity 出口（dual-blocked / dual-commodity / single-commodity）；§4 强度分档 → Task 5；§5 保守边界（gFund 兜 g1、优先级）→ Task 4 value_destruction 优先断言 + Task 5 只定 cap 注释；§6 组件 → types/moatCap/epvFloor/EarningsPowerFloorCard/校准/探针全覆盖；§7 验收 → Task 7；§8 风险（校准、金融排除、strong 谨慎）→ Task 2 校准 + G0 + Task 5 strong 双约束。无遗漏。

**Placeholder 扫描**：无 TBD/TODO；常量值给出预期锁定值并指明以 Task 2 provenance 为准（非占位,是校准流程）；每个改代码步骤均含完整代码。

**类型一致性**：`GrowthFranchiseResult`（Task 3 定义，字段 `passes/strong/opIncLogGrowth/years`）→ Task 4 `buildMoatReading` 第 5 参、Task 5 `growthFr.strong`；`moat_via_growth`（Task 4 types.ts）→ Task 5 `moat.moat_via_growth`、Task 6 渲染；`growthFranchiseStrong`（Task 5 deriveMoatCap 入参）← `growthFr.strong`。名称跨 Task 一致。

**已知需实现者现场核实项**（已在对应 Step 标注）：探针的 `deriveStrikeZone/deriveOeDcf/intrinsic_value_neutral/getMarketRate` 真实导出名与字段名；epvFloor.check.ts 的 `EpvLamp`/`ReproductionValue` 夹具必填字段；EarningsPowerFloorCard 的标签变量名与消费点。
