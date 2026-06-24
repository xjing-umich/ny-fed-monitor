import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EpvLamp, MoatSignal, PerShareUnavailable, StrikeZoneAssessment, ValuationFloor, ValuePosition } from "@/lib/valuation";
import type { OeDcfAssessment, MethodReconciliation } from "@/lib/valuation/types";
import { GRAHAM_MOS } from "@/lib/valuation";

function perShare(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function range(low: number | undefined, high: number | undefined): string {
  if (low == null || high == null) return "—";
  return `${perShare(low)} – ${perShare(high)}`;
}
function pct(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(0)}%`;
}
function pct1(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}
function usd(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function finitePositive(n: number | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

const MOAT_SHORT: Record<MoatSignal, string> = {
  franchise: "Franchise (moat)",
  commodity: "Commodity-like",
  value_destruction: "Below asset base",
  not_assessable: "Not assessable",
};

// Full method note for one lamp — rendered only inside the collapsible details.
function LampMethod({ lamp }: { lamp: EpvLamp }) {
  return (
    <div>
      <p className="font-medium text-[var(--tt-faint)]">
        {lamp.label}
        {lamp.assessable ? <span className="ml-1 font-mono text-[var(--tt-muted)]">{range(lamp.per_share_low, lamp.per_share_high)} / sh</span> : null}
      </p>
      {!lamp.assessable && lamp.not_assessable_reason ? <p>{lamp.not_assessable_reason}</p> : null}
      <p>
        {lamp.method.earnings_basis} {lamp.method.leverage_treatment} {lamp.method.denominator} {lamp.method.bridge}
      </p>
      <p>Years: {lamp.method.years_used.join(", ")}</p>
      {lamp.method.simplifications.length > 0 ? <p>v1 simplifications: {lamp.method.simplifications.join(" ")}</p> : null}
    </div>
  );
}

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

const POSITION_SENTENCE: Record<ValuePosition, (sz: StrikeZoneAssessment) => string> = {
  in_strike_zone: (sz) =>
    `At ${perShare(sz.price.close)}, the price sits inside the strike zone — at least a one-third margin of safety below the conservative value floor (max of reproduction value and zero-growth earnings power).`,
  approaching: (sz) =>
    `At ${perShare(sz.price.close)}, the price is approaching the strike zone, but the margin of safety is still under one-third of the conservative value floor.`,
  zero_growth_zone: (sz) =>
    `At ${perShare(sz.price.close)}, the price is within the zero-growth value range — above the conservative floor but at or below what the business is worth assuming no growth at all.`,
  moat_band: (sz) =>
    `At ${perShare(sz.price.close)}, the price is within the moat-adjusted value band — above zero-growth value but at or below the neutral growth-value upper bound.`,
  upper_band: (sz) =>
    `At ${perShare(sz.price.close)}, the price is in the upper band — only the optimistic growth scenario supports today's price.`,
  above_optimistic: (sz) =>
    `At ${perShare(sz.price.close)}, the price is above the optimistic upper bound — beyond even the optimistic moat-driven growth value.`,
  above_zero_growth: (sz) =>
    `At ${perShare(sz.price.close)}, the price is above the zero-growth value. Growth value is not credited here, so there is no moat-adjusted band above this point.`,
};

// Compact growth-value provenance for the folded method section (assumptions externalized).
function growthSummary(floor: ValuationFloor): string {
  const gv = floor.growth_value;
  if (!gv.assessable) return `Growth value not assessable${gv.not_assessable_reason ? ` — ${gv.not_assessable_reason}` : "."}`;
  if (gv.gated_to_zero) return "Growth value gated to zero — no moat / ROIIC ≤ WACC, so no growth value is credited.";
  const dur = gv.duration_years != null ? `${gv.duration_years} yr` : "the modeled window";
  const roiic = gv.roiic != null ? `ROIIC ≈ ${pct(gv.roiic)}` : "the modeled ROIIC";
  return `Growth value: if the moat holds for ${dur} at ${roiic}, ${perShare(gv.per_share.pessimistic)}–${perShare(gv.per_share.optimistic)} / sh (neutral ${perShare(gv.per_share.neutral)}). Conservative, not a forecast.`;
}

const CONSISTENCY_TEXT: Record<string, string> = {
  both_margin_of_safety: "Price sits below both methods' value ranges — both show a margin of safety.",
  within_value_range: "Price sits inside both methods' value ranges.",
  above_both_values: "Price sits above both methods' value ranges.",
};

// Second sentence of the reading: the owner-earnings DCF and how the two methods relate.
// Divergence on a quality compounder is expected (conservative DCF vs growth-credited
// Greenwald), surfaced honestly — never framed as advice or an error.
function crossCheckSentence(oeDcf?: OeDcfAssessment, reconciliation?: MethodReconciliation): string | null {
  if (!oeDcf?.assessable || oeDcf.per_share_low == null || oeDcf.per_share_high == null) return null;
  const dcf = `The owner-earnings DCF reads ${range(oeDcf.per_share_low, oeDcf.per_share_high)} / sh`;
  if (reconciliation?.comparable && reconciliation.divergence_flag && reconciliation.divergence_pct != null) {
    return `${dcf}; the two methods differ ~${pct(reconciliation.divergence_pct)} — a deliberately conservative DCF (growth capped, zero-growth terminal) against growth-credited Greenwald, a gap that is expected for a compounder rather than an error.`;
  }
  if (reconciliation?.comparable && reconciliation.consistency) {
    return `${dcf}. ${CONSISTENCY_TEXT[reconciliation.consistency] ?? ""}`.trim();
  }
  if (reconciliation && !reconciliation.comparable) {
    return `${dcf}; the Greenwald growth ceilings are unavailable, so the two methods cannot be cross-checked here.`;
  }
  return `${dcf}.`;
}

// One quality chip. Warn tone when the diagnostic crosses its disclosure threshold.
function Chip({ label, warn = false }: { label: string; warn?: boolean }) {
  const tone = warn ? "var(--tt-warn)" : "var(--tt-muted)";
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs"
      style={{ color: tone, backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)" }}
    >
      {label}
    </span>
  );
}

// The value spine: one fair-value headline + one number line carrying BOTH methods +
// one reading + quality chips. Renders only when there is a price-aware EPV assessment.
// Static geometry (inline %), RSC, no hydration.
function ValueSpine({
  floor,
  sz,
  oeDcf,
  reconciliation,
}: {
  floor: ValuationFloor;
  sz: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
}) {
  const epv = sz.epv;
  if (!epv) return null;
  const { graham_epv, buffett_epv } = floor;
  const oeOk = oeDcf?.assessable && finitePositive(oeDcf.per_share_low) && finitePositive(oeDcf.per_share_high);

  // headline value range: Greenwald growth band, or zero-growth base when GV collapsed.
  const headline = epv.ceilings
    ? `${perShare(epv.ceilings.pessimistic)} – ${perShare(epv.ceilings.optimistic)}`
    : `≈ ${perShare(epv.base)}`;
  const headlineSub = epv.ceilings
    ? `neutral ${perShare(epv.ceilings.neutral)}`
    : "zero-growth value — no growth credited";

  // number-line domain
  const candidates = [
    sz.price.close,
    epv.valueFloor,
    epv.base,
    epv.ceilings?.optimistic,
    sz.assetFloor?.perShare,
    graham_epv.assessable ? graham_epv.per_share_high : undefined,
    buffett_epv.assessable ? buffett_epv.per_share_high : undefined,
    oeOk ? oeDcf!.per_share_high : undefined,
  ].filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const domainMax = (candidates.length ? Math.max(...candidates) : sz.price.close) * 1.08 || 1;
  const xPct = (v: number) => Math.max(0, Math.min(100, (v / domainMax) * 100));
  const strikeMax = epv.valueFloor * (1 - GRAHAM_MOS);

  const tick = (value: number, label: string, tone: string, full = false) => (
    <div
      className={`absolute ${full ? "inset-y-0" : "top-1/4 h-1/2"} w-px`}
      style={{ left: `${xPct(value)}%`, backgroundColor: tone }}
      title={`${label} ${perShare(value)}`}
    />
  );

  return (
    <div className="space-y-3">
      {/* headline + price */}
      <div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs text-[var(--tt-faint)]">Fair value</span>
          <span className="font-mono text-2xl tabular-nums text-[var(--tt-text)]">{headline}</span>
          <span className="text-xs text-[var(--tt-faint)]">/ sh · {headlineSub}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <span className="rounded-md bg-[color-mix(in_srgb,var(--tt-accent)_10%,transparent)] px-2 py-0.5 font-mono text-xs text-[var(--tt-text)]">
            Price {perShare(sz.price.close)}
          </span>
          <PositionBadge position={epv.position} />
        </div>
      </div>

      {/* one number line, both methods */}
      <div>
        <div className="relative h-16 w-full">
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--tt-border)]" />
          {/* strike-zone shade */}
          <div
            className="absolute top-1/2 h-10 -translate-y-1/2 rounded-sm border"
            style={{
              left: 0,
              width: `${xPct(strikeMax)}%`,
              backgroundColor: "color-mix(in srgb, var(--tt-accent) 12%, transparent)",
              borderColor: "color-mix(in srgb, var(--tt-accent) 35%, transparent)",
            }}
            aria-hidden
          />
          {/* Buffett OE-DCF band (upper) */}
          {oeOk ? (
            <div
              className="absolute h-1.5 rounded-full"
              style={{
                left: `${xPct(oeDcf!.per_share_low!)}%`,
                width: `${xPct(oeDcf!.per_share_high!) - xPct(oeDcf!.per_share_low!)}%`,
                top: "28%",
                backgroundColor: "#7F77DD",
              }}
              title={`Owner-earnings DCF: ${range(oeDcf!.per_share_low, oeDcf!.per_share_high)}`}
            />
          ) : null}
          {/* Greenwald band (lower) — growth ceilings, or a single zero-growth point */}
          {epv.ceilings ? (
            <div
              className="absolute h-1.5 rounded-full"
              style={{
                left: `${xPct(epv.ceilings.pessimistic)}%`,
                width: `${xPct(epv.ceilings.optimistic) - xPct(epv.ceilings.pessimistic)}%`,
                top: "60%",
                backgroundColor: "#1D9E75",
              }}
              title={`Greenwald fair value: ${range(epv.ceilings.pessimistic, epv.ceilings.optimistic)}`}
            />
          ) : null}
          {/* zero-growth base + reproduction-value reference ticks */}
          {tick(epv.base, "Zero-growth base", "var(--tt-muted)")}
          {sz.assetFloor ? tick(sz.assetFloor.perShare, "Reproduction value", "var(--tt-faint)") : null}
          {/* current price marker (full height) */}
          {tick(sz.price.close, "Price", "var(--tt-accent)", true)}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-[var(--tt-faint)]">
          <span style={{ color: "var(--tt-accent)" }}>▏Price {perShare(sz.price.close)}</span>
          {oeOk ? <span><span style={{ color: "#7F77DD" }}>▬</span> Owner-earnings DCF {range(oeDcf!.per_share_low, oeDcf!.per_share_high)}</span> : null}
          {epv.ceilings ? <span><span style={{ color: "#1D9E75" }}>▬</span> Greenwald {range(epv.ceilings.pessimistic, epv.ceilings.optimistic)}</span> : null}
          <span>Zero-growth {perShare(epv.base)}</span>
          {sz.assetFloor ? <span>Reproduction {perShare(sz.assetFloor.perShare)}</span> : null}
        </div>
      </div>

      {/* reading: one position sentence + one cross-check sentence */}
      <p className="text-sm text-[var(--tt-text)]">{POSITION_SENTENCE[epv.position](sz)}</p>
      {crossCheckSentence(oeDcf, reconciliation) ? (
        <p className="text-sm text-[var(--tt-muted)]">{crossCheckSentence(oeDcf, reconciliation)}</p>
      ) : null}

      {/* quality chips */}
      <div className="flex flex-wrap gap-2">
        <Chip label={`Moat: ${MOAT_SHORT[floor.moat_reading.signal]}`} />
        {oeDcf?.assessable && oeDcf.terminal_share_pct != null ? (
          <Chip label={`Terminal ${pct(oeDcf.terminal_share_pct)} of value`} warn={!!oeDcf.terminal_dependency_flag} />
        ) : null}
        {oeDcf?.diagnostics?.oe_yield != null ? (
          <Chip
            label={`OE yield ${pct(oeDcf.diagnostics.oe_yield)}${oeDcf.discount?.dgs10_value != null ? ` vs 10Y ${pct1(oeDcf.discount.dgs10_value)}` : ""}`}
            warn={!!oeDcf.diagnostics.oe_yield_flag}
          />
        ) : null}
      </div>

      {sz.assetFloor?.priceBelow ? (
        <p className="text-sm text-[var(--tt-text)]">
          Price is at or below the reproducible tangible asset base ({perShare(sz.assetFloor.perShare)} / sh) — a rarer, harder floor.
        </p>
      ) : null}

      {/* one disclaimer */}
      <p className="text-xs text-[var(--tt-muted)]">
        A range of observations from two valuation methods — not investment advice, not a buy/sell signal, and not a price target.
        Growth value is a deliberately conservative estimate, never a prediction. Whether to act is your judgment.
      </p>

      {/* one provenance micro-line */}
      <p className="text-[10px] text-[var(--tt-faint)]">
        Price as of {sz.price.date}
        {sz.price.source ? ` · ${sz.price.source}` : ""}
        {sz.stale ? " · may be stale" : ""}
        {oeDcf?.discount?.dgs10_date ? ` · DGS10 ${oeDcf.discount.dgs10_value != null ? pct1(oeDcf.discount.dgs10_value) : ""} @ ${oeDcf.discount.dgs10_date}` : ""}
        {epv.growthCollapsed ? " · growth value not credited" : ""}.
      </p>
    </div>
  );
}

// Price-free fallback: no axis is meaningful without a price, so show the two
// zero-growth lenses, the asset floor and moat, and the owner-earnings DCF range
// as compact text. Mirrors the data the spine would carry, minus price positioning.
function CompactFloor({ floor, oeDcf, suppressedReason }: { floor: ValuationFloor; oeDcf?: OeDcfAssessment; suppressedReason?: string }) {
  const { graham_epv, buffett_epv, asset_floor, moat_reading } = floor;
  const lampText = (lamp: EpvLamp) =>
    lamp.assessable ? range(lamp.per_share_low, lamp.per_share_high) : (lamp.not_assessable_reason ?? "not assessable");
  return (
    <div className="space-y-2">
      {suppressedReason ? <p className="text-sm text-[var(--tt-muted)]">{suppressedReason}</p> : null}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--tt-text)]">
        <span><span className="text-[var(--tt-faint)]">{graham_epv.label} </span>{lampText(graham_epv)}</span>
        <span><span className="text-[var(--tt-faint)]">{buffett_epv.label} </span>{lampText(buffett_epv)}</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--tt-text)]">
        <span>
          <span className="text-[var(--tt-faint)]">Reproduction value </span>
          {asset_floor.assessable ? `${perShare(asset_floor.per_share)} / sh` : "—"}
        </span>
        <span><span className="text-[var(--tt-faint)]">Moat </span>{MOAT_SHORT[moat_reading.signal]} <span className="text-[var(--tt-faint)]">(directional)</span></span>
      </div>
      {oeDcf?.assessable && oeDcf.per_share_low != null && oeDcf.per_share_high != null ? (
        <p className="text-sm text-[var(--tt-muted)]">
          Owner-earnings DCF (Buffett, zero-growth terminal): {range(oeDcf.per_share_low, oeDcf.per_share_high)} / sh.
        </p>
      ) : null}
      <p className="text-xs text-[var(--tt-muted)]">
        Zero-growth intrinsic ranges and a tangible asset floor — not investment advice, not a buy/sell signal, and not a price target.
      </p>
    </div>
  );
}

// Everything secondary lives here, collapsed by default: per-lamp method notes,
// asset-floor and moat basis, the window/discount/tax/shares provenance, and the
// owner-earnings DCF assumptions (g1, OE years, discount band, no-bridge, divergence).
function MethodDetails({
  floor,
  oeDcf,
  reconciliation,
}: {
  floor: ValuationFloor;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
}) {
  const { graham_epv, buffett_epv, asset_floor, moat_reading, provenance } = floor;
  return (
    <details className="text-xs text-[var(--tt-muted)]">
      <summary className="cursor-pointer text-[var(--tt-faint)]">Method, assumptions &amp; sources</summary>
      <div className="mt-2 space-y-2">
        <LampMethod lamp={graham_epv} />
        <LampMethod lamp={buffett_epv} />
        {asset_floor.assessable && (finitePositive(asset_floor.tangible_net_assets) || finitePositive(asset_floor.capitalized_rd)) ? (
          <p>
            Reproduction value = tangible net assets {usd(asset_floor.tangible_net_assets)}
            {finitePositive(asset_floor.capitalized_rd)
              ? ` + capitalized R&D ${usd(asset_floor.capitalized_rd)}${asset_floor.rd_years_used?.length ? ` (FY ${asset_floor.rd_years_used.join(", ")})` : ""}`
              : ""}
            {` = ${perShare(asset_floor.per_share)} / sh`}. {asset_floor.basis}
          </p>
        ) : (
          <p>Asset floor: {asset_floor.basis}</p>
        )}
        <p>Moat reading: {moat_reading.basis_note}</p>
        <p>{growthSummary(floor)}</p>
        <p>
          Window FY {provenance.years_used.join(", ")} · discount band {pct(provenance.discount_rate_band[0])}–
          {pct(provenance.discount_rate_band[1])} · normalized tax {pct(provenance.normalized_tax_rate)} (
          {provenance.normalized_tax_rate_basis}) · {provenance.share_count_basis} shares.
        </p>
        {oeDcf?.assessable ? (
          <p>
            Owner-earnings DCF: growth g₁ {pct(oeDcf.growth_g1)}
            {oeDcf.declined ? " (history declining → capped at 0)" : ""} · OE FY {oeDcf.oe_fiscal_years?.join(", ")} ·{" "}
            {oeDcf.discount?.note} {oeDcf.no_bridge_note}
            {reconciliation?.comparable && reconciliation.divergence_pct != null
              ? ` Two-method midpoint gap ${pct(reconciliation.divergence_pct)}.`
              : ""}
          </p>
        ) : null}
        {floor.high_leverage_note ? <p>{floor.high_leverage_note}</p> : null}
      </div>
    </details>
  );
}

export function EarningsPowerFloorCard({
  floor,
  strikeZone,
  oeDcf,
  reconciliation,
}: {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
}) {
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

  const { graham_epv, buffett_epv, provenance } = floor;
  const hasSpine = !!strikeZone?.epv && !strikeZone.currencyMismatch;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-4 text-[var(--tt-accent)]" />
          Earnings Power &amp; Asset Floor
        </CardTitle>
        <CardDescription>
          Two intrinsic-value methods and a tangible asset floor — deterministic, not price forecasts or recommendations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {floor.high_leverage_warning ? (
          <p className="text-xs text-[var(--tt-warn)]">High leverage — ranges are a degraded approximation (see method).</p>
        ) : null}

        {!(graham_epv.assessable && buffett_epv.assessable) && provenance.earnings_basis_note ? (
          <p className="text-xs text-[var(--tt-muted)]">{provenance.earnings_basis_note}</p>
        ) : null}

        {hasSpine ? (
          <ValueSpine floor={floor} sz={strikeZone!} oeDcf={oeDcf} reconciliation={reconciliation} />
        ) : (
          <CompactFloor
            floor={floor}
            oeDcf={oeDcf}
            suppressedReason={strikeZone?.currencyMismatch ? strikeZone.suppressedReason : undefined}
          />
        )}

        <MethodDetails floor={floor} oeDcf={oeDcf} reconciliation={reconciliation} />
      </CardContent>
    </Card>
  );
}
