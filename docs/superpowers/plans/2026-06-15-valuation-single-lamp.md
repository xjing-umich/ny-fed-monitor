# 估值地基层数据牢固化（金融股单灯回退 + 多股权诚实标注）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让无营业利润的金融股（银行/保险/JNJ）以 Buffett owner-earnings 单灯渲染估值卡，让无法取得真实股数的多股权票（V/BRK）诚实标注而非静默消失。

**Architecture:** 纯函数引擎 `computeValuationFloor` 返回类型从 `ValuationFloor | undefined` 扩为 `ValuationFloor | PerShareUnavailable | undefined`，按"盈利年≥3 → 有股数？ → 有营业利润率？"三层决策树分流（两灯完整档 / Buffett 单灯档 / per_share_unavailable）。卡片与个股页适配联合类型。改动全在 read 层（金融股即时生效，无需重跑 ingest）；额外加 shares_diluted tag 兜底（须重跑 ingest 方见效，非本轮硬目标）。

**Tech Stack:** TypeScript, Next.js 16 RSC, node:assert 自检（`npx tsx`，无测试框架，见 [[no-tests-solo-dev]]）。

**Spec:** `docs/superpowers/specs/2026-06-15-valuation-single-lamp-and-data-foundation-design.md`

**工作目录：** `web/`（worktree 已 `npm ci` 装真包）。所有命令在 `web/` 下执行。

---

### Task 1: 引擎单灯回退 + per_share_unavailable（types + epvFloor + 自检）

**Files:**
- Modify: `web/src/lib/valuation/types.ts`
- Modify: `web/src/lib/valuation/epvFloor.ts`
- Test: `web/src/lib/valuation/epvFloor.check.ts`

- [ ] **Step 1: 先写失败的断言（TDD）**

在 `web/src/lib/valuation/epvFloor.check.ts` 顶部 import 行补 `ValuationFloor` 类型：

```ts
import type { ValuationFloor, ValuationFloorInput, ValuationFloorYear } from "./types";
```

在 `function year(...)` 定义之后、`compounder` 定义之前，插入收窄助手：

```ts
// computeValuationFloor 现返回联合类型；这个助手在断言里收窄到完整 floor。
function floorOf(r: ReturnType<typeof computeValuationFloor>): ValuationFloor {
  assert.ok(r && "kind" in r && r.kind === "floor", "expected a full floor result");
  return r;
}
```

把文件中所有"取完整 floor"的写法从 `computeValuationFloor(X)!` 改为 `floorOf(computeValuationFloor(X))`。逐处（保留期待 undefined 的两处不动）：

```ts
const floor = floorOf(computeValuationFloor(compounder));
const lf = floorOf(computeValuationFloor(levered));
const lm = floorOf(computeValuationFloor(loss));
const highTax = floorOf(computeValuationFloor({ ticker: "HI", years: compounder.years.map((y) => ({ ...y, effective_tax_rate: 0.3 })) }));
const negTax = floorOf(computeValuationFloor({ ticker: "NEG", years: compounder.years.map((y) => ({ ...y, effective_tax_rate: -0.1 })) }));
const noTax = floorOf(computeValuationFloor({ ticker: "NOTAX", years: compounder.years.map(({ effective_tax_rate, ...rest }) => rest) }));
const noIntang = floorOf(computeValuationFloor({ ticker: "NOINT", years: compounder.years.map(({ goodwill, intangibles, ...rest }) => rest) }));
const negTangible = floorOf(computeValuationFloor({ ticker: "NEGT", years: compounder.years.map((y) => ({ ...y, goodwill: 4_900, intangibles: 300 })) }));
```

在文件末尾 `console.log(...)` 之前，插入新断言块：

```ts
// ── 单灯回退：金融股（有净利+股数、无营业利润率）─────────────────────────────
// 银行式 fixture：无 operating_margin / operating_income，但有 net_income、shares、equity。
const financial: ValuationFloorInput = {
  ticker: "BANKX",
  years: [
    year(2025, { net_income: 3_000, pretax_income: 3_800, income_tax_expense: 800, shareholders_equity: 20_000, cash: 5_000, total_debt: 1_000, net_debt: -4_000, shares_diluted: 1_000 }),
    year(2024, { net_income: 2_800, pretax_income: 3_500, income_tax_expense: 700, shareholders_equity: 18_000, cash: 4_500, total_debt: 1_000, net_debt: -3_500, shares_diluted: 1_000 }),
    year(2023, { net_income: 2_600, pretax_income: 3_200, income_tax_expense: 600, shareholders_equity: 16_000, cash: 4_000, total_debt: 1_000, net_debt: -3_000, shares_diluted: 1_000 }),
  ],
};
const fin = floorOf(computeValuationFloor(financial));
assert.strictEqual(fin.graham_epv.assessable, false, "financial: graham not assessable (no operating income)");
assert.ok(/operating income is not reported/i.test(fin.graham_epv.not_assessable_reason ?? ""), "financial: graham reason names missing operating income");
assert.ok(fin.buffett_epv.assessable, "financial: buffett lamp assessable");
// avg NI 2800 → eq_high 2800/0.08 = 35_000 (no bridge), per share /1000 = 35
assert.ok(Math.abs(fin.buffett_epv.equity_value_high! - 35_000) < 1, `financial buffett eq_high≈35000 got ${fin.buffett_epv.equity_value_high}`);
assert.ok(Math.abs(fin.buffett_epv.per_share_high! - 35) < 1e-9, `financial buffett ps_high≈35 got ${fin.buffett_epv.per_share_high}`);
assert.strictEqual(fin.asset_floor.assessable, true, "financial: asset floor still emitted");
assert.ok(fin.provenance.earnings_basis_note && /owner[- ]earnings/i.test(fin.provenance.earnings_basis_note), "financial: provenance carries single-lamp basis note");
assert.notStrictEqual(fin.moat_reading.signal, "not_assessable", "financial: moat reads off buffett lamp, not stuck unassessable");

// ── 多股权：有盈利、无任何股数 → per_share_unavailable（不再 undefined）──────────
const multiClass: ValuationFloorInput = {
  ticker: "MULTI",
  years: [
    year(2025, { revenue: 30_000, operating_margin: 0.6, net_income: 18_000, shareholders_equity: 40_000, cash: 10_000, total_debt: 5_000 }),
    year(2024, { revenue: 28_000, operating_margin: 0.6, net_income: 16_000, shareholders_equity: 38_000, cash: 9_000, total_debt: 5_000 }),
    year(2023, { revenue: 25_000, operating_margin: 0.6, net_income: 14_000, shareholders_equity: 35_000, cash: 8_000, total_debt: 5_000 }),
  ],
};
const mc = computeValuationFloor(multiClass);
assert.ok(mc && "kind" in mc && mc.kind === "per_share_unavailable", "multi-class (no shares) → per_share_unavailable");
assert.ok(/multi-share-class/i.test((mc as { reason: string }).reason), "per_share_unavailable carries multi-class reason");

// 真薄数据（<3 盈利年）仍 undefined（回归）
assert.strictEqual(computeValuationFloor({ ticker: "THIN2", years: financial.years.slice(0, 2) }), undefined, "N<3 net-income years → undefined");
```

- [ ] **Step 2: 跑自检，确认失败**

Run: `npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: FAIL — 编译期报 `ValuationFloor` 无 `kind`、`provenance` 无 `earnings_basis_note`、`PerShareUnavailable` 不存在；或运行期金融 fixture 当前返回 `undefined` 致 `floorOf` 抛错。

- [ ] **Step 3: 改类型 `types.ts`**

把 `ValuationFloorProvenance` 增一字段（在 `share_count_basis` 后）：

```ts
export type ValuationFloorProvenance = {
  years_used: number[];
  as_of_fiscal_year?: number;
  discount_rate_band: [number, number];
  normalized_tax_rate: number;
  normalized_tax_rate_basis: string;
  maintenance_capex_rule: string;
  share_count_basis: string;
  /** 单灯档说明：为何只用 owner-earnings 灯。完整两灯档为 undefined。 */
  earnings_basis_note?: string;
};
```

给 `ValuationFloor` 加判别字段（首行）：

```ts
export type ValuationFloor = {
  kind: "floor";
  graham_epv: EpvLamp;
  buffett_epv: EpvLamp;
  asset_floor: AssetFloor;
  moat_reading: MoatReading;
  high_leverage_warning: boolean;
  high_leverage_note?: string;
  net_debt_to_equity?: number;
  provenance: ValuationFloorProvenance;
};

/** 盈利数据齐备但无法取得每股股数（如多股权结构）时返回，供卡片诚实标注。 */
export type PerShareUnavailable = {
  kind: "per_share_unavailable";
  reason: string;
};

export type ValuationFloorResult = ValuationFloor | PerShareUnavailable;
```

- [ ] **Step 4: 改引擎 `epvFloor.ts`**

在文件顶部常量区（`MAINT_CAPEX_RULE` 之后）加两个文案常量：

```ts
const MULTI_CLASS_REASON =
  "This issuer has a multi-share-class structure; a blended per-share count is not available from the current data source, so a per-share floor is not computed here.";

const SINGLE_LAMP_BASIS_NOTE =
  "Operating income is not reported separately (e.g. banks, insurers, and some diversified issuers), so earnings power is shown via the owner-earnings lens only; the unlevered NOPAT lens does not apply.";
```

更新 import（顶部）加入 `PerShareUnavailable`：

```ts
import type { AssetFloor, EpvLamp, MoatReading, PerShareUnavailable, ValuationFloor, ValuationFloorInput, ValuationFloorYear } from "./types";
```

在 `selectYears` 旁新增"盈利年"选择器（紧接 `selectYears` 之后）：

```ts
/** Years carrying a net-income signal (the minimum needed for the owner-earnings lens). */
function selectEarningsYears(years: ValuationFloorYear[]): ValuationFloorYear[] {
  return years
    .filter((y) => y.net_income != null)
    .sort((a, b) => b.fiscal_year - a.fiscal_year)
    .slice(0, TARGET_YEARS);
}
```

新增 Graham"不适用"灯构造（紧接 `buildGrahamLamp` 之后）：

```ts
/** Single-lamp mode: operating income absent, so the unlevered NOPAT lens cannot be applied. */
function grahamNotApplicableLamp(yearsUsed: number[]): EpvLamp {
  return {
    label: "Graham earnings-power value (normalized NOPAT)",
    assessable: false,
    not_assessable_reason: SINGLE_LAMP_BASIS_NOTE,
    method: {
      earnings_basis: "Normalized NOPAT from operating margin — not applicable when operating income is not reported separately.",
      leverage_treatment: "Unlevered (pre-interest, attributable to all capital).",
      denominator: "Capitalized at the 8–10% rate band (read as a WACC proxy).",
      bridge: "Enterprise → equity bridge (+ cash − total debt) — not applied (lens not assessable).",
      discount_rate_low: DISCOUNT_RATE_LOW,
      discount_rate_high: DISCOUNT_RATE_HIGH,
      years_used: yearsUsed,
      simplifications: [],
    },
  };
}
```

把现有 `computeValuationFloor` 整体替换为下面的决策树 + 两个 builder。`buildFullFloor` 的函数体就是**原 computeValuationFloor 第 51 行起的全部逻辑**（latest/shares/equity/.../return），仅把入参由闭包改为参数、return 对象加 `kind: "floor"`；`buildSingleLampFloor` 为新增：

```ts
export function computeValuationFloor(input: ValuationFloorInput): ValuationFloor | PerShareUnavailable | undefined {
  const earningsYears = selectEarningsYears(input.years);
  if (earningsYears.length < MIN_YEARS) return undefined;

  const shares = input.years.map((y) => y.shares_diluted).find((s) => s != null && s > 0);
  if (shares == null) return { kind: "per_share_unavailable", reason: MULTI_CLASS_REASON };

  const marginYears = selectYears(input.years);
  if (marginYears.length >= MIN_YEARS) return buildFullFloor(marginYears, shares);
  return buildSingleLampFloor(earningsYears, shares);
}

function buildFullFloor(years: ValuationFloorYear[], shares: number): ValuationFloor {
  const latest = years[0];
  const cash = latest.cash ?? 0;
  const totalDebt = latest.total_debt ?? 0;
  const equity = latest.shareholders_equity;
  const netDebt = latest.net_debt ?? totalDebt - cash;
  const yearsUsed = years.map((y) => y.fiscal_year);
  const tax = normalizedTaxRate(years);

  const grahamEpv = buildGrahamLamp(years, cash, totalDebt, shares, yearsUsed, tax.rate);
  const buffettEpv = buildBuffettLamp(years, shares, yearsUsed);
  const assetFloor = buildAssetFloor(latest, shares);
  const moatReading = buildMoatReading(grahamEpv, assetFloor);

  const netDebtToEquity = equity != null && equity > 0 ? netDebt / equity : undefined;
  const highLeverage = netDebtToEquity != null && netDebtToEquity > LEVERAGE_WARN_RATIO;

  return {
    kind: "floor",
    graham_epv: grahamEpv,
    buffett_epv: buffettEpv,
    asset_floor: assetFloor,
    moat_reading: moatReading,
    high_leverage_warning: highLeverage,
    high_leverage_note: highLeverage
      ? "High leverage (net debt / shareholders' equity above 1.0): the single 8–10% rate band is a low-leverage / net-cash approximation and is directionally distorted here. The ranges are shown but should be read as degraded."
      : undefined,
    net_debt_to_equity: netDebtToEquity,
    provenance: {
      years_used: yearsUsed,
      as_of_fiscal_year: latest.fiscal_year,
      discount_rate_band: [DISCOUNT_RATE_LOW, DISCOUNT_RATE_HIGH],
      normalized_tax_rate: tax.rate,
      normalized_tax_rate_basis: tax.basis,
      maintenance_capex_rule: MAINT_CAPEX_RULE,
      share_count_basis: "diluted",
    },
  };
}

function buildSingleLampFloor(years: ValuationFloorYear[], shares: number): ValuationFloor {
  const latest = years[0];
  const cash = latest.cash ?? 0;
  const totalDebt = latest.total_debt ?? 0;
  const equity = latest.shareholders_equity;
  const netDebt = latest.net_debt ?? totalDebt - cash;
  const yearsUsed = years.map((y) => y.fiscal_year);
  const tax = normalizedTaxRate(years);

  const grahamEpv = grahamNotApplicableLamp(yearsUsed);
  const buffettEpv = buildBuffettLamp(years, shares, yearsUsed);
  const assetFloor = buildAssetFloor(latest, shares);
  const moatReading = buildMoatReading(buffettEpv, assetFloor);

  const netDebtToEquity = equity != null && equity > 0 ? netDebt / equity : undefined;
  const highLeverage = netDebtToEquity != null && netDebtToEquity > LEVERAGE_WARN_RATIO;

  return {
    kind: "floor",
    graham_epv: grahamEpv,
    buffett_epv: buffettEpv,
    asset_floor: assetFloor,
    moat_reading: moatReading,
    high_leverage_warning: highLeverage,
    high_leverage_note: highLeverage
      ? "High leverage (net debt / shareholders' equity above 1.0): the single 8–10% rate band is a low-leverage / net-cash approximation and is directionally distorted here. The ranges are shown but should be read as degraded."
      : undefined,
    net_debt_to_equity: netDebtToEquity,
    provenance: {
      years_used: yearsUsed,
      as_of_fiscal_year: latest.fiscal_year,
      discount_rate_band: [DISCOUNT_RATE_LOW, DISCOUNT_RATE_HIGH],
      normalized_tax_rate: tax.rate,
      normalized_tax_rate_basis: tax.basis,
      maintenance_capex_rule: MAINT_CAPEX_RULE,
      share_count_basis: "diluted",
      earnings_basis_note: SINGLE_LAMP_BASIS_NOTE,
    },
  };
}
```

- [ ] **Step 5: 跑自检，确认全过**

Run: `npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: PASS — `epvFloor.check.ts: all assertions passed.`

- [ ] **Step 6: tsc**

Run: `rm -rf .next && npx tsc --noEmit`
Expected: 无输出（无类型错误）。

- [ ] **Step 7: Commit**

```bash
git add src/lib/valuation/types.ts src/lib/valuation/epvFloor.ts src/lib/valuation/epvFloor.check.ts
git commit -m "feat(valuation): Buffett single-lamp fallback + per_share_unavailable for no-share-count issuers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 卡片适配联合类型（单灯文案 + 不可评估标注）

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`

- [ ] **Step 1: 改组件签名与分支**

更新 import（第 3 行）引入 `PerShareUnavailable`：

```ts
import type { EpvLamp, MoatSignal, PerShareUnavailable, ValuationFloor } from "@/lib/valuation";
```

把 `export function EarningsPowerFloorCard({ floor }: { floor: ValuationFloor | undefined })` 的签名与开头替换为：

```tsx
export function EarningsPowerFloorCard({ floor }: { floor: ValuationFloor | PerShareUnavailable | undefined }) {
  if (!floor) return null;
  if (floor.kind === "per_share_unavailable") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-4 text-[var(--tt-accent)]" />
            Earnings Power &amp; Asset Floor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--tt-muted)]">{floor.reason}</p>
        </CardContent>
      </Card>
    );
  }
  const { graham_epv, buffett_epv, asset_floor, moat_reading, provenance } = floor;
```

（其余 `return (<Card>…)` 主体保持不变。）

- [ ] **Step 2: 交叉验证导读仅在两灯都可评估时显示**

把现有这段：

```tsx
        <p className="text-xs text-[var(--tt-muted)]">
          Two independent zero-growth lenses — together they bracket a conservative earnings-power range.
        </p>
```

替换为（单灯时换成单灯说明）：

```tsx
        {graham_epv.assessable && buffett_epv.assessable ? (
          <p className="text-xs text-[var(--tt-muted)]">
            Two independent zero-growth lenses — together they bracket a conservative earnings-power range.
          </p>
        ) : provenance.earnings_basis_note ? (
          <p className="text-xs text-[var(--tt-muted)]">{provenance.earnings_basis_note}</p>
        ) : null}
```

- [ ] **Step 3: tsc**

Run: `rm -rf .next && npx tsc --noEmit`
Expected: 无输出。

- [ ] **Step 4: Commit**

```bash
git add src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(valuation): card renders single-lamp note + per-share-unavailable state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 个股页守卫适配联合类型

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`

- [ ] **Step 1: 确认守卫无需逻辑改动，仅核对类型流通**

`page.tsx` 现有：

```tsx
  const valuationFloor = computeValuationFloor(
    fundamentalsToFloorInput(ticker, issuer, sec.annual),
  );
```

`valuationFloor` 类型现为 `ValuationFloor | PerShareUnavailable | undefined`。下方 `{valuationFloor && (<section>…<EarningsPowerFloorCard floor={valuationFloor} />…</section>)}` 守卫对两种非 undefined 形态都为真，卡片自行分支渲染。**无需改逻辑**；本步仅靠 tsc 确认联合类型贯通无误。

- [ ] **Step 2: tsc + 确认无其他调用方破裂**

Run: `grep -rn "computeValuationFloor" src/ | grep -v "/valuation/"`
Expected: 仅 `src/app/[lang]/stocks/[ticker]/page.tsx` 一处（确认无别的消费方需适配）。

Run: `rm -rf .next && npx tsc --noEmit`
Expected: 无输出。

- [ ] **Step 3: 若 tsc 报错则修，否则跳过提交（无改动）**

若 Step 2 的 grep 显示存在其他调用方且 tsc 报错，按报错处用 `floor.kind === "floor"` 收窄后再用 `.graham_epv` 等字段；改完重跑 tsc。无改动则本任务不产生提交。

---

### Task 4: shares_diluted tag 兜底（稳健化，须重跑 ingest 方见效）

**Files:**
- Modify: `web/src/lib/sec/fundamental-tags.ts`

- [ ] **Step 1: 扩 shares_diluted 回退链**

把（约第 53 行）：

```ts
  shares_diluted: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
```

改为：

```ts
  shares_diluted: [
    "WeightedAverageNumberOfDilutedSharesOutstanding",
    "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
    "WeightedAverageNumberOfSharesOutstandingBasic",
  ],
```

- [ ] **Step 2: tsc**

Run: `rm -rf .next && npx tsc --noEmit`
Expected: 无输出。

- [ ] **Step 3: Commit**

```bash
git add src/lib/sec/fundamental-tags.ts
git commit -m "feat(sec): shares_diluted falls back to basic-and-diluted / basic weighted-average tags

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 真账抽验（生产库 + 引擎）+ 收尾验证

确认决策树对真实数据如预期分流，无回归。需 Supabase service key（见 `web/.env.local` / 根 `.env.local`）。

**Files:**
- 无源码改动（一次性脚本写在 `/tmp`，不入库）。

- [ ] **Step 1: 写一次性抽验脚本**

创建 `web/verify-floor.mts`（放在 `web/` 内，故相对路径都以 `web/` 为基准；`.mts` 让 tsx 按 ESM+TS 解析）：

```ts
import { readFileSync } from "node:fs";
import { computeValuationFloor } from "./src/lib/valuation/epvFloor";
import { fundamentalsToFloorInput } from "./src/lib/valuation/fundamentalsToFloorInput";
function loadEnv(p: string){ try { for (const line of readFileSync(p,"utf8").split("\n")){ const m=line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if(m){ const v=m[2].trim().replace(/^["']|["']$/g,""); if(!process.env[m[1]]) process.env[m[1]]=v; } } } catch {} }
loadEnv(".env.local"); loadEnv("../.env.local");
const url=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");
const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||"";
const H={apikey:key,Authorization:`Bearer ${key}`};
async function rows(tk: string){ const r=await fetch(`${url}/rest/v1/company_fundamentals_periods?ticker=eq.${encodeURIComponent(tk)}&select=*&order=period_end.desc`,{headers:H}); return r.ok? await r.json() as any[] : []; }
for (const tk of ["JPM","BAC","WFC","AXP","BNY","COF","SCHW","PGR","JNJ","V","BRK.B","AAPL","MSFT"]) {
  const annual=(await rows(tk)).filter((x)=>x.fiscal_period==="FY");
  const res=computeValuationFloor(fundamentalsToFloorInput(tk, null, annual));
  const k=res?res.kind:"undefined";
  let detail="";
  if(res&&res.kind==="floor") detail=`graham=${res.graham_epv.assessable} buffett=${res.buffett_epv.assessable} bps=${res.buffett_epv.per_share_high?.toFixed(2)}`;
  if(res&&res.kind==="per_share_unavailable") detail=res.reason.slice(0,40);
  console.log(`${tk}\t${k}\t${detail}`);
}
```

- [ ] **Step 2: 运行并核对分流**

Run: `cd web && npx tsx verify-floor.mts`

Expected:
- `JPM BAC WFC AXP BNY COF SCHW PGR JNJ` → `floor`，`graham=false buffett=true`，`bps` 为正数。
- `V` `BRK.B` → `per_share_unavailable`。
- `AAPL` `MSFT` → `floor`，`graham=true buffett=true`（回归：两灯仍在）。

若任何金融票仍非 `floor` 或 AAPL/MSFT 退化为单灯，停下排查（systematic-debugging）。

- [ ] **Step 3: 全量自检 + tsc + build**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts && npx tsx src/lib/valuation/fundamentalsToFloorInput.check.ts`
Expected: `all assertions passed.` 与 `OK`。

Run: `cd web && rm -rf .next && npx tsc --noEmit && npm run build`
Expected: tsc 无输出；build 成功。

- [ ] **Step 4: 清理临时脚本**

Run: `rm -f web/verify-floor.mts`（务必删除，避免误入 build/提交）

- [ ] **Step 5: 无源码改动则不提交**

本任务仅验证；如 Step 2 触发了 debug 改动，按改动文件单独提交。

---

## 验证清单（全部完成后）

- [ ] `epvFloor.check.ts` 全断言通过（含新单灯 / per_share_unavailable，且既有断言全绿 = 无回归）
- [ ] `fundamentalsToFloorInput.check.ts` OK
- [ ] `tsc --noEmit` 无输出、`npm run build` 成功
- [ ] 真账抽验：8 家金融 + JNJ → 单灯 floor；V/BRK → per_share_unavailable；AAPL/MSFT → 两灯 floor（无回归）
- [ ] 合规复核：新文案零禁词（undervalued/cheap/fair value/target price/margin of safety），不碰价格、不动 dataQualityGate

## 交付与重跑 ingest 说明

- Task 1–3 为 **read 层**，合并部署后金融股估值卡**即时生效**（读现有入库行）。
- Task 4（shares tag 兜底）须**重跑 `ingestAllCompanies`** 回填后方见效；非本轮硬目标，对 V/BRK 也无效（分维度上报问题，留作后续 spec）。
- 后续独立 sub-spec：多股权分维度股数提取、外币（ASML/EUR）支持、维护 capex 精算（v2）、价格对比（sub-PRD 4）。
