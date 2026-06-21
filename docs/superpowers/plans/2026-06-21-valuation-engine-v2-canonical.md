# 估值引擎 v2·对齐原典 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire already-ingested SEC rich fields (`d_and_a/capex/rd_expense/working_capital/ppe_net/…`) into the deterministic valuation engine to turn the v1 "zero-growth net-income EPV wearing Greenwald/Buffett names" into a faithful Greenwald three-layer (reproduction-value AV + maintenance-capex-corrected EPV + real Greenwald GV) plus a real Buffett Owner-Earnings floor lamp.

**Architecture:** Pure-function engine layer only (no presentation). Three new pure-function modules (`maintenanceCapex.ts`, `reproductionValue.ts`, `growthValue.ts`), each with a `.check.ts` self-test runnable via `npx tsx`. `types.ts` / `fundamentalsToFloorInput.ts` / `epvFloor.ts` are extended to consume the new fields and assemble the richer `ValuationFloor`. Every field walks an `assessable`/degraded branch — any missing field degrades only its own layer; the page never crashes.

**Tech Stack:** TypeScript, customized Next.js App Router (RSC, zero-runtime-LLM). No test framework — verification via per-module `.check.ts` (`npx tsx`) + `npx tsc --noEmit` + `npm run build` (in a worktree with real `node_modules` from `npm ci`).

## Global Constraints

Copy verbatim into every task's working context:

- **Spec is the law.** `docs/superpowers/specs/2026-06-21-valuation-engine-v2-canonical-design.md` §1 is the audited formula canon; §1.7 lists the 6 audit corrections. **Do not change the formulas.**
- **EPV uses "写法 A":** maintenance capex is subtracted in full cash from after-tax NOPAT, **NOT** multiplied by (1−tax). No double deduction (D&A is already inside EBIT). When `maintCapex == D&A`, this collapses to `NOPAT/WACC` (v1 parity).
- **Zero-growth floor Owner Earnings = net income + D&A − maintenance capex, WITHOUT ΔNWC** (maintenance ΔNWC ≈ 0). ΔNWC enters GV only.
- **SBC stays inside net income** — not added back, not re-deducted; disclose `sbc_to_oe_pct` separately.
- **AV = tangible net assets + capitalized R&D (N=5 straight-line).** Brand / net-M&A / D&A half-tax-shield / per-company WACC are all v3 — do NOT build them.
- **Moat = EPV vs AV (reproduction value)**, not vs book. GV only opens for `franchise`; otherwise GV = 0. `ROIIC ≤ WACC → GV = 0`.
- **ROIIC = N-year NOPAT increment / Σ growth reinvestment** (cumulative denominator), 5y window, endpoint-aligned (exclude the last 1–2 years' not-yet-matured investment).
- **Maintenance capex = median of available methods; divergence > 50% → degraded.** AI-hog rule: `capex_t / capex_{t−2} ≥ 2` → maintenance-capex floor = `capex_t × 0.5` + warning. Never use full capex as maintenance.
- **Compliance floor:** no BUY/SELL/target/rating. Output = conservative intrinsic-value range + moat direction + provenance. Every conclusion carries source (SEC XBRL-derived) + as-of + fiscal years used + degradation/simplification notes.
- **Do NOT touch:** ingest (data already stored), `/research` (island), the price layer, Finnhub.
- **Worktree build needs real packages:** `cd web && npm ci` already run. Never symlink `node_modules` (Turbopack crashes).
- **This is a customized Next.js** — read `web/node_modules/next/dist/docs/` before editing any Next.js code (`web/AGENTS.md`). (Only Task 9 touches a Next-adjacent file, and only its types.)

**Conventions observed from the existing engine (match these):**
- Money values are absolute USD (engine is currency-agnostic on inputs; per-share assumed USD downstream).
- `years` arrays are **most-recent-first**.
- Result objects use the `{ assessable: boolean; not_assessable_reason?: string; … }` pattern.
- `.check.ts` files use `node:assert`, end with `console.log("<name>.check.ts: OK")`, run via `cd web && npx tsx src/lib/valuation/<name>.check.ts`.
- Named constants are `export const UPPER_SNAKE`.

---

## File Structure

**New:**
- `web/src/lib/valuation/maintenanceCapex.ts` (+ `.check.ts`) — §1.1 four-method median + AI-hog rule. The v2 keystone; consumed by EPV, OE, and GV.
- `web/src/lib/valuation/reproductionValue.ts` (+ `.check.ts`) — §1.4 AV = tangible net assets + capitalized R&D.
- `web/src/lib/valuation/growthValue.ts` (+ `.check.ts`) — §1.6 Greenwald GV (franchise-gated, cumulative ROIIC, three scenarios).
- `web/src/lib/valuation/degradation.check.ts` — §3 degradation matrix integration check.

**Modify:**
- `web/src/lib/valuation/types.ts` — extend `ValuationFloorYear` with new fields; add `MaintCapex` / `ReproductionValue` / `GrowthValue` / `GrowthScenarioSet` types; extend `EpvLamp` (`sbc_to_oe_pct?`), `MoatReading` (`franchise_value?`), `ValuationFloor` (`growth_value`); rename `AssetFloor` → `ReproductionValue` (superset; field name `asset_floor` kept).
- `web/src/lib/valuation/fundamentalsToFloorInput.ts` (+ `.check.ts`) — map the new fields.
- `web/src/lib/valuation/epvFloor.ts` (+ `.check.ts`) — EPV 写法 A + maintenance capex; real Owner Earnings (no ΔNWC, SBC disclosure); moat EPV vs AV; wire reproduction value + GV.
- `web/src/lib/sec/read.ts` — confirm `select("*")` annual rows carry the new columns (likely no code change; types already flow as `any`).
- `web/src/lib/valuation/index.ts` — re-export the three new modules.

**Do NOT touch:** ingest, `/research`, price layer, Finnhub, `EarningsPowerFloorCard.tsx` (presentation spec).

---

## Task 0: Data fill-rate pre-validation (HARD GATE — credentials required)

This is the spec §0.5 pre-flight and satisfies the global data-accuracy rule. The columns exist in the table but are **not guaranteed populated** across the 13F universe (`normalize-facts.ts` intentionally does not gate quality on them). We measure real fill rates to confirm each degradation branch is actually exercised by live data, and to pick QA tickers for Task 10.

**Files:**
- Create: `web/scripts/valuation-fillrate.ts` (throwaway diagnostic script; kept in repo as provenance)
- Reference: `web/src/lib/managers/db.ts` (Supabase client via `getDb()`), main checkout `web/.env.local`

**Interfaces:**
- Consumes: `getDb()` from `@/lib/managers/db`; table `company_fundamentals_periods` (FY rows).
- Produces: a printed fill-rate table → recorded into `docs/superpowers/plans/2026-06-21-valuation-engine-v2-canonical.md` (this file, "Task 0 findings" appendix) and used to choose Task 10 QA tickers.

- [ ] **Step 1: Copy live credentials into the worktree**

```bash
cp /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web/.env.local web/.env.local
test -f web/.env.local && echo "env present"
```
Expected: `env present`. (If the main checkout has no `.env.local`, STOP and ask the user for Supabase credentials — do not fabricate fill-rate numbers.)

- [ ] **Step 2: Write the fill-rate diagnostic**

Create `web/scripts/valuation-fillrate.ts`:

```ts
/**
 * valuation-fillrate.ts — measure non-null fill rate of valuation-critical
 * columns across FY rows in company_fundamentals_periods. Determines which
 * degradation branches live data actually exercises (spec §0.5).
 * Run: cd web && npx tsx --env-file=.env.local scripts/valuation-fillrate.ts
 */
import { getDb } from "@/lib/managers/db";

const FIELDS = [
  "d_and_a", "capex", "rd_expense", "working_capital", "ppe_net",
  "operating_cash_flow", "stock_based_comp", "current_assets",
  "current_liabilities", "share_repurchases", "operating_income",
] as const;

async function main() {
  const db = getDb();
  const { data, error } = await db
    .from("company_fundamentals_periods")
    .select("ticker," + FIELDS.join(","))
    .eq("fiscal_period", "FY");
  if (error) throw error;
  const rows = data ?? [];
  const tickers = new Set(rows.map((r: any) => r.ticker));
  console.log(`FY rows: ${rows.length}  |  distinct tickers: ${tickers.size}\n`);
  console.log("field".padEnd(22), "non-null %", " populated/total");
  for (const f of FIELDS) {
    const filled = rows.filter((r: any) => r[f] != null).length;
    const pct = rows.length ? ((filled / rows.length) * 100).toFixed(1) : "0.0";
    console.log(f.padEnd(22), pct.padStart(8), `   ${filled}/${rows.length}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run it against live Supabase**

Run: `cd web && npx tsx --env-file=.env.local scripts/valuation-fillrate.ts`
Expected: a printed table of per-field non-null %. (If a connection error: confirm `.env.local` keys; do not proceed on guessed numbers.)

- [ ] **Step 4: Record findings + pick QA tickers**

Append the printed table to this plan under a new "## Task 0 findings" section (date-stamped). Note which fields are sparse (these MUST have working degradation branches). From the data pick three Task-10 QA tickers: (a) an AI-hog with capex>D&A (AAPL/GOOG/META candidates), (b) a no-R&D / no-moat name, (c) a thin name missing `working_capital` or `capex`. Record the picks.

- [ ] **Step 5: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/valuation-engine-v2-impl
git add web/scripts/valuation-fillrate.ts docs/superpowers/plans/2026-06-21-valuation-engine-v2-canonical.md
git commit -m "chore(valuation): data fill-rate pre-validation for engine v2 degradation branches"
```

> ⚠️ `web/.env.local` must NOT be committed — confirm it is git-ignored (`git status` should not list it). The existing repo already ignores `.env.local`.

---

## Task 1: Extend types + input mapping for the new SEC fields

Pure data plumbing: add the new fields to `ValuationFloorYear`, map them in `fundamentalsToFloorInput`, and define all new result types up front so later tasks reference stable names. All additions are optional, so existing code keeps compiling and the existing checks stay green.

**Files:**
- Modify: `web/src/lib/valuation/types.ts`
- Modify: `web/src/lib/valuation/fundamentalsToFloorInput.ts`
- Test: `web/src/lib/valuation/fundamentalsToFloorInput.check.ts`

**Interfaces:**
- Consumes: `FundamentalPeriod` from `@/lib/sec/normalize-facts` (already has `d_and_a/capex/rd_expense/working_capital/ppe_net/operating_cash_flow/stock_based_comp/share_repurchases/current_assets/current_liabilities`).
- Produces (referenced by all later tasks):
  - `ValuationFloorYear` extended with: `d_and_a?, capex?, rd_expense?, sga_expense?, stock_based_comp?, working_capital?, ppe_net?, operating_cash_flow?, share_repurchases?, current_assets?, current_liabilities?` (all `number | undefined`).
  - `MaintCapex` (result of `maintenanceCapex`), `ReproductionValue` (result of `buildReproductionValue`, supersedes `AssetFloor`), `GrowthScenarioSet`, `GrowthValue`.
  - `EpvLamp.sbc_to_oe_pct?: number`; `MoatReading.franchise_value?: number`; `ValuationFloor.growth_value: GrowthValue`.

- [ ] **Step 1: Add the failing mapping assertions**

In `web/src/lib/valuation/fundamentalsToFloorInput.check.ts`, extend the 2025 FY row literal (currently `fy(2025,"2025-12-31","FY",{…})`) to also set the new fields and assert they map. Add after the existing `input.years[0].cash` assertion (line ~38):

```ts
// New v2 rich fields map through (spec §0.5 / Task 1).
assert.strictEqual(input.years[0].d_and_a, 1_200, "d_and_a maps");
assert.strictEqual(input.years[0].capex, 900, "capex maps");
assert.strictEqual(input.years[0].rd_expense, 700, "rd_expense maps");
assert.strictEqual(input.years[0].working_capital, 1_500, "working_capital maps");
assert.strictEqual(input.years[0].ppe_net, 4_000, "ppe_net maps");
assert.strictEqual(input.years[0].operating_cash_flow, 3_500, "operating_cash_flow maps");
assert.strictEqual(input.years[0].stock_based_comp, 300, "stock_based_comp maps");
```

And add these keys to the 2025 FY object literal (line ~31), inside its `{…}`:

```ts
d_and_a: 1_200, capex: 900, rd_expense: 700, working_capital: 1_500, ppe_net: 4_000, operating_cash_flow: 3_500, stock_based_comp: 300,
```

- [ ] **Step 2: Run the check to verify it fails**

Run: `cd web && npx tsx src/lib/valuation/fundamentalsToFloorInput.check.ts`
Expected: FAIL — `d_and_a maps` assertion (mapper does not yet copy the field; value is `undefined`).

- [ ] **Step 3: Extend `ValuationFloorYear` and the new result types in `types.ts`**

In `web/src/lib/valuation/types.ts`, replace the `ValuationFloorYear` type (lines ~116-132) with the extended version:

```ts
export type ValuationFloorYear = {
  fiscal_year: number;
  revenue?: number;
  operating_income?: number;
  operating_margin?: number;
  net_income?: number;
  pretax_income?: number;
  income_tax_expense?: number;
  effective_tax_rate?: number;
  shareholders_equity?: number;
  goodwill?: number;
  intangibles?: number;
  cash?: number;
  total_debt?: number;
  net_debt?: number;
  shares_diluted?: number;
  // v2 rich fields (spec §1) — all optional; absence degrades only the dependent layer.
  d_and_a?: number;
  capex?: number;
  rd_expense?: number;
  sga_expense?: number;
  stock_based_comp?: number;
  working_capital?: number;
  ppe_net?: number;
  operating_cash_flow?: number;
  share_repurchases?: number;
  current_assets?: number;
  current_liabilities?: number;
};
```

Add `sbc_to_oe_pct?: number;` to the `EpvLamp` type (after `per_share_high?`):

```ts
  /** Buffett lamp only: average SBC / owner earnings — real dilution cost, disclosed not added back (spec §1.3). */
  sbc_to_oe_pct?: number;
```

Rename `AssetFloor` → `ReproductionValue` and extend it (replace the `AssetFloor` type block, lines ~29-36):

```ts
/** Greenwald reproduction value (spec §1.4): tangible net assets + capitalized R&D.
 *  Field name `asset_floor` on ValuationFloor is kept for backward-compat; this is a superset of the old AssetFloor. */
export type ReproductionValue = {
  assessable: boolean;
  not_assessable_reason?: string;
  basis: string;
  intangibles_separated: boolean;
  total_value?: number;            // AV = tangible net assets + capitalized R&D
  per_share?: number;
  tangible_net_assets?: number;
  capitalized_rd?: number;         // undefined when rd_expense fully absent (degraded to tangible book)
  rd_years_used?: number[];
};
/** @deprecated use ReproductionValue */
export type AssetFloor = ReproductionValue;
```

Add `franchise_value?: number;` to `MoatReading` (after `asset_per_share_compared?`):

```ts
  /** EPV − AV (×shares) when franchise; the dollar moat premium over reproduction value. */
  franchise_value?: number;
```

Add the maintenance-capex and growth-value types at the end of the input-contract section (after `ValuationFloorInput`):

```ts
// ── Maintenance capex (spec §1.1) ────────────────────────────────────────────
export type MaintCapex = {
  assessable: boolean;
  not_assessable_reason?: string;
  /** Chosen maintenance capex: median of available methods, raised to the AI-hog floor when triggered. */
  value?: number;
  methods: { da_proxy?: number; greenwald_sales?: number; ppe_life?: number };
  confidence: "ok" | "degraded";
  /** (max − min)/median across methods; present when ≥2 methods available. */
  divergence_pct?: number;
  ai_capex_distortion_warning: boolean;
  notes: string[];
};

// ── Growth value (spec §1.6) ─────────────────────────────────────────────────
export type GrowthScenarioSet = { pessimistic: number; neutral: number; optimistic: number };

export type GrowthValue = {
  assessable: boolean;
  not_assessable_reason?: string;
  /** true when GV was forced to 0 by the franchise gate or ROIIC ≤ WACC (a real reading, not missing data). */
  gated_to_zero: boolean;
  roiic?: number;
  wacc_band: [number, number];
  annual_growth_reinvestment?: number;
  duration_years?: number;
  /** Enterprise-level GV per scenario (USD). */
  scenarios: GrowthScenarioSet;
  /** Per-diluted-share GV per scenario. */
  per_share: GrowthScenarioSet;
  notes: string[];
};
```

Finally update `ValuationFloor`: change `asset_floor: AssetFloor;` → `asset_floor: ReproductionValue;` and add `growth_value: GrowthValue;` (after `moat_reading`):

```ts
  asset_floor: ReproductionValue;
  moat_reading: MoatReading;
  growth_value: GrowthValue;
```

- [ ] **Step 4: Map the new fields in `fundamentalsToFloorInput.ts`**

In `web/src/lib/valuation/fundamentalsToFloorInput.ts`, inside the `.map((r) => ({…}))` object (after `shares_diluted: u(r.shares_diluted),`), add:

```ts
      d_and_a: u(r.d_and_a),
      capex: u(r.capex),
      rd_expense: u(r.rd_expense),
      sga_expense: u(r.sga_expense),
      stock_based_comp: u(r.stock_based_comp),
      working_capital: u(r.working_capital),
      ppe_net: u(r.ppe_net),
      operating_cash_flow: u(r.operating_cash_flow),
      share_repurchases: u(r.share_repurchases),
      current_assets: u(r.current_assets),
      current_liabilities: u(r.current_liabilities),
```

- [ ] **Step 5: Run the check to verify it passes**

Run: `cd web && npx tsx src/lib/valuation/fundamentalsToFloorInput.check.ts`
Expected: PASS — `fundamentalsToFloorInput.check.ts: OK`

> Note: at this point `epvFloor.ts` still compiles because `growth_value` is a NEW required field on `ValuationFloor` but `assembleFloor` does not yet set it — **this will fail `tsc`**. To keep this task green in isolation, also add a placeholder in `assembleFloor` (it is fully replaced in Task 8). In `epvFloor.ts`, inside the returned object of `assembleFloor`, add after `moat_reading: moatReading,`:

```ts
    growth_value: { assessable: false, gated_to_zero: false, wacc_band: [DISCOUNT_RATE_LOW, DISCOUNT_RATE_HIGH], scenarios: { pessimistic: 0, neutral: 0, optimistic: 0 }, per_share: { pessimistic: 0, neutral: 0, optimistic: 0 }, notes: ["Growth value not yet wired (engine v2 in progress)."] },
```

- [ ] **Step 6: Verify the whole engine still type-checks and existing checks pass**

Run: `cd web && npx tsc --noEmit && npx tsx src/lib/valuation/epvFloor.check.ts && npx tsx src/lib/valuation/strikeZone.check.ts`
Expected: no tsc errors; both checks print `… OK`.

- [ ] **Step 7: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/valuation-engine-v2-impl
git add web/src/lib/valuation/types.ts web/src/lib/valuation/fundamentalsToFloorInput.ts web/src/lib/valuation/fundamentalsToFloorInput.check.ts web/src/lib/valuation/epvFloor.ts
git commit -m "feat(valuation): extend input contract + types for engine v2 rich fields"
```

---

## Task 2: `maintenanceCapex.ts` — four-method median + AI-hog rule (keystone)

Spec §1.1. The cornerstone consumed by EPV, OE, and GV. Pure function over `ValuationFloorYear[]` (most-recent-first).

**Files:**
- Create: `web/src/lib/valuation/maintenanceCapex.ts`
- Test: `web/src/lib/valuation/maintenanceCapex.check.ts`

**Interfaces:**
- Consumes: `ValuationFloorYear[]` (most-recent-first), `MaintCapex` type from `./types`.
- Produces: `export function maintenanceCapex(years: ValuationFloorYear[]): MaintCapex`; `export const PPE_USEFUL_LIFE_YEARS = 10`; `export const MAINT_DIVERGENCE_DEGRADE = 0.5`; `export const AI_CAPEX_DOUBLING_RATIO = 2`; `export const AI_CAPEX_MAINT_FLOOR_FRACTION = 0.5`; `export const MAINT_CAPEX_WINDOW = 5`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/valuation/maintenanceCapex.check.ts`:

```ts
/**
 * maintenanceCapex.check.ts — spec §1.1 four-method median + AI-hog rule.
 * Run: cd web && npx tsx src/lib/valuation/maintenanceCapex.check.ts
 */
import assert from "node:assert";
import { maintenanceCapex } from "./maintenanceCapex";
import type { ValuationFloorYear } from "./types";

const approx = (a: number, b: number, tol = 1e-6, msg = "") =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} (got ${a}, want ${b})`);

// Steady-state company: capex≈D&A, flat-ish revenue. All three methods ~agree.
const steady: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 10_000, capex: 1_000, d_and_a: 1_000, ppe_net: 10_000 },
  { fiscal_year: 2024, revenue: 9_800, capex: 980, d_and_a: 980, ppe_net: 9_900 },
  { fiscal_year: 2023, revenue: 9_700, capex: 970, d_and_a: 970, ppe_net: 9_800 },
  { fiscal_year: 2022, revenue: 9_600, capex: 960, d_and_a: 960, ppe_net: 9_700 },
  { fiscal_year: 2021, revenue: 9_500, capex: 950, d_and_a: 950, ppe_net: 9_600 },
];
const s = maintenanceCapex(steady);
assert.ok(s.assessable, "steady is assessable");
// D&A proxy = 1000; PP&E/life = 10000/10 = 1000; sales method = 1000 - median(ppe/rev)×ΔRev.
// median(ppe/rev) ≈ 1.0, ΔRev = 200 → growth capex ≈ 200 → sales maint ≈ 800. Median of {1000,800,1000} = 1000.
approx(s.methods.da_proxy!, 1_000, 1e-6, "D&A proxy");
approx(s.methods.ppe_life!, 1_000, 1e-6, "PP&E/life");
approx(s.value!, 1_000, 1e-6, "median maintenance capex");
assert.strictEqual(s.ai_capex_distortion_warning, false, "no AI distortion in steady state");

// Sales method = total capex − growth capex (NOT median(ppe/sales)×ΔSales itself). Audit fix #1.
// Construct: ppe/rev = 1.0 everywhere, ΔRev = 500, capex = 1500 → growth capex 500 → sales maint 1000.
const salesCase: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 10_500, capex: 1_500, d_and_a: 900, ppe_net: 10_500 },
  { fiscal_year: 2024, revenue: 10_000, capex: 1_400, d_and_a: 900, ppe_net: 10_000 },
  { fiscal_year: 2023, revenue: 9_500, capex: 1_300, d_and_a: 900, ppe_net: 9_500 },
];
const sc = maintenanceCapex(salesCase);
approx(sc.methods.greenwald_sales!, 1_000, 1e-6, "sales method = capex − growth capex");

// AI-hog: capex_t / capex_{t-2} ≥ 2 → maintenance floor = capex_t × 0.5 + warning.
const aiHog: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 20_000, capex: 8_000, d_and_a: 2_000, ppe_net: 18_000 },
  { fiscal_year: 2024, revenue: 18_000, capex: 5_000, d_and_a: 1_900, ppe_net: 12_000 },
  { fiscal_year: 2023, revenue: 16_000, capex: 3_500, d_and_a: 1_800, ppe_net: 8_000 },
];
const ai = maintenanceCapex(aiHog);
assert.strictEqual(ai.ai_capex_distortion_warning, true, "AI distortion fires (8000/3500 ≥ 2)");
assert.ok(ai.value! >= 8_000 * 0.5, "maintenance capex raised to AI floor = capex_t × 0.5");

// Divergence > 50% → degraded confidence.
const divergent: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 10_000, capex: 3_000, d_and_a: 500, ppe_net: 20_000 },
  { fiscal_year: 2024, revenue: 8_000, capex: 1_000, d_and_a: 500, ppe_net: 15_000 },
  { fiscal_year: 2023, revenue: 7_000, capex: 1_000, d_and_a: 500, ppe_net: 12_000 },
];
const dv = maintenanceCapex(divergent);
assert.strictEqual(dv.confidence, "degraded", "wide method divergence → degraded");

// Degradation: no capex anywhere → not assessable, no crash.
const noCapex: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 10_000, d_and_a: 1_000, ppe_net: 10_000 },
  { fiscal_year: 2024, revenue: 9_000, d_and_a: 900, ppe_net: 9_000 },
];
const nc = maintenanceCapex(noCapex);
assert.strictEqual(nc.assessable, false, "no capex → not assessable");
assert.ok(nc.not_assessable_reason && nc.not_assessable_reason.length > 0, "degradation carries a reason");

// Only D&A available (no ppe, no revenue series) → value = D&A proxy, ok-ish single method.
const onlyDa: ValuationFloorYear[] = [
  { fiscal_year: 2025, capex: 1_000, d_and_a: 1_100 },
  { fiscal_year: 2024, capex: 900, d_and_a: 1_000 },
];
const od = maintenanceCapex(onlyDa);
assert.ok(od.assessable, "single-method (D&A proxy) still assessable");
approx(od.value!, 1_100, 1e-6, "single method → D&A proxy value");

console.log("maintenanceCapex.check.ts: OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx tsx src/lib/valuation/maintenanceCapex.check.ts`
Expected: FAIL — `Cannot find module './maintenanceCapex'`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/valuation/maintenanceCapex.ts`:

```ts
import type { MaintCapex, ValuationFloorYear } from "./types";

/** Neutral useful life for the PP&E/life method (Greenwald band 7–15y; sensitivity-ready). */
export const PPE_USEFUL_LIFE_YEARS = 10;
/** Method divergence above this fraction of the median → confidence "degraded". */
export const MAINT_DIVERGENCE_DEGRADE = 0.5;
/** AI-hog: capex_t / capex_{t-2} at or above this ratio triggers the distortion rule. */
export const AI_CAPEX_DOUBLING_RATIO = 2;
/** AI-hog: maintenance capex floored at this fraction of current capex. */
export const AI_CAPEX_MAINT_FLOOR_FRACTION = 0.5;
/** Window for the median(PP&E/Sales) ratio used by the sales method. */
export const MAINT_CAPEX_WINDOW = 5;

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Maintenance capex — spec §1.1. Median of available methods, AI-hog floor applied.
 * `years` most-recent-first. Never returns full capex as maintenance (reverse-trap guard).
 */
export function maintenanceCapex(years: ValuationFloorYear[]): MaintCapex {
  const notes: string[] = [];
  const sorted = [...years].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const latest = sorted[0];
  const capexT = latest?.capex;

  if (capexT == null) {
    return {
      assessable: false,
      not_assessable_reason: "Current-year capex is unavailable, so maintenance capex cannot be estimated.",
      methods: {}, confidence: "degraded", ai_capex_distortion_warning: false,
      notes: ["No capex on the latest year."],
    };
  }

  // Method 1 — D&A proxy (current period).
  const daProxy = latest.d_and_a != null ? latest.d_and_a : undefined;

  // Method 2 — Greenwald sales method: maintenance = total capex − growth capex,
  // growth capex = median₅(PP&E/Revenue) × ΔRevenue. (Audit fix #1: the median×ΔSales
  // term is GROWTH capex; maintenance is capex minus it.)
  let salesMethod: number | undefined;
  const ratios: number[] = [];
  for (const y of sorted.slice(0, MAINT_CAPEX_WINDOW)) {
    if (y.ppe_net != null && y.revenue != null && y.revenue !== 0) ratios.push(y.ppe_net / y.revenue);
  }
  const prior = sorted[1];
  if (ratios.length >= 1 && latest.revenue != null && prior?.revenue != null) {
    const deltaRev = latest.revenue - prior.revenue;
    const growthCapex = median(ratios) * deltaRev;
    salesMethod = capexT - growthCapex; // maintenance = total − growth
  }

  // Method 3 — PP&E / useful life.
  const ppeLife = latest.ppe_net != null ? latest.ppe_net / PPE_USEFUL_LIFE_YEARS : undefined;

  const methods = { da_proxy: daProxy, greenwald_sales: salesMethod, ppe_life: ppeLife };
  const present = [daProxy, salesMethod, ppeLife].filter((v): v is number => v != null && Number.isFinite(v) && v > 0);

  if (present.length === 0) {
    return {
      assessable: false,
      not_assessable_reason: "No maintenance-capex method could be computed (need D&A, or PP&E, or a revenue series).",
      methods, confidence: "degraded", ai_capex_distortion_warning: false,
      notes: ["Capex present but no usable method inputs (D&A / PP&E / revenue)."],
    };
  }

  let value = median(present);

  // Method divergence.
  let divergencePct: number | undefined;
  let confidence: "ok" | "degraded" = "ok";
  if (present.length >= 2) {
    const lo = Math.min(...present);
    const hi = Math.max(...present);
    const med = median(present);
    divergencePct = med > 0 ? (hi - lo) / med : undefined;
    if (divergencePct != null && divergencePct > MAINT_DIVERGENCE_DEGRADE) {
      confidence = "degraded";
      notes.push(`Maintenance-capex methods diverge by ${(divergencePct * 100).toFixed(0)}% (> 50%); estimate is degraded.`);
    }
  } else {
    confidence = "degraded";
    notes.push("Only one maintenance-capex method available; estimate is degraded.");
  }

  // AI-hog rule: capex doubling over two years → floor maintenance at 50% of current capex.
  let aiWarning = false;
  const capexTminus2 = sorted[2]?.capex;
  if (capexTminus2 != null && capexTminus2 > 0 && capexT / capexTminus2 >= AI_CAPEX_DOUBLING_RATIO) {
    aiWarning = true;
    const floor = capexT * AI_CAPEX_MAINT_FLOOR_FRACTION;
    if (value < floor) {
      value = floor;
      notes.push(`Capex doubled within two years (AI-hog rule): maintenance capex floored at ${(AI_CAPEX_MAINT_FLOOR_FRACTION * 100).toFixed(0)}% of current capex.`);
    } else {
      notes.push("Capex doubled within two years (AI-hog rule): flagged; estimate already above the 50% floor.");
    }
  }

  // Reverse-trap guard: never report full (or above-full) capex as maintenance.
  if (value >= capexT) {
    value = capexT * AI_CAPEX_MAINT_FLOOR_FRACTION;
    notes.push("Estimate reached or exceeded total capex; clamped to 50% of capex (maintenance is never the full capex).");
    if (confidence === "ok") confidence = "degraded";
  }

  return {
    assessable: true,
    value,
    methods,
    confidence,
    divergence_pct: divergencePct,
    ai_capex_distortion_warning: aiWarning,
    notes,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx tsx src/lib/valuation/maintenanceCapex.check.ts`
Expected: PASS — `maintenanceCapex.check.ts: OK`

- [ ] **Step 5: Re-export and type-check**

Add to `web/src/lib/valuation/index.ts`: `export * from "./maintenanceCapex";`
Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/valuation-engine-v2-impl
git add web/src/lib/valuation/maintenanceCapex.ts web/src/lib/valuation/maintenanceCapex.check.ts web/src/lib/valuation/index.ts
git commit -m "feat(valuation): maintenance capex — four-method median + AI-hog rule (spec §1.1)"
```

---

## Task 3: `reproductionValue.ts` — AV = tangible net assets + capitalized R&D

Spec §1.4. Replaces v1's "book value masquerading as reproduction value" (误区#1).

**Files:**
- Create: `web/src/lib/valuation/reproductionValue.ts`
- Test: `web/src/lib/valuation/reproductionValue.check.ts`

**Interfaces:**
- Consumes: `ValuationFloorYear[]` (most-recent-first), `ReproductionValue` type from `./types`.
- Produces: `export function buildReproductionValue(years: ValuationFloorYear[], shares: number): ReproductionValue`; `export const RD_CAPITALIZATION_YEARS = 5`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/valuation/reproductionValue.check.ts`:

```ts
/**
 * reproductionValue.check.ts — spec §1.4 AV = tangible net assets + capitalized R&D.
 * Run: cd web && npx tsx src/lib/valuation/reproductionValue.check.ts
 */
import assert from "node:assert";
import { buildReproductionValue, RD_CAPITALIZATION_YEARS } from "./reproductionValue";
import type { ValuationFloorYear } from "./types";

const approx = (a: number, b: number, tol = 1e-6, msg = "") =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} (got ${a}, want ${b})`);

assert.strictEqual(RD_CAPITALIZATION_YEARS, 5, "Greenwald default N=5");

// Capitalized R&D: straight-line, weights 5/5,4/5,3/5,2/5,1/5 for ages 0..4.
// rd = 1000 each year × (5+4+3+2+1)/5 = 1000 × 3 = 3000.
const rdYears: ValuationFloorYear[] = [
  { fiscal_year: 2025, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500, rd_expense: 1_000 },
  { fiscal_year: 2024, shareholders_equity: 9_000, rd_expense: 1_000 },
  { fiscal_year: 2023, shareholders_equity: 8_000, rd_expense: 1_000 },
  { fiscal_year: 2022, shareholders_equity: 7_000, rd_expense: 1_000 },
  { fiscal_year: 2021, shareholders_equity: 6_000, rd_expense: 1_000 },
];
const rv = buildReproductionValue(rdYears, 1_000);
assert.ok(rv.assessable, "assessable");
assert.ok(rv.intangibles_separated, "intangibles separated");
approx(rv.tangible_net_assets!, 10_000 - 1_000 - 500, 1e-6, "tangible = equity − goodwill − intangibles");
approx(rv.capitalized_rd!, 3_000, 1e-6, "capitalized R&D = Σ rd × (N−age)/N");
approx(rv.total_value!, 8_500 + 3_000, 1e-6, "AV = tangible + capitalized R&D");
approx(rv.per_share!, (8_500 + 3_000) / 1_000, 1e-6, "per share");

// rd fully absent → degrade to tangible book, capitalized_rd undefined.
const noRd: ValuationFloorYear[] = [
  { fiscal_year: 2025, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500 },
];
const nr = buildReproductionValue(noRd, 1_000);
assert.ok(nr.assessable, "no-rd still assessable on tangible book");
assert.strictEqual(nr.capitalized_rd, undefined, "no rd → no capitalized R&D");
approx(nr.total_value!, 8_500, 1e-6, "no rd → AV = tangible net assets");

// intangible fields absent → total-book fallback (v1 behavior).
const noIntang: ValuationFloorYear[] = [
  { fiscal_year: 2025, shareholders_equity: 10_000 },
];
const ni = buildReproductionValue(noIntang, 1_000);
assert.ok(ni.assessable, "no-intangible-data falls back to total book");
assert.strictEqual(ni.intangibles_separated, false, "not separated");
approx(ni.total_value!, 10_000, 1e-6, "total book fallback");

// negative tangible → not assessable.
const negTang: ValuationFloorYear[] = [
  { fiscal_year: 2025, shareholders_equity: 1_000, goodwill: 2_000, intangibles: 500 },
];
const ng = buildReproductionValue(negTang, 1_000);
assert.strictEqual(ng.assessable, false, "negative tangible → not assessable");

// missing equity → not assessable.
const noEq = buildReproductionValue([{ fiscal_year: 2025 }], 1_000);
assert.strictEqual(noEq.assessable, false, "no equity → not assessable");

console.log("reproductionValue.check.ts: OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx tsx src/lib/valuation/reproductionValue.check.ts`
Expected: FAIL — `Cannot find module './reproductionValue'`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/valuation/reproductionValue.ts`:

```ts
import type { ReproductionValue, ValuationFloorYear } from "./types";

/** Greenwald default R&D capitalization life (straight-line). */
export const RD_CAPITALIZATION_YEARS = 5;

/**
 * Reproduction value (spec §1.4): AV = tangible net assets + capitalized R&D.
 * Tangible net assets = shareholders' equity − goodwill − acquired intangibles.
 * Capitalized R&D = Σ rd_expense(t) × (N − age)/N over the last N years (age 0..N−1).
 * `years` most-recent-first. Degrades to tangible book (no R&D) or total book (no intangible split).
 */
export function buildReproductionValue(years: ValuationFloorYear[], shares: number): ReproductionValue {
  const sorted = [...years].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const latest = sorted[0];
  const equity = latest?.shareholders_equity;

  if (equity == null) {
    return {
      assessable: false,
      not_assessable_reason: "Shareholders' equity is unavailable, so no asset floor is shown.",
      basis: "Unavailable.", intangibles_separated: false,
    };
  }

  // Capitalized R&D over the last N years (straight-line amortization weights).
  const N = RD_CAPITALIZATION_YEARS;
  const currentYear = latest.fiscal_year;
  let capitalizedRd: number | undefined;
  const rdYearsUsed: number[] = [];
  let rdSum = 0;
  for (const y of sorted) {
    const age = currentYear - y.fiscal_year;
    if (age < 0 || age >= N) continue;
    if (y.rd_expense == null) continue;
    const weight = (N - age) / N;
    rdSum += y.rd_expense * weight;
    rdYearsUsed.push(y.fiscal_year);
  }
  if (rdYearsUsed.length > 0) capitalizedRd = rdSum;

  const hasIntangibleData = latest.goodwill != null || latest.intangibles != null;

  // Total-book fallback when intangibles are not separable (v1 behavior).
  if (!hasIntangibleData) {
    const basis = capitalizedRd != null
      ? "Total book value (equity ÷ diluted shares) + capitalized R&D; intangibles not separated — goodwill/intangibles unavailable this period."
      : "Total book value (shareholders' equity ÷ diluted shares); intangibles not separated — goodwill/intangibles unavailable this period.";
    if (equity <= 0) {
      return { assessable: false, not_assessable_reason: "Book value is negative or unavailable, so no asset floor is shown.", basis, intangibles_separated: false };
    }
    const total = equity + (capitalizedRd ?? 0);
    return {
      assessable: true, basis, intangibles_separated: false,
      tangible_net_assets: equity, capitalized_rd: capitalizedRd,
      total_value: total, per_share: total / shares, rd_years_used: capitalizedRd != null ? rdYearsUsed : undefined,
    };
  }

  const tangible = equity - (latest.goodwill ?? 0) - (latest.intangibles ?? 0);
  const basis = capitalizedRd != null
    ? "Reproduction value = tangible net assets (equity − goodwill − intangibles) + capitalized R&D (5y straight-line), ÷ diluted shares."
    : "Tangible net assets = shareholders' equity − goodwill − intangibles, ÷ diluted shares (no R&D history to capitalize).";
  if (tangible <= 0) {
    return { assessable: false, not_assessable_reason: "Tangible net assets are negative, so no asset floor is shown.", basis, intangibles_separated: true };
  }
  const total = tangible + (capitalizedRd ?? 0);
  return {
    assessable: true, basis, intangibles_separated: true,
    tangible_net_assets: tangible, capitalized_rd: capitalizedRd,
    total_value: total, per_share: total / shares, rd_years_used: capitalizedRd != null ? rdYearsUsed : undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx tsx src/lib/valuation/reproductionValue.check.ts`
Expected: PASS — `reproductionValue.check.ts: OK`

- [ ] **Step 5: Re-export and type-check**

Add to `web/src/lib/valuation/index.ts`: `export * from "./reproductionValue";`
Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/valuation-engine-v2-impl
git add web/src/lib/valuation/reproductionValue.ts web/src/lib/valuation/reproductionValue.check.ts web/src/lib/valuation/index.ts
git commit -m "feat(valuation): reproduction value — tangible net assets + capitalized R&D (spec §1.4)"
```

---

## Task 4: `growthValue.ts` — Greenwald GV (franchise-gated, cumulative ROIIC, three scenarios)

Spec §1.6. The third Greenwald layer. Franchise-gated, cumulative endpoint-aligned ROIIC, three-scenario sensitivity.

**Files:**
- Create: `web/src/lib/valuation/growthValue.ts`
- Test: `web/src/lib/valuation/growthValue.check.ts`

**Interfaces:**
- Consumes: `ValuationFloorYear[]` (most-recent-first), `MoatSignal` and `GrowthValue` types from `./types`.
- Produces:
  - `export function computeGrowthValue(args: GrowthValueArgs): GrowthValue`
  - `export type GrowthValueArgs = { years: ValuationFloorYear[]; shares: number; taxRate: number; moatSignal: MoatSignal; epvPerShare?: number; avPerShare?: number };`
  - Named constants: `export const GV_WINDOW = 5;`, `export const ROIIC_ENDPOINT_LAG = 2;`, `export const DURATION_STRONG = 10;`, `export const DURATION_MODERATE = 8;`, `export const DURATION_PESSIMISTIC_DELTA = 2;`, `export const ROIIC_SENSITIVITY = 0.25;`, `export const MOAT_STRONG_MULTIPLE = 2.0;`, `export const GV_DISCOUNT_PESSIMISTIC = 0.10;`, `export const GV_DISCOUNT_NEUTRAL = 0.09;`, `export const GV_DISCOUNT_OPTIMISTIC = 0.08;`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/valuation/growthValue.check.ts`:

```ts
/**
 * growthValue.check.ts — spec §1.6 Greenwald growth value.
 * Run: cd web && npx tsx src/lib/valuation/growthValue.check.ts
 */
import assert from "node:assert";
import { computeGrowthValue } from "./growthValue";
import type { ValuationFloorYear } from "./types";

// A franchise grower: rising operating income, capex > D&A (real growth reinvestment), rising NWC.
const grower: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 20_000, operating_income: 5_000, capex: 3_000, d_and_a: 1_000, working_capital: 3_000 },
  { fiscal_year: 2024, revenue: 17_000, operating_income: 4_000, capex: 2_600, d_and_a: 900, working_capital: 2_600 },
  { fiscal_year: 2023, revenue: 15_000, operating_income: 3_200, capex: 2_300, d_and_a: 850, working_capital: 2_300 },
  { fiscal_year: 2022, revenue: 13_000, operating_income: 2_600, capex: 2_000, d_and_a: 800, working_capital: 2_000 },
  { fiscal_year: 2021, revenue: 11_000, operating_income: 2_000, capex: 1_800, d_and_a: 750, working_capital: 1_800 },
];

// Franchise gate: non-franchise → GV forced to 0 (gated_to_zero true, NOT "missing data").
const commodity = computeGrowthValue({ years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "commodity", epvPerShare: 50, avPerShare: 40 });
assert.strictEqual(commodity.gated_to_zero, true, "commodity → GV gated to zero");
assert.strictEqual(commodity.scenarios.neutral, 0, "commodity → neutral GV = 0");
assert.strictEqual(commodity.per_share.optimistic, 0, "commodity → optimistic GV = 0");

const vd = computeGrowthValue({ years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "value_destruction", epvPerShare: 10, avPerShare: 40 });
assert.strictEqual(vd.gated_to_zero, true, "value_destruction → GV gated to zero");

// Franchise: GV > 0, ordered pessimistic ≤ neutral ≤ optimistic.
const fr = computeGrowthValue({ years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40 });
assert.ok(fr.assessable, "franchise grower is assessable");
assert.strictEqual(fr.gated_to_zero, false, "franchise not gated");
assert.ok(fr.roiic != null && fr.roiic > 0, "positive ROIIC");
assert.ok(fr.scenarios.neutral > 0, "franchise → positive neutral GV");
assert.ok(fr.per_share.pessimistic <= fr.per_share.neutral + 1e-9, "pessimistic ≤ neutral");
assert.ok(fr.per_share.neutral <= fr.per_share.optimistic + 1e-9, "neutral ≤ optimistic");

// Strong franchise (EPV/AV ≥ 2.0) uses the longer duration than a moderate one.
const strong = computeGrowthValue({ years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 100, avPerShare: 40 });
const moderate = computeGrowthValue({ years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 50, avPerShare: 40 });
assert.ok((strong.duration_years ?? 0) > (moderate.duration_years ?? 0), "strong franchise → longer duration");

// ROIIC ≤ WACC → GV = 0 even for a franchise (growth that doesn't out-earn capital creates no value).
const lowReturn: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 20_000, operating_income: 2_050, capex: 5_000, d_and_a: 1_000, working_capital: 3_000 },
  { fiscal_year: 2024, revenue: 18_000, operating_income: 2_040, capex: 4_500, d_and_a: 950, working_capital: 2_800 },
  { fiscal_year: 2023, revenue: 16_000, operating_income: 2_030, capex: 4_000, d_and_a: 900, working_capital: 2_600 },
  { fiscal_year: 2022, revenue: 14_000, operating_income: 2_020, capex: 3_500, d_and_a: 850, working_capital: 2_400 },
  { fiscal_year: 2021, revenue: 12_000, operating_income: 2_010, capex: 3_000, d_and_a: 800, working_capital: 2_200 },
];
const lr = computeGrowthValue({ years: lowReturn, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40 });
assert.strictEqual(lr.scenarios.neutral, 0, "ROIIC ≤ WACC → neutral GV = 0");

// Degradation: no operating income (bank-like) → not assessable, GV 0, no crash.
const noOpInc: ValuationFloorYear[] = [
  { fiscal_year: 2025, net_income: 3_000, capex: 1_000, d_and_a: 800 },
  { fiscal_year: 2024, net_income: 2_800, capex: 900, d_and_a: 750 },
];
const noi = computeGrowthValue({ years: noOpInc, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40 });
assert.strictEqual(noi.assessable, false, "no operating income → GV not assessable");
assert.strictEqual(noi.scenarios.neutral, 0, "not assessable → GV 0");

console.log("growthValue.check.ts: OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx tsx src/lib/valuation/growthValue.check.ts`
Expected: FAIL — `Cannot find module './growthValue'`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/valuation/growthValue.ts`:

```ts
import type { GrowthScenarioSet, GrowthValue, MoatSignal, ValuationFloorYear } from "./types";

export const GV_WINDOW = 5;                 // years in the ROIIC window
export const ROIIC_ENDPOINT_LAG = 2;        // exclude the last N years' not-yet-matured growth investment (audit fix #4)
export const DURATION_STRONG = 10;          // strong franchise (EPV/AV ≥ MOAT_STRONG_MULTIPLE)
export const DURATION_MODERATE = 8;         // moderate franchise
export const DURATION_PESSIMISTIC_DELTA = 2;// pessimistic scenario shortens duration by this many years
export const ROIIC_SENSITIVITY = 0.25;      // ±25% band on ROIIC for the scenarios (heuristic, disclosed)
export const MOAT_STRONG_MULTIPLE = 2.0;    // EPV/AV at/above this → strong franchise
export const GV_DISCOUNT_PESSIMISTIC = 0.10;
export const GV_DISCOUNT_NEUTRAL = 0.09;
export const GV_DISCOUNT_OPTIMISTIC = 0.08;

export type GrowthValueArgs = {
  years: ValuationFloorYear[];
  shares: number;
  taxRate: number;
  moatSignal: MoatSignal;
  epvPerShare?: number;
  avPerShare?: number;
};

const ZERO: GrowthScenarioSet = { pessimistic: 0, neutral: 0, optimistic: 0 };

/** Duration annuity factor [1 − 1/(1+r)^N] / r. */
function annuityFactor(r: number, n: number): number {
  return (1 - 1 / Math.pow(1 + r, n)) / r;
}

/**
 * Greenwald growth value (spec §1.6). Franchise-gated; cumulative endpoint-aligned ROIIC;
 * three-scenario sensitivity. `years` most-recent-first.
 *
 * Per-year growth reinvestment uses the D&A proxy for maintenance (capex − D&A)+ + ΔNWC — the
 * standard Greenwald growth-capex proxy across a multi-year series (disclosed simplification);
 * the dedicated maintenanceCapex() drives the current-year EPV/OE, not this series.
 */
export function computeGrowthValue(args: GrowthValueArgs): GrowthValue {
  const { years, shares, taxRate, moatSignal, epvPerShare, avPerShare } = args;
  const notes: string[] = [];
  const waccBand: [number, number] = [GV_DISCOUNT_OPTIMISTIC, GV_DISCOUNT_PESSIMISTIC];

  // Franchise gate (Greenwald orthodoxy): only a franchise earns a growth premium.
  if (moatSignal !== "franchise") {
    return {
      assessable: true, gated_to_zero: true, wacc_band: waccBand,
      scenarios: { ...ZERO }, per_share: { ...ZERO },
      notes: ["Growth value applies only to a franchise; without a moat, growth creates no durable value (GV = 0)."],
    };
  }

  const sorted = [...years].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const window = sorted.slice(0, GV_WINDOW);

  // NOPAT series for the increment (needs operating income).
  const nopat = (y: ValuationFloorYear): number | undefined =>
    y.operating_income != null ? y.operating_income * (1 - taxRate) : undefined;
  const nopatLatest = nopat(window[0]);
  const nopatOldest = window.length >= 2 ? nopat(window[window.length - 1]) : undefined;
  if (nopatLatest == null || nopatOldest == null || window.length < 3) {
    return {
      assessable: false,
      not_assessable_reason: "Operating income is not available across the window, so ROIIC / growth value cannot be computed.",
      gated_to_zero: false, wacc_band: waccBand, scenarios: { ...ZERO }, per_share: { ...ZERO },
      notes: ["Insufficient operating-income history for a growth read."],
    };
  }

  // Per-year growth reinvestment = max(0, capex − D&A) + ΔNWC. ΔNWC = WC_y − WC_{y+1} (older).
  function growthReinvest(idx: number): number | undefined {
    const y = window[idx];
    if (y.capex == null || y.d_and_a == null) return undefined;
    const growthCapex = Math.max(0, y.capex - y.d_and_a);
    let deltaNwc = 0;
    const older = window[idx + 1];
    if (y.working_capital != null && older?.working_capital != null) {
      deltaNwc = y.working_capital - older.working_capital; // increase = investment
    }
    return growthCapex + deltaNwc;
  }

  // Endpoint alignment (audit fix #4): cumulative denominator over the MATURED years only —
  // skip the most recent ROIIC_ENDPOINT_LAG years' investment (not yet earning).
  let lag = ROIIC_ENDPOINT_LAG;
  const reinvestSeries: number[] = [];
  for (let i = lag; i < window.length; i++) {
    const r = growthReinvest(i);
    if (r != null) reinvestSeries.push(r);
  }
  if (reinvestSeries.length === 0 && window.length >= 2) {
    lag = 1; // relax endpoint lag if the window is short
    for (let i = lag; i < window.length; i++) {
      const r = growthReinvest(i);
      if (r != null) reinvestSeries.push(r);
    }
    if (reinvestSeries.length > 0) notes.push("Endpoint lag relaxed to 1 year (short window).");
  }
  const cumulativeReinvest = reinvestSeries.reduce((s, v) => s + v, 0);
  if (cumulativeReinvest <= 0) {
    return {
      assessable: false,
      not_assessable_reason: "No positive growth reinvestment in the matured window, so ROIIC cannot be computed.",
      gated_to_zero: false, wacc_band: waccBand, scenarios: { ...ZERO }, per_share: { ...ZERO },
      notes: [...notes, "Capex did not exceed D&A (no growth capital deployed) — growth value not assessable."],
    };
  }

  // Cumulative ROIIC = N-year NOPAT increment / Σ growth reinvestment (matured).
  const roiic = (nopatLatest - nopatOldest) / cumulativeReinvest;

  // Representative annual growth reinvestment (average over the matured series).
  const annualReinvest = cumulativeReinvest / reinvestSeries.length;

  // Duration by franchise strength (EPV/AV).
  const ratio = epvPerShare != null && avPerShare != null && avPerShare > 0 ? epvPerShare / avPerShare : undefined;
  const baseDuration = ratio != null && ratio >= MOAT_STRONG_MULTIPLE ? DURATION_STRONG : DURATION_MODERATE;

  // GV = annual growth reinvestment × (ROIIC − r)/r × annuityFactor(r, N). Floor at 0 per scenario.
  function gv(roiicScenario: number, r: number, n: number): number {
    if (roiicScenario <= r) return 0;
    const excess = (roiicScenario - r) / r;
    const val = annualReinvest * excess * annuityFactor(r, n);
    return val > 0 ? val : 0;
  }

  const roiicLow = roiic * (1 - ROIIC_SENSITIVITY);
  const roiicHigh = roiic * (1 + ROIIC_SENSITIVITY);
  const durShort = Math.max(1, baseDuration - DURATION_PESSIMISTIC_DELTA);

  const scenarios: GrowthScenarioSet = {
    pessimistic: gv(roiicLow, GV_DISCOUNT_PESSIMISTIC, durShort),
    neutral: gv(roiic, GV_DISCOUNT_NEUTRAL, baseDuration),
    optimistic: gv(roiicHigh, GV_DISCOUNT_OPTIMISTIC, baseDuration),
  };
  const per_share: GrowthScenarioSet = {
    pessimistic: scenarios.pessimistic / shares,
    neutral: scenarios.neutral / shares,
    optimistic: scenarios.optimistic / shares,
  };

  if (roiic <= GV_DISCOUNT_NEUTRAL) {
    notes.push("ROIIC is at or below the cost of capital: incremental growth does not create value (neutral GV = 0).");
  }
  notes.push("Per-year maintenance uses the D&A proxy for the growth-reinvestment series; net M&A omitted (conservative); ΔNWC growth portion included here only (not in the owner-earnings floor).");

  return {
    assessable: true,
    gated_to_zero: false,
    roiic,
    wacc_band: waccBand,
    annual_growth_reinvestment: annualReinvest,
    duration_years: baseDuration,
    scenarios,
    per_share,
    notes,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx tsx src/lib/valuation/growthValue.check.ts`
Expected: PASS — `growthValue.check.ts: OK`

- [ ] **Step 5: Re-export and type-check**

Add to `web/src/lib/valuation/index.ts`: `export * from "./growthValue";`
Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/valuation-engine-v2-impl
git add web/src/lib/valuation/growthValue.ts web/src/lib/valuation/growthValue.check.ts web/src/lib/valuation/index.ts
git commit -m "feat(valuation): Greenwald growth value — franchise-gated, cumulative ROIIC, 3 scenarios (spec §1.6)"
```

---

## Task 5: EPV 写法 A — maintenance-capex-corrected earnings power

Spec §1.2. Rewrite `buildGrahamLamp` to use `(NOPAT + D&A − maintCapex)/r` (write A: maintenance capex in full cash, no tax shield). Collapses to `NOPAT/WACC` when `maintCapex == D&A` (v1 parity). Degrades to v1 when maintenance capex is not assessable.

**Files:**
- Modify: `web/src/lib/valuation/epvFloor.ts`
- Test: `web/src/lib/valuation/epvFloor.check.ts`

**Interfaces:**
- Consumes: `maintenanceCapex` from `./maintenanceCapex`.
- Produces: unchanged signatures; `buildGrahamLamp` now takes the full `years` array (already does) and applies write A internally.

- [ ] **Step 1: Write the failing test**

First, add the maintenance-capex import at the **top** of `web/src/lib/valuation/epvFloor.check.ts` (alongside the existing imports — ESM imports must be top-level, not inside a block):

```ts
import { maintenanceCapex } from "./maintenanceCapex";
```

Then append to the file (before the final `console.log`) a block that constructs a company where `maintCapex > D&A` and asserts EPV is pressed below the `NOPAT/WACC` value, and that the deduction is full-cash (not tax-shielded):

```ts
// ── EPV 写法 A (spec §1.2) ───────────────────────────────────────────────────
{
  // capex high vs D&A → maintenance capex > D&A → EPV below NOPAT/WACC.
  const years = [
    { fiscal_year: 2025, revenue: 10_000, operating_margin: 0.30, net_income: 2_000, effective_tax_rate: 0.20, shareholders_equity: 5_000, cash: 1_000, total_debt: 0, shares_diluted: 1_000, capex: 2_500, d_and_a: 1_000, ppe_net: 12_000 },
    { fiscal_year: 2024, revenue: 9_500, operating_margin: 0.30, net_income: 1_900, effective_tax_rate: 0.20, shareholders_equity: 4_800, cash: 900, total_debt: 0, shares_diluted: 1_000, capex: 2_300, d_and_a: 950, ppe_net: 11_000 },
    { fiscal_year: 2023, revenue: 9_000, operating_margin: 0.30, net_income: 1_800, effective_tax_rate: 0.20, shareholders_equity: 4_600, cash: 800, total_debt: 0, shares_diluted: 1_000, capex: 2_100, d_and_a: 900, ppe_net: 10_000 },
  ];
  const floor = computeValuationFloor({ ticker: "EPVA", years });
  assert.ok(floor && "kind" in floor && floor.kind === "floor", "EPVA produces a floor");
  if (floor && "kind" in floor && floor.kind === "floor") {
    const g = floor.graham_epv;
    assert.ok(g.assessable, "graham lamp assessable");
    // Reconstruct NOPAT and the maintenance-capex deduction.
    const taxRate = floor.provenance.normalized_tax_rate;
    const nopat = 0.30 * 10_000 * (1 - taxRate);
    const mc = maintenanceCapex(years as any).value!;
    const da = 1_000;
    // write A: EPV(Biz) = (NOPAT + D&A − maintCapex)/r. With maintCapex > D&A, < NOPAT/r.
    const expectedHigh = (nopat + da - mc) / 0.08 + 1_000 - 0; // +cash −debt
    assert.ok(Math.abs(g.equity_value_high! - expectedHigh) < 1e-6, "EPV write A: full-cash maintenance-capex deduction, no tax shield");
    assert.ok(g.equity_value_high! < nopat / 0.08 + 1_000, "maintCapex > D&A presses EPV below NOPAT/WACC");
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: FAIL — current `buildGrahamLamp` ignores capex/D&A, so EPV equals `NOPAT/r` and the write-A assertion fails.

- [ ] **Step 3: Rewrite `buildGrahamLamp` for write A**

In `web/src/lib/valuation/epvFloor.ts`, add the import at the top:

```ts
import { maintenanceCapex } from "./maintenanceCapex";
```

Replace the body of `buildGrahamLamp` (lines ~139-184). Keep the signature. New version:

```ts
function buildGrahamLamp(
  years: ValuationFloorYear[],
  cash: number,
  totalDebt: number,
  shares: number,
  yearsUsed: number[],
  taxRate: number,
): EpvLamp {
  const mc = maintenanceCapex(years);
  const latestDa = years[0].d_and_a;
  // write A: deduct (maintCapex − D&A) in full cash from after-tax NOPAT. When maintCapex == D&A
  // (or either is missing → degrade), this collapses to NOPAT/WACC (v1 parity).
  const canCorrect = mc.assessable && mc.value != null && latestDa != null;
  const capexDrag = canCorrect ? mc.value! - latestDa! : 0;
  const simplifications: string[] = [];
  if (canCorrect) {
    simplifications.push(
      `Maintenance capex (${mc.confidence}) deducted in full cash (write A): EPV = (NOPAT + D&A − maintenance capex) / WACC; no tax shield on the capex term.`,
    );
    if (mc.ai_capex_distortion_warning) simplifications.push("Capex doubled within two years (AI-hog rule): maintenance capex floored at 50% of current capex; EPV is correspondingly pressed down.");
    for (const n of mc.notes) simplifications.push(n);
  } else {
    simplifications.push("Maintenance capex unavailable → degraded to the v1 simplification (maintenance capex = D&A, so the depreciation add-back nets to zero).");
  }
  simplifications.push("Share-based compensation is left as a real expense (not added back).");

  const method = {
    earnings_basis: "Normalized NOPAT = average operating margin over the years shown × latest-year revenue × (1 − normalized tax); then + D&A − maintenance capex (write A).",
    leverage_treatment: "Unlevered (pre-interest, attributable to all capital).",
    denominator: "Capitalized at the 8–10% rate band (read as a WACC proxy).",
    bridge: "Enterprise → equity bridge applied: + cash − total debt.",
    discount_rate_low: DISCOUNT_RATE_LOW,
    discount_rate_high: DISCOUNT_RATE_HIGH,
    years_used: yearsUsed,
    simplifications,
  };
  const latestRevenue = years[0].revenue!;
  const avgMargin = avg(years.map((y) => marginOf(y)!));
  const nopat = avgMargin * latestRevenue * (1 - taxRate);
  const ownerStream = nopat - capexDrag; // = NOPAT + D&A − maintCapex when canCorrect, else NOPAT
  if (ownerStream <= 0) {
    return {
      label: "Graham earnings-power value (normalized NOPAT)",
      assessable: false,
      not_assessable_reason: "Normalized operating earnings net of maintenance capex are non-positive over the years shown; earnings power cannot be capitalized.",
      normalized_earnings: ownerStream,
      method,
    };
  }
  const equityLow = ownerStream / DISCOUNT_RATE_HIGH + cash - totalDebt;
  const equityHigh = ownerStream / DISCOUNT_RATE_LOW + cash - totalDebt;
  return {
    label: "Graham earnings-power value (normalized NOPAT)",
    assessable: true,
    normalized_earnings: ownerStream,
    equity_value_low: equityLow,
    equity_value_high: equityHigh,
    per_share_low: equityLow / shares,
    per_share_high: equityHigh / shares,
    method,
  };
}
```

> `capexDrag = maintCapex − D&A`, and `ownerStream = NOPAT − capexDrag = NOPAT + D&A − maintCapex`. This is write A (no `(1−tax)` on the capex term). Audit fix #2.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: PASS — including the existing assertions (the steady-state fixtures have no capex/D&A, so `canCorrect` is false → v1 parity preserved).

- [ ] **Step 5: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/valuation-engine-v2-impl
git add web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts
git commit -m "feat(valuation): EPV write-A — maintenance-capex-corrected earnings power (spec §1.2)"
```

---

## Task 6: Real Owner Earnings — net income + D&A − maintenance capex (no ΔNWC), SBC disclosure

Spec §1.3. Rewrite `buildBuffettLamp` to the real owner-earnings floor (no ΔNWC; SBC stays in net income but `sbc_to_oe_pct` disclosed). Degrades to v1 (avg net income) when D&A or maintenance capex is unavailable.

**Files:**
- Modify: `web/src/lib/valuation/epvFloor.ts`
- Test: `web/src/lib/valuation/epvFloor.check.ts`

**Interfaces:**
- Consumes: `maintenanceCapex` (already imported in Task 5).
- Produces: `buildBuffettLamp` now sets `sbc_to_oe_pct` when SBC is present; owner earnings = `avg(net_income) + avg(d_and_a) − maintCapex` (no ΔNWC).

- [ ] **Step 1: Write the failing test**

Append to `web/src/lib/valuation/epvFloor.check.ts` (before final `console.log`):

```ts
// ── Owner Earnings (spec §1.3) ───────────────────────────────────────────────
{
  const years = [
    { fiscal_year: 2025, revenue: 10_000, operating_margin: 0.30, net_income: 2_000, effective_tax_rate: 0.20, shareholders_equity: 5_000, cash: 500, total_debt: 0, shares_diluted: 1_000, capex: 1_500, d_and_a: 1_000, ppe_net: 9_000, stock_based_comp: 200, working_capital: 1_000 },
    { fiscal_year: 2024, revenue: 9_500, operating_margin: 0.30, net_income: 1_800, effective_tax_rate: 0.20, shareholders_equity: 4_800, cash: 450, total_debt: 0, shares_diluted: 1_000, capex: 1_400, d_and_a: 950, ppe_net: 8_500, stock_based_comp: 180, working_capital: 800 },
    { fiscal_year: 2023, revenue: 9_000, operating_margin: 0.30, net_income: 1_600, effective_tax_rate: 0.20, shareholders_equity: 4_600, cash: 400, total_debt: 0, shares_diluted: 1_000, capex: 1_300, d_and_a: 900, ppe_net: 8_000, stock_based_comp: 160, working_capital: 600 },
  ];
  const floor = computeValuationFloor({ ticker: "OE", years });
  assert.ok(floor && "kind" in floor && floor.kind === "floor");
  if (floor && "kind" in floor && floor.kind === "floor") {
    const b = floor.buffett_epv;
    assert.ok(b.assessable, "buffett lamp assessable");
    const avgNi = (2_000 + 1_800 + 1_600) / 3;
    const avgDa = (1_000 + 950 + 900) / 3;
    const mc = maintenanceCapex(years as any).value!;
    const oe = avgNi + avgDa - mc; // NO ΔNWC term (audit fix #3)
    assert.ok(Math.abs(b.normalized_earnings! - oe) < 1e-6, "owner earnings = net income + D&A − maintenance capex, no ΔNWC");
    // SBC is NOT added back (audit fix #6) but disclosed.
    assert.ok(b.sbc_to_oe_pct != null && b.sbc_to_oe_pct > 0, "SBC/OE disclosed");
    const avgSbc = (200 + 180 + 160) / 3;
    assert.ok(Math.abs(b.sbc_to_oe_pct! - avgSbc / oe) < 1e-6, "SBC/OE% = avg SBC / owner earnings");
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: FAIL — current Buffett lamp returns `avg(net_income)` and has no `sbc_to_oe_pct`.

- [ ] **Step 3: Rewrite `buildBuffettLamp`**

In `web/src/lib/valuation/epvFloor.ts`, replace the body of `buildBuffettLamp` (lines ~205-242):

```ts
function buildBuffettLamp(years: ValuationFloorYear[], shares: number, yearsUsed: number[]): EpvLamp {
  const mc = maintenanceCapex(years);
  const avgNi = avg(years.map((y) => y.net_income!));
  const daVals = years.map((y) => y.d_and_a).filter((v): v is number => v != null);
  const avgDa = daVals.length ? avg(daVals) : undefined;
  // Real owner earnings = net income + D&A − maintenance capex, WITHOUT ΔNWC (maintenance ΔNWC ≈ 0;
  // the growth portion of ΔNWC lives in GV — audit fix #3). Degrade to avg net income when inputs missing.
  const canCorrect = mc.assessable && mc.value != null && avgDa != null;
  const ownerEarnings = canCorrect ? avgNi + avgDa! - mc.value! : avgNi;

  const simplifications: string[] = [];
  if (canCorrect) {
    simplifications.push(`Owner earnings = net income + D&A − maintenance capex (${mc.confidence}); the working-capital change is excluded (maintenance ΔNWC ≈ 0; growth ΔNWC is carried in growth value, not double-counted).`);
    if (mc.ai_capex_distortion_warning) simplifications.push("Capex doubled within two years (AI-hog rule): maintenance capex floored at 50% of current capex.");
  } else {
    simplifications.push("Maintenance capex or D&A unavailable → degraded to normalized net income (= average net income over the years shown).");
  }
  simplifications.push("One-time items are not separately normalized (multi-year averaging smooths them partially).");
  simplifications.push("Share-based compensation is left as a real expense (not added back); see the SBC/OE disclosure.");
  simplifications.push("Capitalized at the same 8–10% band as a cost-of-equity proxy (theoretically the cost of equity is higher; v2 simplification, v3 to refine).");

  const method = {
    earnings_basis: "Owner earnings = average net income + average D&A − maintenance capex (zero-growth floor; no ΔNWC).",
    leverage_treatment: "Levered (starts from net income, already after interest — an equity-holder stream).",
    denominator: "Capitalized at the 8–10% rate band (read as a cost-of-equity proxy).",
    bridge: "No enterprise→equity bridge: the capitalized result is already equity value (subtracting debt would double-count interest).",
    discount_rate_low: DISCOUNT_RATE_LOW,
    discount_rate_high: DISCOUNT_RATE_HIGH,
    years_used: yearsUsed,
    simplifications,
  };

  // SBC disclosure (not added back): average SBC / owner earnings.
  const sbcVals = years.map((y) => y.stock_based_comp).filter((v): v is number => v != null);
  const sbcToOe = sbcVals.length && ownerEarnings > 0 ? avg(sbcVals) / ownerEarnings : undefined;

  if (ownerEarnings <= 0) {
    return {
      label: "Buffett owner-earnings value",
      assessable: false,
      not_assessable_reason: "Normalized owner earnings are non-positive over the years shown; earnings power cannot be capitalized.",
      normalized_earnings: ownerEarnings,
      sbc_to_oe_pct: sbcToOe,
      method,
    };
  }
  const equityLow = ownerEarnings / DISCOUNT_RATE_HIGH;
  const equityHigh = ownerEarnings / DISCOUNT_RATE_LOW;
  return {
    label: "Buffett owner-earnings value",
    assessable: true,
    normalized_earnings: ownerEarnings,
    equity_value_low: equityLow,
    equity_value_high: equityHigh,
    per_share_low: equityLow / shares,
    per_share_high: equityHigh / shares,
    sbc_to_oe_pct: sbcToOe,
    method,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: PASS — existing fixtures without capex/D&A still hit the v1-parity branch (`canCorrect` false → `avgNi`).

- [ ] **Step 5: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/valuation-engine-v2-impl
git add web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts
git commit -m "feat(valuation): real owner earnings — net income + D&A − maint capex, no ΔNWC, SBC disclosed (spec §1.3)"
```

---

## Task 7: Reproduction value as the asset floor + moat = EPV vs AV

Spec §1.4 / §1.5. Replace `buildAssetFloor` with `buildReproductionValue`, and change `buildMoatReading` to compare EPV against AV (reproduction value), populating `franchise_value`.

**Files:**
- Modify: `web/src/lib/valuation/epvFloor.ts`
- Test: `web/src/lib/valuation/epvFloor.check.ts`

**Interfaces:**
- Consumes: `buildReproductionValue` from `./reproductionValue`.
- Produces: `assembleFloor` sets `asset_floor` from `buildReproductionValue(years, shares)`; `buildMoatReading(moatRefLamp, reproductionValue, shares)` returns moat with `franchise_value`.

- [ ] **Step 1: Write the failing test**

Append to `web/src/lib/valuation/epvFloor.check.ts` (before final `console.log`):

```ts
// ── Reproduction value as asset floor + moat EPV vs AV (spec §1.4/§1.5) ───────
{
  // R&D-heavy franchise: capitalized R&D should lift AV above tangible book; EPV well above AV → franchise.
  const years = [
    { fiscal_year: 2025, revenue: 20_000, operating_margin: 0.40, net_income: 6_000, effective_tax_rate: 0.15, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500, cash: 3_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 2_000, d_and_a: 800, capex: 900, ppe_net: 6_000 },
    { fiscal_year: 2024, revenue: 18_000, operating_margin: 0.40, net_income: 5_400, effective_tax_rate: 0.15, shareholders_equity: 9_000, goodwill: 1_000, intangibles: 500, cash: 2_500, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_800, d_and_a: 750, capex: 850, ppe_net: 5_500 },
    { fiscal_year: 2023, revenue: 16_000, operating_margin: 0.40, net_income: 4_800, effective_tax_rate: 0.15, shareholders_equity: 8_000, goodwill: 1_000, intangibles: 500, cash: 2_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_600, d_and_a: 700, capex: 800, ppe_net: 5_000 },
  ];
  const floor = computeValuationFloor({ ticker: "MOAT", years });
  assert.ok(floor && "kind" in floor && floor.kind === "floor");
  if (floor && "kind" in floor && floor.kind === "floor") {
    // AV includes capitalized R&D, so it exceeds tangible book (10000−1000−500 = 8500).
    assert.ok(floor.asset_floor.capitalized_rd != null && floor.asset_floor.capitalized_rd > 0, "AV carries capitalized R&D");
    assert.ok(floor.asset_floor.total_value! > 8_500, "AV > tangible book (R&D capitalized)");
    // Moat compares EPV to AV (reproduction value), and franchise_value is set when franchise.
    assert.strictEqual(floor.moat_reading.signal, "franchise", "high-margin R&D franchise reads franchise vs reproduction value");
    assert.ok(floor.moat_reading.franchise_value != null && floor.moat_reading.franchise_value > 0, "franchise value (EPV − AV) set");
    assert.ok(floor.moat_reading.basis_note.toLowerCase().includes("reproduction"), "moat basis cites reproduction value");
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: FAIL — `asset_floor.capitalized_rd` is undefined (still v1 `buildAssetFloor`), and moat basis still says "book value".

- [ ] **Step 3: Swap in reproduction value + EPV-vs-AV moat**

In `web/src/lib/valuation/epvFloor.ts`:

Add import:
```ts
import { buildReproductionValue } from "./reproductionValue";
```

In `assembleFloor`, replace `const assetFloor = buildAssetFloor(latest, shares);` with:
```ts
  const assetFloor = buildReproductionValue(years, shares);
```
and replace `const moatReading = buildMoatReading(moatRefLamp, assetFloor);` with:
```ts
  const moatReading = buildMoatReading(moatRefLamp, assetFloor, shares);
```

Delete the old `buildAssetFloor` function entirely (lines ~244-262) — `buildReproductionValue` replaces it.

Replace `buildMoatReading` (lines ~264-282) with the EPV-vs-AV version:

```ts
function buildMoatReading(epvLamp: EpvLamp, reproduction: ReproductionValue, shares: number): MoatReading {
  const basisNote =
    "Franchise test compares earnings power (EPV) against reproduction value (tangible net assets + capitalized R&D). EPV well above reproduction value signals a moat; near it, a commodity; below it, value destruction. A directional reading, not a verdict.";
  if (!epvLamp.assessable) {
    return { signal: "value_destruction", label: "Normalized earnings are non-positive, so earnings power sits below the reproduction-value base — a value-destruction signal (not a verdict).", basis_note: basisNote };
  }
  if (!reproduction.assessable || reproduction.per_share == null) {
    return { signal: "not_assessable", label: "The earnings-power vs reproduction-value comparison is unavailable because there is no positive asset base.", basis_note: basisNote };
  }
  const epvMid = (epvLamp.per_share_low! + epvLamp.per_share_high!) / 2;
  const ratio = epvMid / reproduction.per_share;
  if (ratio >= MOAT_FRANCHISE_MULTIPLE) {
    return {
      signal: "franchise",
      label: "Earnings power sits well above reproduction value — a franchise (moat) signal, not a verdict.",
      basis_note: basisNote,
      epv_per_share_compared: epvMid,
      asset_per_share_compared: reproduction.per_share,
      franchise_value: (epvMid - reproduction.per_share) * shares,
    };
  }
  if (ratio >= MOAT_COMMODITY_FLOOR) {
    return { signal: "commodity", label: "Earnings power sits near reproduction value — a commodity-like profile with no clear moat signal.", basis_note: basisNote, epv_per_share_compared: epvMid, asset_per_share_compared: reproduction.per_share };
  }
  return { signal: "value_destruction", label: "Earnings power sits below reproduction value — a value-destruction signal, not a verdict.", basis_note: basisNote, epv_per_share_compared: epvMid, asset_per_share_compared: reproduction.per_share };
}
```

Update the import line at the top of `epvFloor.ts` to drop `AssetFloor` and add `ReproductionValue`:
```ts
import type { EpvLamp, MoatReading, PerShareUnavailable, ReproductionValue, ValuationFloor, ValuationFloorInput, ValuationFloorYear } from "./types";
```

> Note: the `MAINT_CAPEX_RULE` provenance string still references v1. Update it to: `"Maintenance capex estimated by the four-method median (D&A proxy / Greenwald sales method / PP&E useful life), with the AI-hog 50%-of-capex floor; degrades to D&A when inputs are missing."`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: PASS. (If a pre-existing moat assertion in the file asserted the old "book value" basis text, update that assertion to match the new reproduction-value wording — the moat math is the same thresholds, only the comparison base and prose changed.)

- [ ] **Step 5: Type-check + confirm UI still compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. (UI reads `asset_floor.assessable/.per_share/.basis` and `moat_reading.signal/.basis_note` — all still present on the superset `ReproductionValue`/extended `MoatReading`.)

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/valuation-engine-v2-impl
git add web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts
git commit -m "feat(valuation): reproduction value as asset floor + moat EPV vs AV (spec §1.4/§1.5)"
```

---

## Task 8: Wire Greenwald growth value into the floor

Spec §1.6. Call `computeGrowthValue` in `assembleFloor` and populate `ValuationFloor.growth_value` (replacing the Task-1 placeholder), passing the franchise signal, EPV mid, and AV per share.

**Files:**
- Modify: `web/src/lib/valuation/epvFloor.ts`
- Test: `web/src/lib/valuation/epvFloor.check.ts`

**Interfaces:**
- Consumes: `computeGrowthValue` from `./growthValue`.
- Produces: `assembleFloor` sets `growth_value` from `computeGrowthValue(...)` using `moatReading.signal`, the EPV mid per share, and `assetFloor.per_share`.

- [ ] **Step 1: Write the failing test**

Append to `web/src/lib/valuation/epvFloor.check.ts` (before final `console.log`):

```ts
// ── Growth value wired into the floor (spec §1.6) ────────────────────────────
{
  // Same R&D franchise grower as the moat test but with a rising operating-income series.
  const years = [
    { fiscal_year: 2025, revenue: 20_000, operating_margin: 0.40, operating_income: 8_000, net_income: 6_000, effective_tax_rate: 0.15, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500, cash: 3_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 2_000, d_and_a: 800, capex: 1_800, ppe_net: 6_000, working_capital: 2_000 },
    { fiscal_year: 2024, revenue: 17_000, operating_margin: 0.40, operating_income: 6_800, net_income: 5_100, effective_tax_rate: 0.15, shareholders_equity: 9_000, goodwill: 1_000, intangibles: 500, cash: 2_500, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_800, d_and_a: 750, capex: 1_600, ppe_net: 5_500, working_capital: 1_700 },
    { fiscal_year: 2023, revenue: 14_500, operating_margin: 0.40, operating_income: 5_800, net_income: 4_350, effective_tax_rate: 0.15, shareholders_equity: 8_000, goodwill: 1_000, intangibles: 500, cash: 2_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_600, d_and_a: 700, capex: 1_400, ppe_net: 5_000, working_capital: 1_400 },
    { fiscal_year: 2022, revenue: 12_500, operating_margin: 0.40, operating_income: 5_000, net_income: 3_750, effective_tax_rate: 0.15, shareholders_equity: 7_000, goodwill: 1_000, intangibles: 500, cash: 1_800, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_400, d_and_a: 650, capex: 1_200, ppe_net: 4_500, working_capital: 1_200 },
    { fiscal_year: 2021, revenue: 11_000, operating_margin: 0.40, operating_income: 4_400, net_income: 3_300, effective_tax_rate: 0.15, shareholders_equity: 6_000, goodwill: 1_000, intangibles: 500, cash: 1_600, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_200, d_and_a: 600, capex: 1_000, ppe_net: 4_000, working_capital: 1_000 },
  ];
  const floor = computeValuationFloor({ ticker: "GROW", years });
  assert.ok(floor && "kind" in floor && floor.kind === "floor");
  if (floor && "kind" in floor && floor.kind === "floor") {
    assert.strictEqual(floor.moat_reading.signal, "franchise", "grower reads franchise");
    assert.ok(floor.growth_value.assessable, "GV assessable for the franchise grower");
    assert.strictEqual(floor.growth_value.gated_to_zero, false, "franchise → GV not gated");
    assert.ok(floor.growth_value.scenarios.neutral > 0, "franchise grower → positive neutral GV");
    assert.ok(floor.growth_value.per_share.pessimistic <= floor.growth_value.per_share.optimistic + 1e-9, "GV scenarios ordered");
  }

  // A commodity (low margin, EPV ≈ AV) → GV gated to zero.
  const commodityYears = [
    { fiscal_year: 2025, revenue: 20_000, operating_margin: 0.05, operating_income: 1_000, net_income: 700, effective_tax_rate: 0.21, shareholders_equity: 9_000, cash: 200, total_debt: 0, shares_diluted: 1_000, d_and_a: 800, capex: 1_200, ppe_net: 9_000, working_capital: 2_000 },
    { fiscal_year: 2024, revenue: 18_000, operating_margin: 0.05, operating_income: 900, net_income: 650, effective_tax_rate: 0.21, shareholders_equity: 8_500, cash: 180, total_debt: 0, shares_diluted: 1_000, d_and_a: 750, capex: 1_100, ppe_net: 8_500, working_capital: 1_800 },
    { fiscal_year: 2023, revenue: 16_000, operating_margin: 0.05, operating_income: 800, net_income: 600, effective_tax_rate: 0.21, shareholders_equity: 8_000, cash: 160, total_debt: 0, shares_diluted: 1_000, d_and_a: 700, capex: 1_000, ppe_net: 8_000, working_capital: 1_600 },
  ];
  const cFloor = computeValuationFloor({ ticker: "COMM", years: commodityYears });
  assert.ok(cFloor && "kind" in cFloor && cFloor.kind === "floor");
  if (cFloor && "kind" in cFloor && cFloor.kind === "floor") {
    assert.notStrictEqual(cFloor.moat_reading.signal, "franchise", "low-margin commodity is not a franchise");
    assert.strictEqual(cFloor.growth_value.gated_to_zero, true, "non-franchise → GV gated to zero");
    assert.strictEqual(cFloor.growth_value.scenarios.neutral, 0, "gated → GV 0");
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: FAIL — `growth_value.assessable` is the Task-1 placeholder (`false`, never gated).

- [ ] **Step 3: Wire `computeGrowthValue` into `assembleFloor`**

In `web/src/lib/valuation/epvFloor.ts`:

Add import:
```ts
import { computeGrowthValue } from "./growthValue";
```

In `assembleFloor`, after `const moatReading = buildMoatReading(moatRefLamp, assetFloor, shares);`, add:
```ts
  const epvMid = moatRefLamp.assessable && moatRefLamp.per_share_low != null && moatRefLamp.per_share_high != null
    ? (moatRefLamp.per_share_low + moatRefLamp.per_share_high) / 2
    : undefined;
  const growthValue = computeGrowthValue({
    years,
    shares,
    taxRate: tax.rate,
    moatSignal: moatReading.signal,
    epvPerShare: epvMid,
    avPerShare: assetFloor.per_share,
  });
```

Replace the Task-1 placeholder `growth_value: { … }` line in the returned object with:
```ts
    growth_value: growthValue,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: PASS — `epvFloor.check.ts: OK`

- [ ] **Step 5: Type-check + run all valuation checks**

Run: `cd web && npx tsc --noEmit && for f in maintenanceCapex reproductionValue growthValue epvFloor fundamentalsToFloorInput strikeZone; do npx tsx src/lib/valuation/$f.check.ts; done`
Expected: no tsc errors; every check prints `… OK`.

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/valuation-engine-v2-impl
git add web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts
git commit -m "feat(valuation): wire Greenwald growth value into the floor (spec §1.6)"
```

---

## Task 9: Degradation matrix check + SEC read-layer type confirmation

Spec §3 degradation matrix. A dedicated check that drives each "field fully absent" scenario through the full engine and asserts the right layer degrades while the floor is still produced (page-never-crashes contract). Plus confirm `sec/read.ts` annual rows carry the new columns.

**Files:**
- Create: `web/src/lib/valuation/degradation.check.ts`
- Modify (if needed): `web/src/lib/sec/read.ts`

**Interfaces:**
- Consumes: `computeValuationFloor`, the full engine.
- Produces: `degradation.check.ts` (no exports; a runnable assertion script).

- [ ] **Step 1: Write the degradation-matrix check**

Create `web/src/lib/valuation/degradation.check.ts`:

```ts
/**
 * degradation.check.ts — spec §3 degradation matrix. Each "field absent" scenario must
 * degrade only its own layer and still return a floor (the page must never crash).
 * Run: cd web && npx tsx src/lib/valuation/degradation.check.ts
 */
import assert from "node:assert";
import { computeValuationFloor } from "./epvFloor";
import type { ValuationFloorYear } from "./types";

// Rich, healthy base — every field present.
function base(): ValuationFloorYear[] {
  return [
    { fiscal_year: 2025, revenue: 20_000, operating_margin: 0.40, operating_income: 8_000, net_income: 6_000, effective_tax_rate: 0.15, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500, cash: 3_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 2_000, d_and_a: 800, capex: 1_800, ppe_net: 6_000, working_capital: 2_000, stock_based_comp: 300 },
    { fiscal_year: 2024, revenue: 17_000, operating_margin: 0.40, operating_income: 6_800, net_income: 5_100, effective_tax_rate: 0.15, shareholders_equity: 9_000, goodwill: 1_000, intangibles: 500, cash: 2_500, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_800, d_and_a: 750, capex: 1_600, ppe_net: 5_500, working_capital: 1_700, stock_based_comp: 280 },
    { fiscal_year: 2023, revenue: 14_500, operating_margin: 0.40, operating_income: 5_800, net_income: 4_350, effective_tax_rate: 0.15, shareholders_equity: 8_000, goodwill: 1_000, intangibles: 500, cash: 2_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_600, d_and_a: 700, capex: 1_400, ppe_net: 5_000, working_capital: 1_400, stock_based_comp: 260 },
    { fiscal_year: 2022, revenue: 12_500, operating_margin: 0.40, operating_income: 5_000, net_income: 3_750, effective_tax_rate: 0.15, shareholders_equity: 7_000, goodwill: 1_000, intangibles: 500, cash: 1_800, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_400, d_and_a: 650, capex: 1_200, ppe_net: 4_500, working_capital: 1_200, stock_based_comp: 240 },
    { fiscal_year: 2021, revenue: 11_000, operating_margin: 0.40, operating_income: 4_400, net_income: 3_300, effective_tax_rate: 0.15, shareholders_equity: 6_000, goodwill: 1_000, intangibles: 500, cash: 1_600, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_200, d_and_a: 600, capex: 1_000, ppe_net: 4_000, working_capital: 1_000, stock_based_comp: 220 },
  ];
}

function strip(field: keyof ValuationFloorYear): ValuationFloorYear[] {
  return base().map((y) => ({ ...y, [field]: undefined }));
}

function asFloor(input: ReturnType<typeof base>) {
  const f = computeValuationFloor({ ticker: "DEG", years: input });
  assert.ok(f && "kind" in f && f.kind === "floor", "floor produced (no crash)");
  return f as Extract<ReturnType<typeof computeValuationFloor>, { kind: "floor" }>;
}

// Baseline sanity: everything present → all layers live.
{
  const f = asFloor(base());
  assert.ok(f.graham_epv.assessable && f.buffett_epv.assessable, "base: EPV + OE live");
  assert.ok(f.asset_floor.assessable && f.asset_floor.capitalized_rd != null, "base: AV with R&D");
  assert.ok(f.growth_value.assessable && !f.growth_value.gated_to_zero, "base: GV live");
}

// capex absent → maintenance capex degrades → EPV/OE fall back to v1 parity; AV/GV survive or degrade, no crash.
{
  const f = asFloor(strip("capex"));
  assert.ok(f.graham_epv.assessable, "no capex: EPV still assessable (v1 fallback)");
  assert.ok(f.graham_epv.method.simplifications.some((s) => s.toLowerCase().includes("degraded") || s.toLowerCase().includes("maintenance capex = d&a")), "no capex: EPV notes the degradation");
}

// rd_expense absent → AV degrades to tangible book (capitalized_rd undefined), no crash.
{
  const f = asFloor(strip("rd_expense"));
  assert.ok(f.asset_floor.assessable, "no R&D: AV still on tangible book");
  assert.strictEqual(f.asset_floor.capitalized_rd, undefined, "no R&D: no capitalized R&D");
}

// working_capital absent → GV still computes (ΔNWC term drops to 0), no crash.
{
  const f = asFloor(strip("working_capital"));
  assert.ok(f.growth_value.assessable || f.growth_value.gated_to_zero, "no WC: GV degrades gracefully, no crash");
}

// ppe_net absent → maintenance capex loses two methods but D&A proxy survives; floor intact.
{
  const f = asFloor(strip("ppe_net"));
  assert.ok(f.graham_epv.assessable, "no PP&E: EPV survives on D&A-proxy maintenance");
}

// d_and_a absent → EPV/OE degrade to v1 parity; floor intact.
{
  const f = asFloor(strip("d_and_a"));
  assert.ok(f.graham_epv.assessable && f.buffett_epv.assessable, "no D&A: EPV/OE survive via v1 fallback");
  assert.strictEqual(f.buffett_epv.sbc_to_oe_pct != null, true, "no D&A: SBC disclosure still computed");
}

// operating_income absent (bank-like) → single-lamp; GV not assessable; floor intact.
{
  const noOpInc = base().map((y) => ({ ...y, operating_income: undefined, operating_margin: undefined }));
  const f = asFloor(noOpInc);
  assert.ok(f.buffett_epv.assessable, "bank-like: owner-earnings lamp survives");
  assert.strictEqual(f.graham_epv.assessable, false, "bank-like: NOPAT lamp not applicable");
  assert.strictEqual(f.growth_value.assessable, false, "bank-like: GV not assessable (no NOPAT)");
}

console.log("degradation.check.ts: OK");
```

- [ ] **Step 2: Run the check to verify it passes (engine already handles these)**

Run: `cd web && npx tsx src/lib/valuation/degradation.check.ts`
Expected: PASS — `degradation.check.ts: OK`. If any assertion fails, the corresponding degradation branch in Tasks 2–8 has a gap; fix the engine (not the test) to honor "degrade, don't crash", then re-run.

- [ ] **Step 3: Confirm the SEC read layer carries the new columns**

`getSecCompanyData` in `web/src/lib/sec/read.ts` already does `company_fundamentals_periods.select("*")` and filters FY rows into `annual`, typed loosely (`any`). The mapper reads each new field off the row, so no query change is needed. Confirm by inspection that `select("*")` is present (it is, line ~53) and that `annual` rows are passed straight to `fundamentalsToFloorInput` in `page.tsx`. No code change unless `select` is column-limited — if so, leave `*` as-is. Document "no change needed" in the commit body.

- [ ] **Step 4: Add the re-export**

Confirm `web/src/lib/valuation/index.ts` exports all three new modules (added in Tasks 2–4). No new export needed for the check files (checks are not imported).

- [ ] **Step 5: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/valuation-engine-v2-impl
git add web/src/lib/valuation/degradation.check.ts
git commit -m "test(valuation): degradation matrix — each missing field degrades its layer, never crashes (spec §3)"
```

---

## Task 10: Integration — tsc + build + real-data QA

Spec §3 integration + real-data QA. Final green gate.

**Files:**
- No source changes (verification only). If a real-data QA finding reveals a bug, fix it in the owning module and re-run that module's check first.

**Interfaces:** none (verification task).

- [ ] **Step 1: Run every valuation check**

Run:
```bash
cd web && for f in maintenanceCapex reproductionValue growthValue epvFloor fundamentalsToFloorInput strikeZone degradation; do echo "== $f =="; npx tsx src/lib/valuation/$f.check.ts || break; done
```
Expected: each prints `<name>.check.ts: OK`.

- [ ] **Step 2: Type-check the whole app**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build (real packages from npm ci)**

Run: `cd web && npm run build`
Expected: build succeeds. (If Turbopack errors about `node_modules`, confirm `npm ci` ran in this worktree — never symlink.)

- [ ] **Step 4: Real-data QA against production Supabase**

Ensure `web/.env.local` is present (copied in Task 0). Start the dev server and inspect the three QA tickers picked in Task 0 (defaults below if data confirmed them):

```bash
cd web && npm run dev
```
Using the preview/browser tools, load each stock page and read the valuation card + (for engine internals) optionally a one-off tsx probe. Verify:
- **AI-hog (AAPL / GOOG / META):** maintenance capex > D&A (EPV pressed below `NOPAT/WACC`); `ai_capex_distortion_warning` may fire; R&D capitalized into AV; moat reads `franchise`; GV three scenarios present and ordered. Page returns 200.
- **No-R&D / no-moat name:** AV = tangible book (no capitalized R&D); moat `commodity` or `value_destruction`; GV gated to 0. Page 200.
- **Thin name (missing `working_capital` or `capex`):** the dependent layer degrades with an honest note; page returns 200 (not a 404/500).

For deterministic engine-level QA without the UI, a one-off probe is allowed:
```bash
cd web && npx tsx --env-file=.env.local -e "import('@/lib/sec/read').then(async m => { const d = await m.getSecCompanyData('AAPL'); const v = await import('@/lib/valuation'); const f = v.computeValuationFloor(v.fundamentalsToFloorInput('AAPL','Apple', d.annual)); console.dir(f, {depth: 5}); })"
```
Expected: a `floor` object with maintenance-capex-corrected EPV, R&D in AV, franchise moat, and GV scenarios. Record observations.

> Per the global data-accuracy rule: note the as-of fiscal year and that figures are SEC XBRL-derived. If live data contradicts an expectation (e.g. AAPL not reading franchise), investigate before claiming success — do not adjust the test to pass.

- [ ] **Step 5: Confirm `.env.local` is not staged**

Run: `cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/valuation-engine-v2-impl && git status --porcelain | grep -v "^??" ; git status --porcelain | grep ".env.local" || echo "env not tracked — good"`
Expected: `env not tracked — good`.

- [ ] **Step 6: Final commit (QA notes)**

Append a "## Task 10 QA findings" section to this plan with the recorded observations (as-of years, the three tickers' readings), then:
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/valuation-engine-v2-impl
git add docs/superpowers/plans/2026-06-21-valuation-engine-v2-canonical.md
git commit -m "docs(valuation): engine v2 real-data QA findings"
```

---

## Acceptance (spec §3)

- [ ] All `.check.ts` green: maintenanceCapex (four-method / AI rule / divergence / degrade), reproductionValue (capitalized R&D / AV / fallbacks), EPV (write A no tax shield / D&A==maintCapex parity / no double deduction / bridge / high-leverage), Owner Earnings (= NI + D&A − maintCapex, no ΔNWC, no SBC add-back, SBC% disclosed), moat (EPV vs AV three bands), GV (franchise gate / ROIIC≤WACC→0 / cumulative endpoint-aligned ROIIC / duration by strength / three scenarios / ΔNWC not doubled), degradation matrix.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` clean (worktree with real `node_modules`).
- [ ] Real-data QA: AAPL/GOOG/META show AI-hog EPV pressed down + R&D in AV + franchise + GV three scenarios; a no-R&D/no-moat name shows AV=tangible book + GV=0; a thin name degrades the dependent layer with page 200.
- [ ] Compliance: no BUY/SELL/target/rating; output = conservative ranges + moat direction + provenance with as-of + fiscal years + degradation/simplification notes.

## Handoff / merge

Clean commits on `feat/valuation-engine-v2`. `gh` auth in this repo ≠ push identity — the PR is opened manually by the user (from `feat/valuation-engine-v2` into `db-foundation`). Presentation layer (valuation band + price position + historical anchor + three-scenario viz) is a separate downstream spec layered on this faithful engine.
