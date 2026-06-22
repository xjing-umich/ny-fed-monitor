# Valuation Presentation Layer v2 — Value Band + Price Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-produced engine-v2 fields (`growth_value.per_share` three scenarios, reproduction-value `asset_floor.per_share`, `moat_reading.franchise_value`) into the strike-zone derivation and the floor card, upgrading the "band" from zero-growth-only to `max(AV,EPV) → +GV` and the price position from 3 tiers to 5/6 tiers — fixing the presentation-side disease where quality compounders always read "above floor".

**Architecture:** Two deliverables. (1) **Engine** — `deriveStrikeZone` folds reproduction value (AV) into the conservative floor/base and layers the three GV scenarios on top to produce a monotonic value band (`valueFloor ≤ base ≤ pess ≤ neut ≤ opt`) plus a 5/6-tier `position`, while strictly retaining the v1 `zone`/`floorConservative`/`ceiling`/`mosLow`/`mosHigh` fields for backward compatibility. (2) **Presentation** — the RSC card renders the upgraded band (AV tick · two EPV lamp ranges · zero-growth base line · three GV ceiling ticks · shaded strike segment · price marker), a 5/6-tier position sentence, a three-scenario GV summary line, a reproduction-value callout, a moat/franchise callout, and an updated disclaimer. All degradations (GV collapsed, AV not assessable, currency mismatch, floor undefined) are honest and explicit.

**Tech Stack:** TypeScript, Next.js (App Router, React Server Components — NO `"use client"`), `npx tsx` + `node:assert` self-checks (no test framework — see [[no-tests-solo-dev]]), Tailwind with `--tt-*` design tokens, `font-mono tabular-nums`.

## Global Constraints

Copied verbatim from the spec — every task's requirements implicitly include these:

- **Value band math (spec §1):** `EPV_low = min(assessable lamp per_share_low)`, `EPV_high = max(assessable lamp per_share_high)`, `AV_ps = asset_floor.per_share` (when assessable). `valueFloor = max(AV_ps, EPV_low)`; `valueBaseZeroGrowth = max(AV_ps, EPV_high)`; `valueCeiling[s] = valueBaseZeroGrowth + growth_value.per_share[s]` for `s ∈ {pessimistic, neutral, optimistic}`. **Do not change these formulas.**
- **Monotonic:** `valueFloor ≤ valueBaseZeroGrowth ≤ ceiling_pess ≤ ceiling_neut ≤ ceiling_opt` (holds because GV≥0 and the three scenarios are ordered).
- **5-tier position (spec §2)**, all using named constant `GRAHAM_MOS = 1/3`:
  1. `in_strike_zone`: `price ≤ valueFloor × (1 − ⅓)`
  2. `approaching`: `valueFloor × ⅔ < price ≤ valueFloor`
  3. `zero_growth_zone`: `valueFloor < price ≤ base`
  4. `moat_band`: `base < price ≤ ceiling_neutral`
  5a. `upper_band`: `ceiling_neutral < price ≤ ceiling_optimistic`
  5b. `above_optimistic`: `price > ceiling_optimistic`
- **Degradation (spec §1, §2):** GV `gated_to_zero` OR not assessable → the three ceilings collapse to `base`, position falls back to 4 states {1,2,3, `above_zero_growth`} with an honest "no growth value" note. AV not assessable → `valueFloor`/`base` use EPV-only. Floor `undefined` (foreign IFRS filer) → whole valuation block not rendered (already gated at the page). `currency ≠ USD` → price section degrades (existing behavior, keep).
- **"Position", never a verdict (spec §8):** No BUY/SELL/HOLD, no target price, no rating. Every tier is "where the price sits in your conservative→optimistic range — the judgment is yours." Mandatory disclaimer retained + updated: growth value = moat gate open + conservative + NOT a prediction / NOT a target price. Every conclusion is stamped with as-of / fiscal year / degradation flags (GV collapsed, AV missing, single-WACC band, etc.).
- **RSC discipline:** No `"use client"`. Colors via `--tt-*` tokens only. Numbers in `font-mono tabular-nums`.
- **Backward compatibility:** Existing three-tier ticks (GV=0) keep identical `zone`/`floorConservative`/`ceiling`/`mosLow`/`mosHigh` behavior. Retain those fields.
- **Out of scope — DO NOT TOUCH:** engine pure functions (`epvFloor`/`growthValue`/`reproductionValue`/`maintenanceCapex`/…), ingest, `/research`, the price layer, `page.tsx` logic (it already passes `floor` with `growth_value` + `strikeZone`).

---

## File Structure

- `web/src/lib/valuation/types.ts` — **modify.** Add `ValuePosition` union; extend `StrikeZoneAssessment.epv` with `valueFloor`, `base`, `ceilings?`, `position`, `growthCollapsed`. Keep `StrikeZone` (3-tier) and all existing `epv` fields.
- `web/src/lib/valuation/strikeZone.ts` — **modify.** In the `if (hasEpv)` branch, compute the value band + position; keep the v1 zone/MoS math intact.
- `web/src/lib/valuation/strikeZone.check.ts` — **modify.** Add assertions for band monotonicity, 5/6-tier boundaries, GV collapse → 4-tier, AV folding, AV-absent EPV-only, backward compat.
- `web/src/components/valuation/EarningsPowerFloorCard.tsx` — **modify.** Upgrade `StrikeBand`, replace `ZoneBadge`/sentence with the 5/6-tier position, add GV three-scenario line + reproduction-value callout + moat/franchise callout + updated disclaimer.
- `web/src/app/[lang]/stocks/[ticker]/page.tsx` — **no change** (verify only).

---

## Task 1: Value-band engine + 5/6-tier position classification

**Files:**
- Modify: `web/src/lib/valuation/types.ts`
- Modify: `web/src/lib/valuation/strikeZone.ts:73-89` (the `if (hasEpv)` block + return)
- Test: `web/src/lib/valuation/strikeZone.check.ts`

**Interfaces:**
- Consumes: `ValuationFloor` (`graham_epv`/`buffett_epv` `per_share_low|high`, `asset_floor.assessable`/`.per_share`, `growth_value.{assessable,gated_to_zero,per_share:{pessimistic,neutral,optimistic},roiic,duration_years,wacc_band}`), `LatestPrice`, `GRAHAM_MOS`.
- Produces (consumed by Task 2):
  - `export type ValuePosition = "in_strike_zone" | "approaching" | "zero_growth_zone" | "moat_band" | "upper_band" | "above_optimistic" | "above_zero_growth";`
  - `StrikeZoneAssessment.epv` gains: `valueFloor: number`, `base: number`, `ceilings?: { pessimistic: number; neutral: number; optimistic: number }`, `position: ValuePosition`, `growthCollapsed: boolean`. (Existing `zone`, `floorConservative`, `ceiling`, `mosLow`, `mosHigh` unchanged.)
  - `deriveStrikeZone(floor, price, now?)` signature unchanged; richer `epv` payload.

- [ ] **Step 1: Extend types** in `web/src/lib/valuation/types.ts`

Add the `ValuePosition` union immediately after the `StrikeZone` line (line 91):

```ts
// ── Strike zone (price vs. floor) ────────────────────────────────────────────
export type StrikeZone = "in_strike_zone" | "approaching" | "outside";

/**
 * v2 value-band position (spec §2). Where price.close sits in the conservative→
 * optimistic value band. An OBSERVATION, never a verdict. Tiers 4/5 exist only
 * when growth value is assessable; otherwise the band collapses to the four
 * zero-growth states (…|"above_zero_growth"). GRAHAM_MOS=1/3 drives tier 1↔2.
 */
export type ValuePosition =
  | "in_strike_zone"      // price ≤ valueFloor × (1 − 1/3)
  | "approaching"         // valueFloor × 2/3 < price ≤ valueFloor
  | "zero_growth_zone"    // valueFloor < price ≤ base
  | "moat_band"           // base < price ≤ ceiling_neutral
  | "upper_band"          // ceiling_neutral < price ≤ ceiling_optimistic
  | "above_optimistic"    // price > ceiling_optimistic
  | "above_zero_growth";  // GV collapsed: price > base, no growth ceilings
```

Then extend the `epv?:` object inside `StrikeZoneAssessment` (currently lines 108-118). Replace that block with:

```ts
  /** EPV strike zone — present only when ≥1 EPV lamp is assessable with a positive per_share_low AND currency matches. */
  epv?: {
    // ── v1 backward-compat fields (UNCHANGED computation — zero behavior change) ──
    zone: StrikeZone;
    /** Global-minimum assessable per_share_low across lamps — EPV_low, the conservative reference. */
    floorConservative: number;
    /** Global-maximum assessable per_share_high across lamps — EPV_high, the zero-growth ceiling. */
    ceiling: number;
    /** Margin of safety vs floorConservative — the conservative end; drives `zone`. */
    mosLow: number;
    /** Margin of safety vs ceiling — the optimistic end of the zero-growth range. */
    mosHigh: number;
    // ── v2 value band (spec §1) ──
    /** max(AV_ps, EPV_low) — conservative floor that drives the strike zone (folds reproduction value). */
    valueFloor: number;
    /** valueBaseZeroGrowth = max(AV_ps, EPV_high) — top of the zero-growth value. */
    base: number;
    /** base + growth_value.per_share[s]. Undefined when growth value collapsed (gated/not assessable/non-finite). */
    ceilings?: { pessimistic: number; neutral: number; optimistic: number };
    /** 5/6-tier price position over the value band. */
    position: ValuePosition;
    /** true when growth value is gated_to_zero / not assessable / non-finite → ceilings undefined, position degrades to 4 tiers. */
    growthCollapsed: boolean;
  };
```

- [ ] **Step 2: Write the failing tests** — append to `web/src/lib/valuation/strikeZone.check.ts` (before the final `console.log`)

First, the existing `makeFloor` helper does not accept a growth-value override. Replace its signature and body (lines 29-44) so tests can inject an assessable GV and an AV:

```ts
function makeFloor(o: { graham?: Partial<EpvLamp>; buffett?: Partial<EpvLamp>; asset?: Partial<AssetFloor>; growth?: Partial<GrowthValue> }): ValuationFloor {
  return {
    kind: "floor",
    graham_epv: lamp(o.graham ?? {}),
    buffett_epv: lamp(o.buffett ?? {}),
    asset_floor: asset(o.asset ?? {}),
    moat_reading: MOAT,
    growth_value: { ...STUB_GROWTH_VALUE, ...o.growth },
    high_leverage_warning: false,
    provenance: {
      years_used: [2023, 2024, 2025], discount_rate_band: [0.08, 0.1],
      normalized_tax_rate: 0.15, normalized_tax_rate_basis: "avg",
      maintenance_capex_rule: "—", share_count_basis: "diluted",
    },
  };
}
```

Then append the new assertion block:

```ts
// ════════════════════════════════════════════════════════════════════════════
// v2 value band + 5/6-tier position
// ════════════════════════════════════════════════════════════════════════════

// Reference v2 floor: EPV_low=90, EPV_high=130 (from `floor` above), assessable GV
// per_share pess=10 / neut=30 / opt=70, AV not assessable.
// → valueFloor=90, base=130, ceilings = {100, 160, 200}.
const gvFloor = makeFloor({
  graham: { per_share_low: 90, per_share_high: 110 },
  buffett: { per_share_low: 100, per_share_high: 130 },
  growth: { assessable: true, gated_to_zero: false, per_share: { pessimistic: 10, neutral: 30, optimistic: 70 }, roiic: 0.18, duration_years: 10, wacc_band: [0.08, 0.1] },
});

// ── band fields + monotonicity ──
const band = deriveStrikeZone(gvFloor, px(120), NOW)!.epv!;
assert.strictEqual(band.valueFloor, 90, "valueFloor = max(AV none, EPV_low 90) = 90");
assert.strictEqual(band.base, 130, "base = max(AV none, EPV_high 130) = 130");
assert.deepStrictEqual(band.ceilings, { pessimistic: 100, neutral: 160, optimistic: 200 }, "ceilings = base + GV per_share");
assert.strictEqual(band.growthCollapsed, false, "assessable non-gated GV → not collapsed");
assert.ok(
  band.valueFloor <= band.base &&
    band.base <= band.ceilings!.pessimistic &&
    band.ceilings!.pessimistic <= band.ceilings!.neutral &&
    band.ceilings!.neutral <= band.ceilings!.optimistic,
  "value band is monotonic",
);

// ── 6-tier position boundaries (valueFloor=90, base=130, neut=160, opt=200) ──
// strikeMax = 90 × 2/3 = 60.
assert.strictEqual(deriveStrikeZone(gvFloor, px(60), NOW)!.epv!.position, "in_strike_zone", "price 60 = strikeMax → in_strike_zone");
assert.strictEqual(deriveStrikeZone(gvFloor, px(60.01), NOW)!.epv!.position, "approaching", "just above strikeMax → approaching");
assert.strictEqual(deriveStrikeZone(gvFloor, px(90), NOW)!.epv!.position, "approaching", "price = valueFloor → approaching (≤ boundary)");
assert.strictEqual(deriveStrikeZone(gvFloor, px(90.01), NOW)!.epv!.position, "zero_growth_zone", "just above valueFloor → zero_growth_zone");
assert.strictEqual(deriveStrikeZone(gvFloor, px(130), NOW)!.epv!.position, "zero_growth_zone", "price = base → zero_growth_zone (≤ boundary)");
assert.strictEqual(deriveStrikeZone(gvFloor, px(130.01), NOW)!.epv!.position, "moat_band", "just above base → moat_band");
assert.strictEqual(deriveStrikeZone(gvFloor, px(160), NOW)!.epv!.position, "moat_band", "price = ceiling_neutral → moat_band (≤ boundary)");
assert.strictEqual(deriveStrikeZone(gvFloor, px(160.01), NOW)!.epv!.position, "upper_band", "just above ceiling_neutral → upper_band");
assert.strictEqual(deriveStrikeZone(gvFloor, px(200), NOW)!.epv!.position, "upper_band", "price = ceiling_optimistic → upper_band (≤ boundary)");
assert.strictEqual(deriveStrikeZone(gvFloor, px(200.01), NOW)!.epv!.position, "above_optimistic", "above ceiling_optimistic → above_optimistic");

// ── GV gated_to_zero → collapse to 4 tiers, no ceilings ──
const gated = makeFloor({
  graham: { per_share_low: 90, per_share_high: 110 },
  buffett: { per_share_low: 100, per_share_high: 130 },
  growth: { assessable: true, gated_to_zero: true, per_share: { pessimistic: 0, neutral: 0, optimistic: 0 } },
});
const gatedBand = deriveStrikeZone(gated, px(150), NOW)!.epv!;
assert.strictEqual(gatedBand.growthCollapsed, true, "gated_to_zero → collapsed");
assert.strictEqual(gatedBand.ceilings, undefined, "gated → no ceilings");
assert.strictEqual(gatedBand.position, "above_zero_growth", "gated + price>base → above_zero_growth (4th tier)");
assert.strictEqual(deriveStrikeZone(gated, px(120), NOW)!.epv!.position, "zero_growth_zone", "gated + floor<price≤base → zero_growth_zone");
assert.strictEqual(deriveStrikeZone(gated, px(60), NOW)!.epv!.position, "in_strike_zone", "gated tiers 1-3 still work");

// ── GV not assessable → also collapsed (the existing STUB) ──
const noGv = deriveStrikeZone(floor, px(150), NOW)!.epv!;
assert.strictEqual(noGv.growthCollapsed, true, "not-assessable GV → collapsed");
assert.strictEqual(noGv.ceilings, undefined, "not-assessable GV → no ceilings");
assert.strictEqual(noGv.position, "above_zero_growth", "not-assessable GV + price>base → above_zero_growth");

// ── AV folds into valueFloor/base when AV exceeds the EPV ends ──
const avHigh = makeFloor({
  graham: { per_share_low: 90, per_share_high: 110 },
  buffett: { per_share_low: 100, per_share_high: 130 },
  asset: { assessable: true, per_share: 150 },
  growth: { assessable: true, gated_to_zero: false, per_share: { pessimistic: 10, neutral: 30, optimistic: 70 }, wacc_band: [0.08, 0.1] },
});
const avBand = deriveStrikeZone(avHigh, px(120), NOW)!.epv!;
assert.strictEqual(avBand.valueFloor, 150, "valueFloor = max(AV 150, EPV_low 90) = 150");
assert.strictEqual(avBand.base, 150, "base = max(AV 150, EPV_high 130) = 150");
assert.deepStrictEqual(avBand.ceilings, { pessimistic: 160, neutral: 180, optimistic: 220 }, "ceilings stack on AV-raised base");

// ── AV not assessable → valueFloor/base are EPV-only (no AV) ──
assert.strictEqual(band.valueFloor, band.floorConservative, "AV absent → valueFloor == EPV_low");
assert.strictEqual(band.base, band.ceiling, "AV absent → base == EPV_high");

// ── backward compat: v1 fields on a GV=0 tick unchanged (zone/floorConservative/ceiling/MoS) ──
const bc = deriveStrikeZone(floor, px(60), NOW)!.epv!;
assert.strictEqual(bc.zone, "in_strike_zone", "v1 zone unchanged");
assert.strictEqual(bc.floorConservative, 90, "v1 floorConservative unchanged");
assert.strictEqual(bc.ceiling, 130, "v1 ceiling unchanged");
assert.ok(Math.abs(bc.mosLow - 1 / 3) < 1e-9, "v1 mosLow unchanged");
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd web && npx tsx src/lib/valuation/strikeZone.check.ts`
Expected: FAIL — TypeScript/runtime error such as `band.valueFloor` is `undefined` / property does not exist (the engine does not yet emit `valueFloor`/`base`/`ceilings`/`position`/`growthCollapsed`).

- [ ] **Step 4: Implement the value band** in `web/src/lib/valuation/strikeZone.ts`

Add the `ValuePosition` import on line 6:

```ts
import type { StrikeZone, StrikeZoneAssessment, ValuationFloor, ValuePosition } from "./types";
```

Replace the `if (hasEpv) { … }` block (currently lines 73-83) with:

```ts
  let epv: StrikeZoneAssessment["epv"];
  if (hasEpv) {
    // v1 fields (UNCHANGED): each lamp's high >= low, so ceiling (max high) >= floorConservative (min low).
    const floorConservative = Math.min(...lows); // EPV_low
    const ceiling = Math.max(...highs);          // EPV_high (zero-growth top)
    const mosLow = (floorConservative - price.close) / floorConservative;
    const mosHigh = (ceiling - price.close) / ceiling;
    const zone: StrikeZone = mosLow >= GRAHAM_MOS ? "in_strike_zone" : mosLow >= 0 ? "approaching" : "outside";

    // v2 value band (spec §1): fold reproduction value (AV) into floor/base, layer GV ceilings.
    const avPs = hasAsset ? (floor.asset_floor.per_share as number) : undefined;
    const valueFloor = avPs != null ? Math.max(avPs, floorConservative) : floorConservative;
    const base = avPs != null ? Math.max(avPs, ceiling) : ceiling;

    const gv = floor.growth_value;
    const ps = gv.per_share;
    const gvUsable =
      gv.assessable &&
      !gv.gated_to_zero &&
      [ps.pessimistic, ps.neutral, ps.optimistic].every((n) => Number.isFinite(n) && n >= 0);
    const growthCollapsed = !gvUsable;
    const ceilings = gvUsable
      ? { pessimistic: base + ps.pessimistic, neutral: base + ps.neutral, optimistic: base + ps.optimistic }
      : undefined;

    // 5/6-tier position. strikeMax = valueFloor × (1 − 1/3); GRAHAM_MOS reused.
    const strikeMax = valueFloor * (1 - GRAHAM_MOS);
    let position: ValuePosition;
    if (price.close <= strikeMax) position = "in_strike_zone";
    else if (price.close <= valueFloor) position = "approaching";
    else if (price.close <= base) position = "zero_growth_zone";
    else if (!ceilings) position = "above_zero_growth";
    else if (price.close <= ceilings.neutral) position = "moat_band";
    else if (price.close <= ceilings.optimistic) position = "upper_band";
    else position = "above_optimistic";

    epv = { zone, floorConservative, ceiling, mosLow, mosHigh, valueFloor, base, ceilings, position, growthCollapsed };
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx tsx src/lib/valuation/strikeZone.check.ts`
Expected: PASS — prints `strikeZone.check.ts: OK`.

- [ ] **Step 6: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/valuation/types.ts web/src/lib/valuation/strikeZone.ts web/src/lib/valuation/strikeZone.check.ts
git commit -m "feat(valuation): value band (AV+EPV→+GV) + 5/6-tier price position in deriveStrikeZone"
```

---

## Task 2: Card presentation v2 — band, 5/6-tier position, GV/AV/moat callouts

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`
- Verify (no change): `web/src/app/[lang]/stocks/[ticker]/page.tsx`

**Interfaces:**
- Consumes: `StrikeZoneAssessment` (now with `epv.{valueFloor,base,ceilings,position,growthCollapsed}`), `ValuePosition`, `ValuationFloor` (`asset_floor.{tangible_net_assets,capitalized_rd,rd_years_used}`, `moat_reading.{signal,franchise_value}`, `growth_value.{roiic,duration_years,wacc_band,gated_to_zero,assessable,per_share}`), `GRAHAM_MOS`.
- Produces: visual card only. No exported API change.

This task has no unit-test framework (RSC presentation — see [[no-tests-solo-dev]]); it is verified by `tsc --noEmit`, `npm run build`, and real-data QA (Task 3).

- [ ] **Step 1: Add the position label/tone maps + import** — `EarningsPowerFloorCard.tsx`

Update the import on line 3 to add `ValuePosition`:

```ts
import type { EpvLamp, MoatSignal, PerShareUnavailable, StrikeZone, StrikeZoneAssessment, ValuationFloor, ValuePosition } from "@/lib/valuation";
```

After the existing `ZONE_TONE` map (line 76), add the 5/6-tier maps (keep `ZONE_LABEL`/`ZONE_TONE`/`ZoneBadge` — they are still referenced by nothing after this task, so DELETE `ZONE_LABEL`, `ZONE_TONE`, and `ZoneBadge` to avoid dead code, and add):

```ts
const POSITION_LABEL: Record<ValuePosition, string> = {
  in_strike_zone: "In strike zone",
  approaching: "Approaching",
  zero_growth_zone: "Zero-growth value range",
  moat_band: "Moat-adjusted value band",
  upper_band: "Upper band",
  above_optimistic: "Above optimistic upper bound",
  above_zero_growth: "Above zero-growth value",
};

const POSITION_TONE: Record<ValuePosition, string> = {
  in_strike_zone: "var(--tt-accent)",
  approaching: "var(--tt-warn)",
  zero_growth_zone: "var(--tt-text)",
  moat_band: "var(--tt-text)",
  upper_band: "var(--tt-warn)",
  above_optimistic: "var(--tt-faint)",
  above_zero_growth: "var(--tt-faint)",
};

function PositionBadge({ position }: { position: ValuePosition }) {
  const tone = POSITION_TONE[position];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]"
      style={{ color: tone, borderColor: tone }}
    >
      {POSITION_LABEL[position]}
    </span>
  );
}
```

- [ ] **Step 2: Upgrade the `StrikeBand`** — replace the whole `StrikeBand` function (lines 90-160) with the value-band version (AV tick · two EPV lamp ranges · base line · three GV ceiling ticks · shaded strike segment ≤ valueFloor×⅔ · price marker):

```ts
// Static value-band number line (spec §5): shaded strike segment (≤ valueFloor×⅔),
// two EPV lamp ranges, AV tick, zero-growth base line, three GV ceiling ticks
// (pess/neut/opt), current-price marker. RSC, no hydration — geometry is inline %.
function StrikeBand({ floor, sz }: { floor: ValuationFloor; sz: StrikeZoneAssessment }) {
  const { graham_epv, buffett_epv } = floor;
  const epv = sz.epv;
  if (!epv) return null;
  const candidates = [
    sz.price.close,
    epv.valueFloor,
    epv.base,
    epv.ceilings?.optimistic,
    sz.assetFloor?.perShare,
    graham_epv.assessable ? graham_epv.per_share_high : undefined,
    buffett_epv.assessable ? buffett_epv.per_share_high : undefined,
  ].filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const domainMax = (candidates.length ? Math.max(...candidates) : sz.price.close) * 1.08 || 1;
  const xPct = (v: number) => Math.max(0, Math.min(100, (v / domainMax) * 100));
  const strikeMax = epv.valueFloor * (1 - GRAHAM_MOS);
  const lampBand = (lamp: EpvLamp, top: string) =>
    lamp.assessable && finitePositive(lamp.per_share_low) && finitePositive(lamp.per_share_high) ? (
      <div
        className="absolute h-1.5 rounded-full bg-[var(--tt-faint)]"
        style={{ left: `${xPct(lamp.per_share_low)}%`, width: `${xPct(lamp.per_share_high) - xPct(lamp.per_share_low)}%`, top }}
        title={`${lamp.label}: ${range(lamp.per_share_low, lamp.per_share_high)}`}
      />
    ) : null;
  const ceilingTick = (value: number, label: string, tone: string) => (
    <div
      className="absolute top-1/4 h-1/2 w-px"
      style={{ left: `${xPct(value)}%`, backgroundColor: tone }}
      title={`${label} ${perShare(value)}`}
    />
  );

  return (
    <div className="mt-2">
      <div className="relative h-14 w-full">
        {/* baseline */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--tt-border)]" />
        {/* shaded strike-zone segment: price <= valueFloor × (1 − 1/3) */}
        <div
          className="absolute top-1/2 h-9 -translate-y-1/2 rounded-sm border"
          style={{
            left: 0,
            width: `${xPct(strikeMax)}%`,
            backgroundColor: "color-mix(in srgb, var(--tt-accent) 12%, transparent)",
            borderColor: "color-mix(in srgb, var(--tt-accent) 35%, transparent)",
          }}
          aria-hidden
        />
        {/* two EPV lamp ranges */}
        {lampBand(graham_epv, "30%")}
        {lampBand(buffett_epv, "60%")}
        {/* zero-growth base line */}
        <div
          className="absolute inset-y-0 w-px bg-[var(--tt-muted)]"
          style={{ left: `${xPct(epv.base)}%` }}
          title={`Zero-growth base ${perShare(epv.base)}`}
        />
        {/* three GV ceiling ticks (pess/neut/opt) — only when growth value assessable */}
        {epv.ceilings ? (
          <>
            {ceilingTick(epv.ceilings.pessimistic, "Growth value (pessimistic)", "var(--tt-faint)")}
            {ceilingTick(epv.ceilings.neutral, "Growth value (neutral)", "var(--tt-accent)")}
            {ceilingTick(epv.ceilings.optimistic, "Growth value (optimistic)", "var(--tt-faint)")}
          </>
        ) : null}
        {/* asset-floor tick */}
        {sz.assetFloor ? (
          <div
            className="absolute top-1/4 h-1/2 w-px bg-[var(--tt-muted)]"
            style={{ left: `${xPct(sz.assetFloor.perShare)}%` }}
            title={`Reproduction value ${perShare(sz.assetFloor.perShare)}`}
          />
        ) : null}
        {/* current-price marker (full height) */}
        <div
          className="absolute inset-y-0 w-0.5 bg-[var(--tt-accent)]"
          style={{ left: `${xPct(sz.price.close)}%` }}
          title={`Price ${perShare(sz.price.close)}`}
        />
      </div>
      {/* legend */}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-[var(--tt-faint)]">
        <span style={{ color: "var(--tt-accent)" }}>▏Price {perShare(sz.price.close)}</span>
        <span>▢ Strike zone ≤ {perShare(strikeMax)}</span>
        <span>EPV ranges (two lenses)</span>
        <span>Zero-growth base {perShare(epv.base)}</span>
        {epv.ceilings ? <span>Growth ceilings {perShare(epv.ceilings.pessimistic)}–{perShare(epv.ceilings.optimistic)}</span> : null}
        {sz.assetFloor ? <span>Reproduction value {perShare(sz.assetFloor.perShare)}</span> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `StrikeZoneSection`** — replace the function (lines 162-219) with the 5/6-tier version + GV three-scenario line + updated disclaimer:

```ts
const POSITION_SENTENCE: Record<ValuePosition, (sz: StrikeZoneAssessment) => string> = {
  in_strike_zone: (sz) =>
    `At ${perShare(sz.price.close)}, the price sits inside the strike zone — at least a one-third margin of safety below the conservative value floor (max of reproduction value and zero-growth earnings power).`,
  approaching: (sz) =>
    `At ${perShare(sz.price.close)}, the price is approaching the strike zone, but the margin of safety is still under one-third of the conservative value floor.`,
  zero_growth_zone: (sz) =>
    `At ${perShare(sz.price.close)}, the price is within the zero-growth value range — above the conservative floor but at or below what the business is worth assuming no growth at all.`,
  moat_band: (sz) =>
    `At ${perShare(sz.price.close)}, the price is within the moat-adjusted value band — above zero-growth value but at or below the neutral growth-value upper bound. A quality compounder finally has a place to sit here, rather than reading simply "too expensive".`,
  upper_band: (sz) =>
    `At ${perShare(sz.price.close)}, the price is in the upper band — only the optimistic growth scenario supports today's price.`,
  above_optimistic: (sz) =>
    `At ${perShare(sz.price.close)}, the price is above the optimistic upper bound — beyond even the optimistic moat-driven growth value. This is "expensive" with a basis.`,
  above_zero_growth: (sz) =>
    `At ${perShare(sz.price.close)}, the price is above the zero-growth value. Growth value is not credited here, so there is no moat-adjusted band above this point.`,
};

// One-line three-scenario growth-value summary (spec §4). All assumptions externalized.
function growthSummary(floor: ValuationFloor): string {
  const gv = floor.growth_value;
  if (!gv.assessable) return `Growth value not assessable${gv.not_assessable_reason ? ` — ${gv.not_assessable_reason}` : "."}`;
  if (gv.gated_to_zero) return "Growth value gated to zero — no moat / ROIIC ≤ WACC, so no growth value is credited.";
  const dur = gv.duration_years != null ? `${gv.duration_years} yr` : "the modeled window";
  const roiic = gv.roiic != null ? `ROIIC ≈ ${pct(gv.roiic)}` : "the modeled ROIIC";
  return `If the moat holds for ${dur} at ${roiic}: growth value ${perShare(gv.per_share.pessimistic)}–${perShare(gv.per_share.optimistic)} / share (neutral ${perShare(gv.per_share.neutral)}). Conservative, not a forecast or target price.`;
}

function StrikeZoneSection({ floor, sz }: { floor: ValuationFloor; sz: StrikeZoneAssessment }) {
  // Currency mismatch: suppress the whole comparison, state the reason only.
  if (sz.currencyMismatch) {
    return (
      <div className="border-t border-[var(--tt-border)] pt-3">
        <h4 className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Price vs. value band</h4>
        <p className="mt-1 text-sm text-[var(--tt-muted)]">{sz.suppressedReason}</p>
      </div>
    );
  }

  const epv = sz.epv;
  const sentence = epv
    ? POSITION_SENTENCE[epv.position](sz)
    : `At ${perShare(sz.price.close)}, compared against the tangible asset floor below.`;

  return (
    <div className="space-y-2 border-t border-[var(--tt-border)] pt-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Price vs. value band</h4>
        {epv ? <PositionBadge position={epv.position} /> : null}
      </div>

      <StrikeBand floor={floor} sz={sz} />

      <p className="text-sm text-[var(--tt-text)]">{sentence}</p>

      {epv ? (
        <p className="text-sm text-[var(--tt-muted)]">
          Conservative floor {perShare(epv.valueFloor)} → zero-growth base {perShare(epv.base)}
          {epv.ceilings ? ` → growth ceilings ${perShare(epv.ceilings.pessimistic)}–${perShare(epv.ceilings.optimistic)}` : " · no growth value credited"}.
        </p>
      ) : null}

      {epv ? <p className="text-sm text-[var(--tt-muted)]">{growthSummary(floor)}</p> : null}

      {sz.assetFloor?.priceBelow ? (
        <p className="text-sm text-[var(--tt-text)]">
          Price is at or below the reproducible tangible asset base ({perShare(sz.assetFloor.perShare)} / sh) — a rarer, harder
          floor.
        </p>
      ) : null}

      <p className="text-xs text-[var(--tt-muted)]">
        These are positions of price within a conservative→optimistic value band — not investment advice, not a buy/sell signal,
        and not a price target. Growth value means the moat gate is open and is a deliberately conservative estimate, never a
        prediction. Whether to act is your judgment. See method below.
      </p>

      <p className="text-[10px] text-[var(--tt-faint)]">
        Price as of {sz.price.date}
        {sz.price.source ? ` · ${sz.price.source}` : ""}
        {sz.stale ? " · may be stale" : ""}
        {epv?.growthCollapsed ? " · growth value not credited" : ""}.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Add the reproduction-value + franchise callout** — in `EarningsPowerFloorCard`, replace the existing asset-floor / moat flex row (lines 275-284) with an explicit reproduction-value breakdown and franchise reading.

**Units (verified against the engine):** `asset_floor.tangible_net_assets`, `asset_floor.capitalized_rd`, and `moat_reading.franchise_value` are **enterprise dollars** (totals), NOT per-share (`reproductionValue.ts`: `per_share = total / shares`; `epvFloor.ts`: `franchise_value = (epvMid − reproduction.per_share) * shares`). Render them with a `usd()` thousands helper, NOT `perShare()`. `asset_floor.per_share` IS per-share — keep `perShare()` for it.

First add the `usd()` helper next to the existing `perShare`/`range`/`pct` helpers (after line 17):

```ts
function usd(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
```

Then replace the asset-floor / moat flex row:

```ts
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--tt-text)]">
          <span>
            <span className="text-[var(--tt-faint)]">Reproduction value </span>
            {asset_floor.assessable ? `${perShare(asset_floor.per_share)} / sh` : "—"}
          </span>
          <span>
            <span className="text-[var(--tt-faint)]">Moat </span>
            {MOAT_SHORT[moat_reading.signal]}
            {moat_reading.signal === "franchise" && finitePositive(moat_reading.franchise_value)
              ? ` · franchise premium ${usd(moat_reading.franchise_value)} over reproduction value`
              : ""}{" "}
            <span className="text-[var(--tt-faint)]">(directional)</span>
          </span>
        </div>
        {asset_floor.assessable && (finitePositive(asset_floor.tangible_net_assets) || finitePositive(asset_floor.capitalized_rd)) ? (
          <p className="text-xs text-[var(--tt-muted)]">
            Reproduction value = tangible net assets {usd(asset_floor.tangible_net_assets)}
            {finitePositive(asset_floor.capitalized_rd)
              ? ` + capitalized R&D ${usd(asset_floor.capitalized_rd)}${asset_floor.rd_years_used?.length ? ` (FY ${asset_floor.rd_years_used.join(", ")})` : ""}`
              : ""}
            {asset_floor.assessable ? ` = ${perShare(asset_floor.per_share)} / sh` : ""}. This is why the floor can sit reasonably above book.
          </p>
        ) : null}
```

- [ ] **Step 5: Type-check + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: `tsc` clean; `npm run build` completes with no errors (worktree has real `node_modules` from `npm ci` — see [[worktree-build-needs-real-node-modules]]).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(valuation): card v2 — value band, 5/6-tier position, GV/reproduction/franchise callouts"
```

---

## Task 3: Real-data QA + units verification (spec §7)

**Files:** none (verification only). Requires copying the main checkout's `web/.env.local` into the worktree.

- [ ] **Step 1: Copy env**

```bash
cp /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web/.env.local web/.env.local
```

- [ ] **Step 2: Build already done in Task 2.** Start the dev server and inspect each QA ticker's `/stocks/[ticker]` valuation card via the preview tools (preview_start → preview_snapshot / preview_screenshot). For each, confirm:
  - **GOOG / MSFT** (quality, GV assessable): position is `moat_band` or `zero_growth_zone` (within the band) — **NOT** "above floor / above_optimistic" at a normal price. This is the disease-fix acceptance.
  - **MA** (GV gated_to_zero): degrades to the zero-growth band — position is one of {in_strike_zone, approaching, zero_growth_zone, above_zero_growth}, badge/footnote says growth value not credited, no GV ceiling ticks.
  - **ASML** (foreign IFRS filer, floor undefined): the whole valuation block does not render (page-level gate).
  - One **deep-cheap** ticker: position is `in_strike_zone`.

- [ ] **Step 3: Confirm the reproduction-value callout reads sanely.** Units are already resolved (enterprise dollars → `usd()` helper, per Task 2 Step 4). On the GOOG/MSFT card, just confirm "tangible net assets $X.XXB + capitalized R&D $Y.YYB = $Z.ZZ / sh · franchise premium $W.WWB" renders with sane magnitudes (billions for big caps, the `/sh` figure a normal share price scale). No code change expected.

- [ ] **Step 4: Confirm `page.tsx` needs no change** — re-read lines 311-320 and 428; the `floor` (with `growth_value`) and `strikeZone` are already passed. No edit.

---

## Self-Review

**Spec coverage:**
- §1 value band math → Task 1 Step 4 (`valueFloor`/`base`/`ceilings`).
- §2 5-tier position + degradation → Task 1 Step 4 position ladder; tests Step 2.
- §3 reproduction value + franchise → Task 2 Step 4.
- §4 three-scenario GV summary → Task 2 Step 3 (`growthSummary`).
- §5 visualization → Task 2 Step 2 (`StrikeBand`).
- §6 file touches → Tasks 1-2; `page.tsx` no-change confirmed Task 3 Step 4.
- §7 tests + integration + real-data QA → Task 1 Step 2 (check assertions), Task 2 Step 5 (tsc/build), Task 3.
- §8 compliance disclaimer → Task 2 Step 3 (updated disclaimer + footnote degradation stamps).
- §9 worktree/branch → already isolated.

**Placeholder scan:** All code blocks are concrete. The one explicit open question (per-share vs enterprise dollar units for `tangible_net_assets`/`capitalized_rd`/`franchise_value`) is resolved deterministically in Task 3 Step 3 with a fallback path, not left as TODO.

**Type consistency:** `ValuePosition` union (7 members incl. degraded `above_zero_growth`), `epv.{valueFloor,base,ceilings,position,growthCollapsed}`, and `growthSummary`/`POSITION_SENTENCE`/`POSITION_LABEL`/`POSITION_TONE` names are consistent across Tasks 1-2.
