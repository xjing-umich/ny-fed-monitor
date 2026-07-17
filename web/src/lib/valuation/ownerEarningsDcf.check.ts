import assert from "node:assert";
import type { ValuationFloor, ValuationFloorYear, LatestPrice, MoatReading } from "./types";
import {
  deriveOeDcf,
  pickLatestFredPoint,
  GROWTH_CAP_FRANCHISE,
  GROWTH_CAP_MODERATE,
  GROWTH_CAP_NONE,
  S_STRUCTURAL_GROWTH,
  R_STRICT,
  DGS10_PREMIUM,
  FALLBACK_BAND,
  reconcileMethods,
  hModelValue,
  dcfTier,
  projectOe,
  PROJECTION_YEARS,
} from "./ownerEarningsDcf";
import { CAP_STRONG, MOAT_STRONG_RATIO, deriveMoatCap } from "./moatCap";
import type { OeDcfAssessment } from "./types";

// ── fixtures ────────────────────────────────────────────────────────────────
function lamp(oe: number, shares: number, yearsUsed: number[]) {
  return {
    label: "Buffett owner-earnings value",
    assessable: true,
    normalized_earnings: oe,
    equity_value_low: oe / 0.1,
    equity_value_high: oe / 0.08,
    per_share_low: oe / 0.1 / shares,
    per_share_high: oe / 0.08 / shares,
    method: { years_used: yearsUsed } as ValuationFloor["buffett_epv"]["method"],
  } as ValuationFloor["buffett_epv"];
}
function floorWith(buffett: ValuationFloor["buffett_epv"]): ValuationFloor {
  // Only buffett_epv is read by deriveOeDcf; other fields are stubs.
  return { kind: "floor", buffett_epv: buffett } as unknown as ValuationFloor;
}
function yr(fy: number, net_income: number): ValuationFloorYear {
  return { fiscal_year: fy, net_income };
}
/** Year with a revenue series only (drives historicalGrowthBaseRate's log regression). */
function yrRev(fy: number, revenue: number): ValuationFloorYear {
  return { fiscal_year: fy, revenue };
}
/** Floor with a synthetic fundamentals-growth cap (floor.sustainable_growth) and moat_cap grade. */
function floorWithMoat(
  buffett: ValuationFloor["buffett_epv"],
  opts: { sustainable_growth?: number; grade: "strong" | "moderate" | "none" },
): ValuationFloor {
  return {
    kind: "floor",
    buffett_epv: buffett,
    sustainable_growth: opts.sustainable_growth,
    moat_cap: {
      grade: opts.grade,
      capYears: opts.grade === "strong" ? 20 : opts.grade === "moderate" ? 10 : 0,
      durablePassed: opts.grade === "strong",
      basis: "test fixture",
    },
  } as unknown as ValuationFloor;
}
const price = (close: number): LatestPrice => ({ close, date: "2026-06-20", currency: "USD" });

// ── 1. pickLatestFredPoint skips nulls, takes most recent ────────────────────
assert.deepStrictEqual(
  pickLatestFredPoint([
    { date: "2026-06-17", value: 4.2 },
    { date: "2026-06-18", value: null },
  ]),
  { value: 4.2, date: "2026-06-17" },
);
assert.strictEqual(pickLatestFredPoint([{ date: "x", value: null }]), null);

// ── 2. growth: rising history, no revenue/sustainable_growth evidence, no moat_cap set
//      (grade undefined → treated as "none") → falls back to CAGR clamped by the
//      non-financial/no-moat cap (0.05, Task 4 four-tier) ──────────────────────
{
  // net income 100→133.1 over FY2021→2024 (3 periods) = 10% CAGR exactly; no revenue field
  // supplied (gRaw undefined) and no floor.sustainable_growth (gFund undefined) → candidates
  // reduce to cagrFallback=0.10, clamped by the none-grade cap GROWTH_CAP_NONE=0.05.
  const years = [yr(2024, 133.1), yr(2023, 121), yr(2022, 110), yr(2021, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4.25, date: "2026-06-19" }, price(120));
  assert.ok(r.assessable, "rising history assessable");
  assert.ok(Math.abs(r.growth_g1! - GROWTH_CAP_NONE) < 1e-9, `g1≈0.05 (none cap) got ${r.growth_g1}`);
  assert.ok(r.growth_g1! <= GROWTH_CAP_NONE, "g1 capped");
  // three ordered tiers
  assert.ok(r.per_share_low! < r.tiers!.neutral.per_share, "pess < neutral");
  assert.ok(r.tiers!.neutral.per_share < r.per_share_high!, "neutral < opt");
  // pessimistic uses ½g1 and strict discount
  assert.ok(Math.abs(r.tiers!.pessimistic.growth_stage1 - GROWTH_CAP_NONE / 2) < 1e-9, "pess g = ½g1");
  assert.strictEqual(r.tiers!.pessimistic.discount_rate, R_STRICT, "pess r = strict");
}

// ── 3. g1 capped at the none-grade cap (0.05) when CAGR exceeds it, no moat_cap set ──
{
  const years = [yr(2024, 400), yr(2023, 200), yr(2022, 100)]; // ~100% CAGR
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4, date: "d" }, null);
  assert.strictEqual(r.growth_g1, GROWTH_CAP_NONE, "g1 hard-capped at none-grade cap 0.05 (no moat_cap/non-financial)");
}

// ── 4. declining history → g1 = 0 ────────────────────────────────────────────
{
  const years = [yr(2024, 80), yr(2023, 90), yr(2022, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4, date: "d" }, null);
  assert.strictEqual(r.growth_g1, 0, "declining → g1 0");
  assert.strictEqual(r.declined, true, "declined flag");
}

// ── 5. discount band from DGS10 (normal, ordered) ────────────────────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4.25, date: "2026-06-19" }, null);
  assert.ok(Math.abs(r.discount!.r_low - (0.0425 + DGS10_PREMIUM)) < 1e-9, "r_low = DGS10/100 + premium");
  assert.strictEqual(r.discount!.r_high, R_STRICT, "r_high = strict end");
  assert.strictEqual(r.discount!.anchored, true, "anchored");
  assert.strictEqual(r.discount!.inverted, false, "not inverted");
  assert.strictEqual(r.discount!.dgs10_date, "2026-06-19", "as-of stamped");
}

// ── 6. inversion: DGS10 ≥ 7.5% → [min,max] + flag ────────────────────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 8, date: "d" }, null);
  assert.strictEqual(r.discount!.inverted, true, "inverted flag");
  assert.ok(r.discount!.r_low <= r.discount!.r_high, "r_low ≤ r_high after min/max");
}

// ── 7. DGS10 missing → fallback band, not anchored ───────────────────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], null, null);
  assert.strictEqual(r.discount!.anchored, false, "fallback not anchored");
  assert.deepStrictEqual([r.discount!.r_low, r.discount!.r_high], [FALLBACK_BAND[0], FALLBACK_BAND[1]], "fallback band");
}

// ── 8. zero-growth terminal share + >70% flag ────────────────────────────────
{
  // flat earnings, no growth → all value is terminal-ish; terminal_share computed.
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, null);
  assert.ok(r.terminal_share_pct! > 0 && r.terminal_share_pct! < 1, "terminal share in (0,1)");
  assert.strictEqual(r.terminal_dependency_flag, r.terminal_share_pct! > 0.7, "flag matches threshold");
}

// ── 9. no bridge: equity value uses OE directly, per share = equity/shares ────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, null);
  // neutral per-share = neutral equity / 100 shares
  assert.ok(Math.abs(r.tiers!.neutral.per_share - r.tiers!.neutral.equity_value / 100) < 1e-6, "per share = equity/shares");
  assert.ok(/no .*bridge/i.test(r.no_bridge_note), "no-bridge note present");
}

// ── 10. diagnostics: OE yield vs DGS10, quick-check deviation ─────────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, price(50));
  // OE per share = 1000/100 = 10; yield = 10/50 = 0.20
  assert.ok(Math.abs(r.diagnostics!.oe_yield! - 0.2) < 1e-9, "oe yield 20%");
  assert.ok(typeof r.diagnostics!.oe_yield_flag === "boolean", "oe yield flag set");
  assert.ok(typeof r.diagnostics!.quick_check_flag === "boolean", "quick check flag set");
}

// ── 11. degradation: OE not assessable → no output ───────────────────────────
{
  const dead = { label: "x", assessable: false, method: { years_used: [] } } as unknown as ValuationFloor["buffett_epv"];
  const r = deriveOeDcf(floorWith(dead), [yr(2024, 100)], { value: 4, date: "d" }, null);
  assert.strictEqual(r.assessable, false, "not assessable");
  assert.ok(r.not_assessable_reason, "reason present");
  assert.strictEqual(r.tiers, undefined, "no tiers");
}

// ── 13. (r − g) guard: r_minus_g = midpoint − g1; flag iff spread < 4% ────────
{
  // 低 DGS10 + 强劲净利增长 → g1 触顶、midpoint 偏低 → 窄差 → flag true
  const rNarrow = deriveOeDcf(
    floorWith(lamp(1000, 100, [2022, 2023, 2024])),
    [yr(2024, 200), yr(2023, 140), yr(2022, 100)],
    { value: 1, date: "d" }, // DGS10 1% → midpoint ~6.75%
    price(50),
  );
  assert.ok(rNarrow.assessable, "narrow fixture assessable");
  assert.strictEqual(
    rNarrow.diagnostics?.r_minus_g,
    (rNarrow.discount!.midpoint) - rNarrow.growth_g1!,
    "r_minus_g identity = midpoint − g1",
  );
  assert.strictEqual(
    rNarrow.diagnostics?.r_minus_g_flag,
    (rNarrow.diagnostics!.r_minus_g as number) < 0.04,
    "flag matches < 4% threshold (narrow)",
  );
  assert.ok(rNarrow.diagnostics?.r_minus_g_flag === true, "narrow spread → flag true");

  // 净利持平/下降 → g1 = 0 → 宽差 → flag false
  const rWide = deriveOeDcf(
    floorWith(lamp(1000, 100, [2022, 2023, 2024])),
    [yr(2024, 100), yr(2023, 100), yr(2022, 100)],
    { value: 4, date: "d" },
    price(50),
  );
  assert.ok(rWide.diagnostics?.r_minus_g_flag === false, "flat growth → flag false");
}

// ── A1. 终值 Gordon 带宽 ──────────────────────────────────────────────────────
// 14) 上升净利 + reliable → 中枢/乐观档用封顶 Gordon；悲观档保持零增长底不变。
{
  // net income 100→133.1 FY2021→2024 = 10% CAGR；DGS10 4.25% → gCap=min(0.03,0.0425)=0.03，g1=0.10 → gTerminal=0.03
  const years = [yr(2024, 133.1), yr(2023, 121), yr(2022, 110), yr(2021, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4.25, date: "2026-06-19" }, price(120));
  assert.ok(r.assessable, "assessable");
  assert.strictEqual(r.terminal_method, "gordon_capped", "reliable growth → gordon terminal");
  assert.ok(Math.abs(r.terminal_growth! - 0.03) < 1e-9, `terminal g capped at 3% GDP, got ${r.terminal_growth}`);
  // 悲观档仍是零增长底：per_share_low 应等于零增长口径(OE₀ 恒定 → 每股 = 悲观档 equity/shares)
  assert.ok(r.per_share_low! < r.tiers!.neutral.per_share, "floor(pess) < neutral");
  assert.ok(Number.isFinite(r.tiers!.neutral.per_share) && r.tiers!.neutral.per_share > 0, "neutral finite positive");
  assert.ok(r.tiers!.neutral.per_share < r.per_share_high!, "neutral < opt");
}
// 15) 净利下滑 → 全档退回零增长（不给恶化股终值增长）。
{
  const years = [yr(2024, 80), yr(2023, 90), yr(2022, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4.25, date: "d" }, null);
  assert.strictEqual(r.terminal_method, "zero_growth", "declined → zero growth terminal");
  assert.strictEqual(r.terminal_growth, 0, "declined → g 0");
}
// 16) 高杠杆但未恶化 → 不再强制清零终值增长（Task 4：杠杆已由折现率溢价承担，见下方新增用例）。
{
  const years = [yr(2024, 133.1), yr(2023, 121), yr(2022, 110), yr(2021, 100)];
  const levered = { kind: "floor", buffett_epv: lamp(1000, 100, [2022, 2023, 2024]), high_leverage_warning: true } as unknown as ValuationFloor;
  const r = deriveOeDcf(levered, years, { value: 4.25, date: "d" }, null);
  assert.strictEqual(r.terminal_method, "gordon_capped", "high leverage alone (undeclined) → gordon terminal, not forced to zero");
}
// 17) g1=0（净利持平）→ gTerminal=0 → 零增长（行为与现状一致）。
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, null);
  assert.strictEqual(r.terminal_method, "zero_growth", "flat earnings → zero growth");
}

// ── 12. compliance: emitted strings carry no advice/target tokens ────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 110), yr(2023, 100)], { value: 4, date: "d" }, price(50));
  const blob = JSON.stringify(r).toLowerCase();
  for (const bad of ["buy", "sell", " hold", "target price", "rating", "recommend"]) {
    assert.ok(!blob.includes(bad), `no "${bad}" token in OE-DCF output`);
  }
}

function oeStub(low: number, high: number): OeDcfAssessment {
  return {
    assessable: true,
    per_share_low: low,
    per_share_high: high,
    tiers: {
      pessimistic: { growth_stage1: 0, discount_rate: 0.1, equity_value: 0, per_share: low },
      neutral: { growth_stage1: 0, discount_rate: 0.09, equity_value: 0, per_share: (low + high) / 2 },
      optimistic: { growth_stage1: 0, discount_rate: 0.08, equity_value: 0, per_share: high },
    },
    no_bridge_note: "x",
  } as OeDcfAssessment;
}

// price below both ranges → both show margin of safety
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), price(50));
  assert.strictEqual(m.consistency, "both_margin_of_safety");
  assert.deepStrictEqual(m.greenwald_range, [100, 140]);
  assert.deepStrictEqual(m.buffett_range, [90, 150]);
}
// price within → within value range
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), price(110));
  assert.strictEqual(m.consistency, "within_value_range");
}
// price above both → above both values
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), price(200));
  assert.strictEqual(m.consistency, "above_both_values");
}
// divergence > 20% flagged (gw neutral 120 vs bf neutral 50 → mean 85, |70|/85 ≈ 0.82)
{
  const m = reconcileMethods({ pessimistic: 40, neutral: 120, optimistic: 200 }, oeStub(10, 90), price(60));
  assert.ok(m.divergence_pct! > 0.2, "divergence computed");
  assert.strictEqual(m.divergence_flag, true, "divergence flagged");
}
// degradation: missing Greenwald → not comparable
{
  const m = reconcileMethods(undefined, oeStub(90, 150), price(110));
  assert.strictEqual(m.comparable, false);
  assert.ok(m.reason_if_not, "reason present");
  assert.strictEqual(m.consistency, undefined);
}
// degradation: missing OE-DCF → not comparable
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, undefined, price(110));
  assert.strictEqual(m.comparable, false);
}
// no price → comparable for divergence, but no consistency reading
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), null);
  assert.strictEqual(m.comparable, true);
  assert.strictEqual(m.consistency, undefined);
  assert.ok(m.divergence_pct != null, "divergence still computed without price");
}
// compliance on reconcile output
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), price(110));
  const blob = JSON.stringify(m).toLowerCase();
  for (const bad of ["buy", "sell", " hold", "target price", "rating", "recommend"]) {
    assert.ok(!blob.includes(bad), `no "${bad}" token in reconcile output`);
  }
}

// ── B1. H-model baseline 精确闭式解 ─────────────────────────────────────────
// 权益价值 V = OE0·[(1+gL) + H·(gS−gL)] / (r−gL), H = PROJECTION_YEARS/2 = 5.
// oe0=1000, gS=0.10, gL=0.03, r=0.10 → 1000·(1.03+5·0.07)/0.07 = 1000·1.38/0.07 = 19714.2857
{
  const v = hModelValue(1000, 0.1, 0.03, 0.1);
  assert.ok(Math.abs(v - (1000 * (1.03 + 5 * 0.07)) / 0.07) < 1e-6, `H-model closed form, got ${v}`);
  // gS=gL=0 退化为零增长资本化 oe0/r
  assert.ok(Math.abs(hModelValue(1000, 0, 0, 0.1) - 1000 / 0.1) < 1e-9, "gS=gL=0 → oe0/r");
  // 纯增长感知：gS>0 时严格大于零增长资本化
  assert.ok(hModelValue(1000, 0.08, 0.03, 0.1) > 1000 / 0.1, "growth-aware > no-growth anchor");
}

// ── B2. 成长股不再被 quick_check 误判 unreliable（Phase A 皱褶修复）──────────
// g1=10% 成长股：旧零增长基线 dev≈101%（flag true），新 H-model 基线 dev<5%（flag false）。
{
  const years = [yr(2024, 133.1), yr(2023, 121), yr(2022, 110), yr(2021, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4.25, date: "2026-06-19" }, price(120));
  assert.ok(r.assessable, "growth fixture assessable");
  assert.strictEqual(r.diagnostics!.quick_check_flag, false, "growth stock NOT flagged (H-model baseline)");
  assert.ok(r.diagnostics!.quick_check_deviation_pct! < 0.5, "deviation under threshold");
  // 诊断基线 = 独立重算的 H-model / shares（口径自洽，不硬编码 fixture 数）
  const expected = hModelValue(1000, r.growth_g1!, r.terminal_growth!, r.discount!.midpoint) / 100;
  assert.ok(Math.abs(r.diagnostics!.quick_check_per_share! - expected) < 1e-6, "quick baseline = H-model per share");
  // 增长感知：新基线严格高于旧零增长锚 oe0/midpoint/shares
  assert.ok(r.diagnostics!.quick_check_per_share! > 1000 / r.discount!.midpoint / 100, "baseline > old zero-growth anchor");
}

// ── B3. 零增长名回归不变：g1=0 → H-model 退化为 oe0/r，与旧口径同值 ───────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, null);
  assert.strictEqual(r.diagnostics!.quick_check_flag, false, "flat earnings not flagged");
  assert.ok(Math.abs(r.diagnostics!.quick_check_per_share! - 1000 / r.discount!.midpoint / 100) < 1e-9, "g1=0 baseline unchanged vs zero-growth");
}

// ── C1. moat-CAP 向后兼容：默认参数 = 原 10 年行为（同一 g 下逐位相等）──────────
{
  const a = dcfTier(100, 0.08, 0.09, 10, 0.03);
  const b = dcfTier(100, 0.08, 0.09, 10, 0.03, 10);
  assert.deepStrictEqual(a, b, "dcfTier default capYears === explicit 10");
  assert.deepStrictEqual(projectOe(100, 0.08), projectOe(100, 0.08, 10), "projectOe default === explicit 10");
}

// ── C2. 抬上沿：capYears=20 的 perShare 严格大于 capYears=10（正增长 + 正终值增长）──
{
  const cap10 = dcfTier(100, 0.08, 0.09, 10, 0.03, 10).perShare;
  const cap20 = dcfTier(100, 0.08, 0.09, 10, 0.03, 20).perShare;
  assert.ok(cap20 > cap10, `cap20 (${cap20}) should exceed cap10 (${cap10})`);
}

// ── C3. 零增长 cap-不变（gTerminal=0：零增长资本化恒等式，与显式期长短无关）──────
{
  const cap10 = dcfTier(100, 0, 0.09, 10, 0, 10).perShare;
  const cap20 = dcfTier(100, 0, 0.09, 10, 0, 20).perShare;
  assert.ok(Math.abs(cap10 - cap20) < 1e-6, `zero-growth perShare must be cap-invariant, got ${cap10} vs ${cap20}`);
}

// ── C4. projectOe 形状：cap=20 长度20/前5年恒g1/其后线性fade到第20年g≈0；
//       cap=10 与原 10 年三段式实现逐年相等（防回归） ─────────────────────────
{
  const p20 = projectOe(100, 0.1, 20);
  assert.strictEqual(p20.length, 20, "capYears=20 → length 20");
  for (let t = 1; t <= 5; t++) {
    assert.ok(Math.abs(p20[t - 1] - 100 * Math.pow(1.1, t)) < 1e-6, `year ${t} constant g1`);
  }
  const lastRatio = p20[19] / p20[18];
  assert.ok(Math.abs(lastRatio - 1) < 1e-9, `year 20 growth ≈ 0, ratio=${lastRatio}`);
  const midRatio = p20[9] / p20[8];
  assert.ok(midRatio > 1 && midRatio < 1.1, "mid-fade growth strictly between 0 and g1");

  const p10 = projectOe(100, 0.1, 10);
  const expected10: number[] = [];
  let prev = 100;
  for (let t = 1; t <= 5; t++) { prev *= 1.1; expected10.push(prev); }
  for (let t = 6; t <= PROJECTION_YEARS; t++) { const g = (0.1 * (10 - t)) / 5; prev *= 1 + g; expected10.push(prev); }
  for (let i = 0; i < 10; i++) {
    assert.ok(Math.abs(p10[i] - expected10[i]) < 1e-9, `capYears=10 year ${i + 1} matches original three-stage impl`);
  }
}

// ── C5. moat-CAP 接线：strong 护城河把 neutral/optimistic 抬到 20 年；
//       悲观档 + reliable(quick-check 诊断) 逐位不变（基线锚定，头号硬门）──────
// Post-BUG2-fix: deriveOeDcf reads floor.moat_cap directly (single source of truth, computed
// once in epvFloor.computeValuationFloor) rather than recomputing grade from moat_reading/years
// itself. These hand-built fixtures don't go through computeValuationFloor, so moat_cap is
// derived here explicitly via deriveMoatCap — the same function epvFloor now calls once.
{
  const buffett = lamp(1000, 100, [2022, 2023, 2024]);
  // 5% net-income CAGR (original fixture, unchanged) — floating-point sqrt lands at
  // 0.050000000000000044, a hair above the new GROWTH_CAP_NONE (0.05, commodity/none grade),
  // so the commodity/none-grade fixture below is clamped to the literal 0.05 while the strong
  // fixture (cap 0.20, well clear) is not — a sub-ULP difference that only shows up in bit-exact
  // comparisons (handled below with a tolerance, not strict equality). Ordinarily both would be
  // "5% CAGR" and this hairline clamp is a Task-4 side effect of moving the no-moat cap down to
  // 5% (previously 7%, comfortably above any float noise here).
  const yearsFull: ValuationFloorYear[] = [
    { fiscal_year: 2024, net_income: 110.25, operating_income: 300, shareholders_equity: 1000, total_debt: 0, cash: 0 },
    { fiscal_year: 2023, net_income: 105, operating_income: 300, shareholders_equity: 1000, total_debt: 0, cash: 0 },
    { fiscal_year: 2022, net_income: 100, operating_income: 300, shareholders_equity: 1000, total_debt: 0, cash: 0 },
  ];
  const dgs10 = { value: 4.25, date: "2026-06-19" };

  const strongMoat: MoatReading = {
    signal: "franchise",
    label: "x",
    basis_note: "x",
    epv_per_share_compared: 200,
    asset_per_share_compared: 200 / (MOAT_STRONG_RATIO * 2), // ratio = 2×MOAT_STRONG_RATIO, comfortably clears the strong gate
    dual_test_passed: true,
  };
  const commodityMoat: MoatReading = { signal: "commodity", label: "x", basis_note: "x" };

  const strongMoatCap = deriveMoatCap({
    moat: strongMoat,
    epvAvRatio: strongMoat.epv_per_share_compared! / strongMoat.asset_per_share_compared!,
    declined: false, suppressedFlags: false, roicStable: true,
  });
  assert.strictEqual(strongMoatCap.grade, "strong", "fixture: strongMoat derives grade=strong");
  const commodityMoatCap = deriveMoatCap({
    moat: commodityMoat, epvAvRatio: undefined, declined: false, suppressedFlags: false, roicStable: undefined,
  });
  assert.strictEqual(commodityMoatCap.grade, "none", "fixture: commodityMoat derives grade=none");

  const floorStrong = { kind: "floor", buffett_epv: buffett, moat_reading: strongMoat, high_leverage_warning: false, moat_cap: strongMoatCap } as unknown as ValuationFloor;
  const floorCommodity = { kind: "floor", buffett_epv: buffett, moat_reading: commodityMoat, high_leverage_warning: false, moat_cap: commodityMoatCap } as unknown as ValuationFloor;

  const rStrong = deriveOeDcf(floorStrong, yearsFull, dgs10, price(120));
  const rCommodity = deriveOeDcf(floorCommodity, yearsFull, dgs10, price(120));

  assert.ok(rStrong.assessable && rCommodity.assessable, "both assessable");
  assert.strictEqual(rCommodity.expectations_inputs?.capYears, PROJECTION_YEARS, "non-franchise → baseline 10-year cap (value unchanged)");
  assert.strictEqual(rStrong.expectations_inputs?.capYears, CAP_STRONG, "strong moat (ROIC stable) → CAP raised to 20 years");

  // 只抬上沿：strong 的 neutral/optimistic 严格高于同输入下的 commodity 基线
  assert.ok(rStrong.tiers!.neutral.per_share > rCommodity.tiers!.neutral.per_share, "strong neutral > baseline neutral");
  assert.ok(rStrong.per_share_high! > rCommodity.per_share_high!, "strong optimistic > baseline optimistic");

  // 悲观档逐位不变：CAP 完全不影响 pessimistic(容差比较:见上方注释,none-grade cap=0.05 与本
  // fixture 5% CAGR 的浮点值几乎重合,commodity 侧被 clamp 到字面 0.05、strong 侧未被 clamp,
  // 两者相差一个 ULP 级别的浮点噪声,不是真实的行为分歧)。
  assert.ok(Math.abs(rStrong.per_share_low! - rCommodity.per_share_low!) < 1e-9, "pessimistic per_share_low identical (within float tolerance) regardless of moat-CAP");
  assert.ok(
    Math.abs(rStrong.tiers!.pessimistic.equity_value - rCommodity.tiers!.pessimistic.equity_value) < 1e-6 &&
      Math.abs(rStrong.tiers!.pessimistic.per_share - rCommodity.tiers!.pessimistic.per_share) < 1e-9 &&
      Math.abs(rStrong.tiers!.pessimistic.growth_stage1 - rCommodity.tiers!.pessimistic.growth_stage1) < 1e-9 &&
      rStrong.tiers!.pessimistic.discount_rate === rCommodity.tiers!.pessimistic.discount_rate,
    "pessimistic tier identical (within float tolerance) regardless of moat-CAP",
  );

  // 前提校验：本测试用 5% CAGR fixture 特意让 g1 在 strong/commodity 两档几乎相等(均在两 cap
  // 之下,容差比较——见上方注释),这样下面的 quick-check 恒等断言只归因于 capYears 解耦，而非
  // franchise cap 恰好也让 g1 相等。
  assert.ok(Math.abs(rStrong.growth_g1! - rCommodity.growth_g1!) < 1e-9, "fixture isolation: g1 identical (within float tolerance) across moat grades (5% < both caps)");

  // reliable 逐位不变(容差比较,理由同上)：quick-check 诊断锚定在基线 cap=10，与展示用
  // neutralCap（可能 20）完全解耦。
  assert.ok(Math.abs(rStrong.diagnostics!.quick_check_per_share! - rCommodity.diagnostics!.quick_check_per_share!) < 1e-6, "quick-check baseline identical (within float tolerance, anchored to cap=10)");
  assert.ok(Math.abs(rStrong.diagnostics!.quick_check_deviation_pct! - rCommodity.diagnostics!.quick_check_deviation_pct!) < 1e-6, "quick-check deviation identical (within float tolerance)");
  assert.strictEqual(rStrong.diagnostics!.quick_check_flag, rCommodity.diagnostics!.quick_check_flag, "quick_check_flag identical → reliable unaffected by moat-CAP");
}

// ── D. g_used 证据驱动 + cap 四分档(Task 2 K–P + Task 4 四分档收紧) ────────────
// candidates = [gRaw(历史营收 log 回归,全样本), gFund(floor.sustainable_growth), cagrFallback(仅
// cagr>0 时纳入)].filter(有限且≥0); g_used = declined ? 0 : clamp(min(candidates), 0, cap);
// cap = grade==="strong" ? GROWTH_CAP_FRANCHISE(0.20)
//     : is_financial ? min(financial_sgr, GROWTH_CAP_MODERATE) 或 SGR 缺失/非正 → GROWTH_CAP_NONE(0.05)
//     : grade==="moderate" ? GROWTH_CAP_MODERATE(0.07) : GROWTH_CAP_NONE(0.05)。
// 下面用等比数列构造的 revenue 序列使 log 回归精确复现设定的年化增速(x 等间距时log-线性回归对
// 完美等比序列精确求解),避免测试引入近似误差。

// K) strong 档 + 历史 15% + 基本面 25% → min(15%,25%)=15%,franchise cap 20% 不咬 → 0.15
{
  const years = [yrRev(2024, 152.0875), yrRev(2023, 132.25), yrRev(2022, 115), yrRev(2021, 100)]; // 15%/yr exactly
  const floor = floorWithMoat(lamp(1000, 100, [2022, 2023, 2024]), { sustainable_growth: 0.25, grade: "strong" });
  const r = deriveOeDcf(floor, years, { value: 4.25, date: "d" }, null);
  assert.ok(r.assessable, "K: assessable");
  assert.ok(Math.abs(r.growth_g1! - 0.15) < 1e-6, `K: g_used≈0.15 got ${r.growth_g1}`);
}

// L) strong 档 + 历史 25% + 基本面 25% → min=25%,被 franchise cap 20% 封顶 → 0.20
{
  const years = [yrRev(2024, 195.3125), yrRev(2023, 156.25), yrRev(2022, 125), yrRev(2021, 100)]; // 25%/yr exactly
  const floor = floorWithMoat(lamp(1000, 100, [2022, 2023, 2024]), { sustainable_growth: 0.25, grade: "strong" });
  const r = deriveOeDcf(floor, years, { value: 4.25, date: "d" }, null);
  assert.ok(Math.abs(r.growth_g1! - GROWTH_CAP_FRANCHISE) < 1e-6, `L: g_used capped at franchise 0.20, got ${r.growth_g1}`);
}

// M) 非 strong(moderate)+ 历史 12% → 被 GROWTH_CAP_MODERATE 0.07 封顶 → 0.07
{
  const years = [yrRev(2024, 140.4928), yrRev(2023, 125.44), yrRev(2022, 112), yrRev(2021, 100)]; // 12%/yr exactly
  const floor = floorWithMoat(lamp(1000, 100, [2022, 2023, 2024]), { grade: "moderate" });
  const r = deriveOeDcf(floor, years, { value: 4.25, date: "d" }, null);
  assert.ok(Math.abs(r.growth_g1! - GROWTH_CAP_MODERATE) < 1e-6, `M: g_used capped at moderate 0.07, got ${r.growth_g1}`);
}

// Q) none 非金融(grade="none",is_financial=false)+ 历史 12% → 被 GROWTH_CAP_NONE 0.05 封顶 → 0.05
{
  const years = [yrRev(2024, 140.4928), yrRev(2023, 125.44), yrRev(2022, 112), yrRev(2021, 100)]; // 12%/yr exactly
  const floor = floorWithMoat(lamp(1000, 100, [2022, 2023, 2024]), { grade: "none" });
  const r = deriveOeDcf(floor, years, { value: 4.25, date: "d" }, null);
  assert.ok(Math.abs(r.growth_g1! - GROWTH_CAP_NONE) < 1e-6, `Q: g_used capped at none 0.05, got ${r.growth_g1}`);
}

// R) moderate + 历史 12% → 被 GROWTH_CAP_MODERATE 0.07 封顶(重复断言 M,verbatim brief 用例命名)→ 0.07
{
  const years = [yrRev(2024, 140.4928), yrRev(2023, 125.44), yrRev(2022, 112), yrRev(2021, 100)];
  const floor = floorWithMoat(lamp(1000, 100, [2022, 2023, 2024]), { grade: "moderate" });
  const r = deriveOeDcf(floor, years, { value: 4.25, date: "d" }, null);
  assert.ok(Math.abs(r.growth_g1! - 0.07) < 1e-6, `R: g_used capped at moderate 0.07, got ${r.growth_g1}`);
}

// S) strong + 历史 25% + 基本面 25% → 被 GROWTH_CAP_FRANCHISE 0.20 封顶(重复断言 L)→ 0.20
{
  const years = [yrRev(2024, 195.3125), yrRev(2023, 156.25), yrRev(2022, 125), yrRev(2021, 100)]; // 25%/yr exactly
  const floor = floorWithMoat(lamp(1000, 100, [2022, 2023, 2024]), { sustainable_growth: 0.25, grade: "strong" });
  const r = deriveOeDcf(floor, years, { value: 4.25, date: "d" }, null);
  assert.ok(Math.abs(r.growth_g1! - 0.20) < 1e-6, `S: g_used capped at strong 0.20, got ${r.growth_g1}`);
}

// T) 金融股(is_financial=true) SGR=4% → cap=min(0.04,GROWTH_CAP_MODERATE)=0.04,历史 12% 被封顶 → 0.04
{
  const years = [yrRev(2024, 140.4928), yrRev(2023, 125.44), yrRev(2022, 112), yrRev(2021, 100)]; // 12%/yr exactly
  const floor = {
    kind: "floor",
    buffett_epv: lamp(1000, 100, [2022, 2023, 2024]),
    is_financial: true,
    financial_sgr: 0.04,
    moat_cap: { grade: "none", capYears: 0, durablePassed: false, basis: "test fixture" },
  } as unknown as ValuationFloor;
  const r = deriveOeDcf(floor, years, { value: 4.25, date: "d" }, null);
  assert.ok(Math.abs(r.growth_g1! - 0.04) < 1e-6, `T: 金融股 g_used capped at SGR 0.04, got ${r.growth_g1}`);
}

// T2) 金融股 SGR 缺失(financial_sgr undefined)→ 退 GROWTH_CAP_NONE 0.05
{
  const years = [yrRev(2024, 140.4928), yrRev(2023, 125.44), yrRev(2022, 112), yrRev(2021, 100)]; // 12%/yr exactly
  const floor = {
    kind: "floor",
    buffett_epv: lamp(1000, 100, [2022, 2023, 2024]),
    is_financial: true,
    financial_sgr: undefined,
    moat_cap: { grade: "none", capYears: 0, durablePassed: false, basis: "test fixture" },
  } as unknown as ValuationFloor;
  const r = deriveOeDcf(floor, years, { value: 4.25, date: "d" }, null);
  assert.ok(Math.abs(r.growth_g1! - GROWTH_CAP_NONE) < 1e-6, `T2: 金融股 SGR 缺失退 0.05, got ${r.growth_g1}`);
}

// T3) 金融股 SGR 非正(≤0)→ 同样退 GROWTH_CAP_NONE 0.05(不给负/零留存的金融股任何增长空间)
{
  const years = [yrRev(2024, 140.4928), yrRev(2023, 125.44), yrRev(2022, 112), yrRev(2021, 100)];
  const floor = {
    kind: "floor",
    buffett_epv: lamp(1000, 100, [2022, 2023, 2024]),
    is_financial: true,
    financial_sgr: -0.02,
    moat_cap: { grade: "none", capYears: 0, durablePassed: false, basis: "test fixture" },
  } as unknown as ValuationFloor;
  const r = deriveOeDcf(floor, years, { value: 4.25, date: "d" }, null);
  assert.ok(Math.abs(r.growth_g1! - GROWTH_CAP_NONE) < 1e-6, `T3: 金融股 SGR≤0 退 0.05, got ${r.growth_g1}`);
}

// T4) 金融股 SGR 高于 moderate(SGR=15%)→ cap=min(0.15,GROWTH_CAP_MODERATE=0.07)=0.07,历史 25% 被 0.07 封顶
{
  const years = [yrRev(2024, 195.3125), yrRev(2023, 156.25), yrRev(2022, 125), yrRev(2021, 100)]; // 25%/yr exactly
  const floor = {
    kind: "floor",
    buffett_epv: lamp(1000, 100, [2022, 2023, 2024]),
    is_financial: true,
    financial_sgr: 0.15,
    moat_cap: { grade: "none", capYears: 0, durablePassed: false, basis: "test fixture" },
  } as unknown as ValuationFloor;
  const r = deriveOeDcf(floor, years, { value: 4.25, date: "d" }, null);
  assert.ok(Math.abs(r.growth_g1! - GROWTH_CAP_MODERATE) < 1e-6, `T4: 金融股 SGR>moderate,cap=min(SGR,moderate)=0.07 got ${r.growth_g1}`);
}

// N) 基本面 5% < 历史 15%(无 franchise 支撑的历史外推)→ min 咬住基本面上限 → 0.05
{
  const years = [yrRev(2024, 152.0875), yrRev(2023, 132.25), yrRev(2022, 115), yrRev(2021, 100)]; // 15%/yr exactly
  const floor = floorWithMoat(lamp(1000, 100, [2022, 2023, 2024]), { sustainable_growth: 0.05, grade: "moderate" });
  const r = deriveOeDcf(floor, years, { value: 4.25, date: "d" }, null);
  assert.ok(Math.abs(r.growth_g1! - 0.05) < 1e-6, `N: fundamental cap binds, g_used≈0.05, got ${r.growth_g1}`);
}

// O) declined(净利下滑)→ g_used = 0(与 declined 判定解耦,先于 candidates 生效)
{
  const years = [yr(2024, 80), yr(2023, 90), yr(2022, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4, date: "d" }, null);
  assert.strictEqual(r.growth_g1, 0, "O: declined → g_used 0");
  assert.strictEqual(r.declined, true, "O: declined flag true");
}

// P) gRaw 与 gFund 都缺(无 revenue、无 sustainable_growth)→ 退回 clamp(netIncomeCagr,0,cap)
{
  // 6% net-income CAGR, no revenue field → gRaw undefined; no floor.sustainable_growth → gFund
  // undefined; candidates reduces to cagrFallback=0.06, under the moderate cap 0.07 → unclamped.
  // grade explicitly "moderate"(非默认 none)以隔离本用例真正要验的东西:candidates 退回
  // cagrFallback 且不被 cap 咬到 —— 而非 Task 4 的 none-grade 5% cap 行为(见测试 2/3)。
  const years = [yr(2024, 112.36), yr(2023, 106), yr(2022, 100)];
  const floor = floorWithMoat(lamp(1000, 100, [2022, 2023, 2024]), { grade: "moderate" });
  const r = deriveOeDcf(floor, years, { value: 4, date: "d" }, null);
  assert.ok(Math.abs(r.growth_g1! - 0.06) < 1e-6, `P: fallback to cagr, g_used≈0.06, got ${r.growth_g1}`);
}

// ── gTerminal 摘掉杠杆那半(spec Task 4) ────────────────────────────────────
{
  const dgs10 = { value: 4.25, date: "2026-06-19" };
  const yearsFull = [yr(2024, 133.1), yr(2023, 121), yr(2022, 110), yr(2021, 100)];
  const floorFixture = (overrides: Partial<ValuationFloor> = {}) =>
    ({ ...floorWith(lamp(1000, 100, [2022, 2023, 2024])), ...overrides } as unknown as ValuationFloor);

  // 高杠杆但未恶化 → 终值增长**不再**被归零(改由折现率溢价承担)
  const hiLev = deriveOeDcf(
    floorFixture({ high_leverage_warning: true, leverage_premium: 0.02 }),
    yearsFull, dgs10, price(120),
  );
  assert.ok(hiLev.tiers!.neutral.per_share > 0, "高杠杆仍可评估");
  const noLev = deriveOeDcf(floorFixture({ high_leverage_warning: false, leverage_premium: 0.02 }), yearsFull, dgs10, price(120));
  assert.strictEqual(
    hiLev.tiers!.neutral.per_share, noLev.tiers!.neutral.per_share,
    "high_leverage_warning 不再影响 gTerminal(同溢价下值相同)",
  );
  assert.strictEqual(hiLev.terminal_method, "gordon_capped", "高杠杆但未恶化 → 走 gordon_capped，不再被强制清零");

  // declined 那半**保留**:恶化仍归零终值增长
  const yearsDeclining = [yr(2024, 80), yr(2023, 90), yr(2022, 100)];
  const declinedFloor = deriveOeDcf(floorFixture({ high_leverage_warning: false }), yearsDeclining, dgs10, price(120));
  assert.strictEqual(declinedFloor.tiers?.neutral.per_share != null, true, "declined 仍可评估");
  assert.strictEqual(declinedFloor.terminal_method, "zero_growth", "declined → 仍归零终值增长(未被本次改动动到)");
}

// ── 杠杆溢价进 OE-DCF 贴现带(spec Task 3) ──────────────────────────────────
{
  const dgs10 = { value: 4.25, date: "2026-06-19" };
  const years = [yr(2024, 133.1), yr(2023, 121), yr(2022, 110), yr(2021, 100)];
  const floorFixture = () => floorWith(lamp(1000, 100, [2022, 2023, 2024]));
  const base = deriveOeDcf(floorFixture(), years, dgs10, price(120));
  const levFloor = { ...floorFixture(), leverage_premium: 0.02 } as unknown as ValuationFloor;
  const lev = deriveOeDcf(levFloor, years, dgs10, price(120));

  assert.ok(Math.abs(lev.discount!.r_low - (base.discount!.r_low + 0.02)) < 1e-9, "r_low += 溢价");
  assert.ok(Math.abs(lev.discount!.r_high - (base.discount!.r_high + 0.02)) < 1e-9, "r_high += 溢价");
  // 溢价真的压低了 IV(端到端)
  assert.ok(lev.tiers!.neutral.per_share < base.tiers!.neutral.per_share, "溢价 → 中枢 IV 更低");
  // 缺溢价字段 → 与显式 leverage_premium: 0 的行为一致(测真正的退化接缝:调用方把字段
  // 拼错/漏传时应该 fallback 到零溢价,而不是仅仅证明"同一个输入算两遍结果相同")
  const noField = deriveOeDcf(
    { ...floorFixture(), leverage_premium: undefined } as unknown as ValuationFloor,
    years,
    dgs10,
    price(120),
  );
  const zeroFloor = { ...floorFixture(), leverage_premium: 0 } as unknown as ValuationFloor;
  const zero = deriveOeDcf(zeroFloor, years, dgs10, price(120));
  assert.strictEqual(noField.discount!.r_low, zero.discount!.r_low, "缺字段 → 行为等同显式0溢价");
  assert.strictEqual(noField.discount!.r_high, zero.discount!.r_high, "缺字段 → r_high 也等同显式0溢价");
}

// ── 杠杆溢价 × fallback 分支(无 DGS10)、× inverted 分支(spec Task 3 review finding 3) ──
{
  const years = [yr(2024, 133.1), yr(2023, 121), yr(2022, 110), yr(2021, 100)];
  const floorFixture = () => floorWith(lamp(1000, 100, [2022, 2023, 2024]));

  // fallback 分支:dgs10 = null → FALLBACK_BAND,溢价须逐个端点只平移一次
  const noDgs10Base = deriveOeDcf(floorFixture(), years, null, price(120));
  const noDgs10Lev = deriveOeDcf(
    { ...floorFixture(), leverage_premium: 0.02 } as unknown as ValuationFloor,
    years,
    null,
    price(120),
  );
  assert.ok(
    Math.abs(noDgs10Lev.discount!.r_low - (noDgs10Base.discount!.r_low + 0.02)) < 1e-9,
    "fallback: r_low += 溢价(仅一次)",
  );
  assert.ok(
    Math.abs(noDgs10Lev.discount!.r_high - (noDgs10Base.discount!.r_high + 0.02)) < 1e-9,
    "fallback: r_high += 溢价(仅一次)",
  );
  assert.ok(
    Math.abs(noDgs10Lev.discount!.midpoint - (noDgs10Base.discount!.midpoint + 0.02)) < 1e-9,
    "fallback: midpoint += 溢价(仅一次)",
  );

  // inverted 分支:DGS10 ≥ 7.5% → aggressive 端超过 strict 端,判据只读 dgs10Dec,不受溢价平移干扰
  const invertedDgs10 = { value: 7.6, date: "2026-06-19" };
  const invBase = deriveOeDcf(floorFixture(), years, invertedDgs10, price(120));
  const invLev = deriveOeDcf(
    { ...floorFixture(), leverage_premium: 0.02 } as unknown as ValuationFloor,
    years,
    invertedDgs10,
    price(120),
  );
  assert.strictEqual(invBase.discount!.inverted, true, "inverted: 无溢价时判据成立(前提)");
  assert.strictEqual(invLev.discount!.inverted, true, "inverted: 溢价平移不改变倒挂判据");
  assert.ok(
    Math.abs(invLev.discount!.r_low - (invBase.discount!.r_low + 0.02)) < 1e-9,
    "inverted: r_low += 溢价(仅一次)",
  );
  assert.ok(
    Math.abs(invLev.discount!.r_high - (invBase.discount!.r_high + 0.02)) < 1e-9,
    "inverted: r_high += 溢价(仅一次)",
  );
}

// ── U. 层③ 结构性 franchise 的 g1 不再被 gFund 封零(S_STRUCTURAL_GROWTH=0.5) ──
// revenue 15%/yr(log 回归精确复现,同 K 用例的等比序列)+ net_income 10%/yr(cagr,同用例 14)。
{
  const years: ValuationFloorYear[] = [
    { fiscal_year: 2024, net_income: 133.1, revenue: 152.0875 },
    { fiscal_year: 2023, net_income: 121, revenue: 132.25 },
    { fiscal_year: 2022, net_income: 110, revenue: 115 },
    { fiscal_year: 2021, net_income: 100, revenue: 100 },
  ];
  const dgs10 = { value: 4.25, date: "2026-06-19" };

  // U1) 结构性 franchise(strong,s=0.6≥0.5,非金融)+ gFund≈0(轻资产恒零)
  //     → gFund 从候选剔除,g1 由 gRaw(0.15)/cagr(0.10)决定 → min=0.10 > 0(不被 gFund 封零)。
  {
    const floor = floorWithMoat(lamp(1000, 100, [2022, 2023, 2024]), {
      sustainable_growth: 0,
      grade: "strong",
    });
    (floor as unknown as { structural_confidence: number; is_financial: boolean }).structural_confidence = 0.6;
    (floor as unknown as { structural_confidence: number; is_financial: boolean }).is_financial = false;
    const r = deriveOeDcf(floor, years, dgs10, price(120));
    assert.ok(r.assessable, "U1: assessable");
    assert.ok(r.growth_g1 != null && r.growth_g1 > 0, `U1: 结构性 franchise g1 不被 gFund 封零, got ${r.growth_g1}`);
    assert.ok(Math.abs(r.growth_g1! - 0.10) < 1e-6, `U1: g1 = min(gRaw 0.15, cagr 0.10) = 0.10, got ${r.growth_g1}`);
  }

  // U2) 低 s(0.3 < S_STRUCTURAL_GROWTH)+ 同样 gFund≈0 → 仍受 gFund 封零(顺周期不计入峰值增长)。
  {
    const floor = floorWithMoat(lamp(1000, 100, [2022, 2023, 2024]), {
      sustainable_growth: 0,
      grade: "strong",
    });
    (floor as unknown as { structural_confidence: number; is_financial: boolean }).structural_confidence = 0.3;
    (floor as unknown as { structural_confidence: number; is_financial: boolean }).is_financial = false;
    const r = deriveOeDcf(floor, years, dgs10, price(120));
    assert.strictEqual(r.growth_g1, 0, `U2: 低 s(${0.3} < ${S_STRUCTURAL_GROWTH}) 仍被 gFund=0 封零, got ${r.growth_g1}`);
  }

  // U3) 金融 franchise(is_financial=true,s=0.9 高但不适用)→ gFund 仍参与候选,行为不受本改动影响。
  //     gFund(sustainable_growth)=0.03 < gRaw(0.15)/cagr(0.10) → min 咬住 gFund → g1=0.03(封顶前),
  //     financial cap = min(financial_sgr 0.06, GROWTH_CAP_MODERATE 0.07) = 0.06,不咬 0.03。
  {
    const floor = {
      kind: "floor",
      buffett_epv: lamp(1000, 100, [2022, 2023, 2024]),
      sustainable_growth: 0.03,
      is_financial: true,
      financial_sgr: 0.06,
      structural_confidence: 0.9,
      moat_cap: { grade: "moderate", capYears: 10, durablePassed: false, basis: "test fixture" },
    } as unknown as ValuationFloor;
    const r = deriveOeDcf(floor, years, dgs10, price(120));
    assert.ok(r.assessable, "U3: assessable");
    assert.ok(
      Math.abs(r.growth_g1! - 0.03) < 1e-6,
      `U3: 金融 franchise 未被本改动影响,gFund 仍参与 min → g1≈0.03, got ${r.growth_g1}`,
    );
  }
}

console.log("ownerEarningsDcf.check.ts: deriveOeDcf + reconcileMethods OK");
