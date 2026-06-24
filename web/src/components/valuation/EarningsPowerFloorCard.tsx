import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EpvLamp, MoatSignal, PerShareUnavailable, StrikeZoneAssessment, ValuationFloor, ValuePosition } from "@/lib/valuation";
import type { OeDcfAssessment, MethodReconciliation } from "@/lib/valuation/types";

function perShare(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
// Whole-dollar form for the readable main view (precise cents live in the fold).
function usd0(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${Math.round(value).toLocaleString()}`;
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

// Compact growth-value provenance for the folded method section (assumptions externalized).
function growthSummary(floor: ValuationFloor): string {
  const gv = floor.growth_value;
  if (!gv.assessable) return `Growth value not assessable${gv.not_assessable_reason ? ` — ${gv.not_assessable_reason}` : "."}`;
  if (gv.gated_to_zero) return "Growth value gated to zero — no moat / ROIIC ≤ WACC, so no growth value is credited.";
  const dur = gv.duration_years != null ? `${gv.duration_years} yr` : "the modeled window";
  const roiic = gv.roiic != null ? `ROIIC ≈ ${pct(gv.roiic)}` : "the modeled ROIIC";
  return `Growth value: if the moat holds for ${dur} at ${roiic}, ${perShare(gv.per_share.pessimistic)}–${perShare(gv.per_share.optimistic)} / sh (neutral ${perShare(gv.per_share.neutral)}). Conservative, not a forecast.`;
}

// Where the price sits relative to the combined value range — three plain buckets.
type Bucket = "below" | "within" | "above";
function bucketFromConsistency(c?: string): Bucket | null {
  if (c === "both_margin_of_safety") return "below";
  if (c === "within_value_range") return "within";
  if (c === "above_both_values") return "above";
  return null;
}
function bucketFromPosition(p: ValuePosition): Bucket {
  if (p === "in_strike_zone" || p === "approaching") return "below";
  if (p === "above_optimistic" || p === "above_zero_growth") return "above";
  return "within";
}

// One band segment on the value-range line. lo/hi pre-ordered so width is never negative.
function bandSeg(xPct: (v: number) => number, lo: number, hi: number, color: string, title: string) {
  return (
    <div
      className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
      style={{ left: `${xPct(lo)}%`, width: `${Math.max(0, xPct(hi) - xPct(lo))}%`, backgroundColor: color }}
      title={title}
    />
  );
}

const DCF_COLOR = "#7F77DD"; // conservative owner-earnings DCF
const GW_COLOR = "#1D9E75"; // growth-credited Greenwald

// The readable value-range read: a one-line verdict, one combined band (two tones =
// the two methods, its WIDTH = how much they agree), one plain sentence. Every precise
// number lives in the folded method section. Renders only with a price-aware assessment.
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
  const price = sz.price.close;

  const oeOk = oeDcf?.assessable && finitePositive(oeDcf.per_share_low) && finitePositive(oeDcf.per_share_high);
  const conservative = oeOk ? { lo: oeDcf!.per_share_low!, hi: oeDcf!.per_share_high! } : null;
  // Greenwald lens: the growth band, or a single zero-growth point when growth is not credited.
  const growth = epv.ceilings ? { lo: epv.ceilings.pessimistic, hi: epv.ceilings.optimistic } : { lo: epv.base, hi: epv.base };

  const ends = [conservative?.lo, conservative?.hi, growth.lo, growth.hi].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n),
  );
  const rangeLo = Math.min(...ends);
  const rangeHi = Math.max(...ends);
  const bothMethods = !!conservative && !!epv.ceilings;

  // verdict bucket: prefer the two-method consistency, else the single-method position.
  const bucket =
    (bothMethods ? bucketFromConsistency(reconciliation?.consistency) : null) ?? bucketFromPosition(epv.position);
  const methodWord = bothMethods ? "either method" : "this method";
  const nearTop = price <= rangeHi * 1.08;
  let phrase: string;
  let sub: string;
  if (bucket === "below") {
    phrase = `is below its ${usd0(rangeLo)} – ${usd0(rangeHi)} value range`;
    sub = `A margin of safety on ${bothMethods ? "both methods" : "this method"}.`;
  } else if (bucket === "within") {
    phrase = `sits inside its ${usd0(rangeLo)} – ${usd0(rangeHi)} value range`;
    sub = "Within what the methods consider fair.";
  } else {
    phrase = `${nearTop ? "is at the top of" : "is above"} its ${usd0(rangeLo)} – ${usd0(rangeHi)} value range`;
    sub = `Looks fully priced — little to no margin of safety on ${methodWord}.`;
  }

  // axis framed around the value range + price so the band fills the width
  const domLo = Math.min(rangeLo, price) * 0.96;
  const domHi = Math.max(rangeHi, price) * 1.04;
  const span = domHi - domLo || 1;
  const xPct = (v: number) => Math.max(0, Math.min(100, ((v - domLo) / span) * 100));

  const widthSentence =
    bothMethods && reconciliation?.comparable
      ? reconciliation.divergence_flag
        ? "The range is wide because the two methods disagree on how much to credit the moat’s future growth — normal for a compounder."
        : "The two methods broadly agree, which lends the range more weight."
      : null;

  return (
    <div className="space-y-3">
      {/* verdict */}
      <div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono text-2xl tabular-nums text-[var(--tt-text)]">{usd0(price)}</span>
          <span className="text-sm text-[var(--tt-muted)]">{phrase}</span>
        </div>
        <p className="mt-0.5 text-xs text-[var(--tt-faint)]">{sub}</p>
      </div>

      {/* one combined value-range band */}
      <div>
        <div className="relative h-8 w-full">
          {/* range envelope */}
          <div
            className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-[var(--tt-border)]"
            style={{ left: `${xPct(rangeLo)}%`, width: `${Math.max(0, xPct(rangeHi) - xPct(rangeLo))}%` }}
            aria-hidden
          />
          {conservative ? bandSeg(xPct, conservative.lo, conservative.hi, DCF_COLOR, `Conservative DCF ${range(conservative.lo, conservative.hi)}`) : null}
          {epv.ceilings ? bandSeg(xPct, growth.lo, growth.hi, GW_COLOR, `Growth-credited Greenwald ${range(growth.lo, growth.hi)}`) : null}
          {/* price marker */}
          <div className="absolute inset-y-0 w-0.5 bg-[var(--tt-accent)]" style={{ left: `${xPct(price)}%` }} title={`Price ${perShare(price)}`} />
          {/* end labels */}
          <span className="absolute top-0 left-0 font-mono text-[10px] text-[var(--tt-faint)]" style={{ left: `${xPct(rangeLo)}%` }}>{usd0(rangeLo)}</span>
          <span className="absolute top-0 font-mono text-[10px] text-[var(--tt-faint)] -translate-x-full" style={{ left: `${xPct(rangeHi)}%` }}>{usd0(rangeHi)}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-[var(--tt-faint)]">
          <span style={{ color: "var(--tt-accent)" }}>▏Price {usd0(price)}</span>
          {conservative ? <span><span style={{ color: DCF_COLOR }}>▬</span> Conservative (owner-earnings DCF)</span> : null}
          {epv.ceilings ? <span><span style={{ color: GW_COLOR }}>▬</span> Growth-credited (Greenwald)</span> : null}
        </div>
      </div>

      {widthSentence ? <p className="text-sm text-[var(--tt-text)]">{widthSentence}</p> : null}

      {sz.assetFloor?.priceBelow ? (
        <p className="text-sm text-[var(--tt-text)]">
          Price is at or below the reproducible tangible asset base ({usd0(sz.assetFloor.perShare)} / sh) — a rarer, harder floor.
        </p>
      ) : null}

      <p className="text-xs text-[var(--tt-muted)]">
        Observations from two valuation methods — not investment advice, not a buy/sell signal, and not a price target.
      </p>

      <p className="text-[10px] text-[var(--tt-faint)]">
        Price as of {sz.price.date}
        {sz.price.source ? ` · ${sz.price.source}` : ""}
        {sz.stale ? " · may be stale" : ""}
        {oeDcf?.discount?.dgs10_date ? ` · DGS10 ${oeDcf.discount.dgs10_value != null ? pct1(oeDcf.discount.dgs10_value) : ""} @ ${oeDcf.discount.dgs10_date}` : ""}.
      </p>
    </div>
  );
}

// Price-free fallback: no axis is meaningful without a price, so show the two
// zero-growth lenses, the asset floor and moat, and the owner-earnings DCF range
// as compact text.
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

// Everything precise and secondary, collapsed by default: a one-line numbers summary,
// then per-lamp method notes, asset/moat basis, growth value, the window/tax/shares
// provenance, and the owner-earnings DCF assumptions.
function MethodDetails({
  floor,
  sz,
  oeDcf,
  reconciliation,
}: {
  floor: ValuationFloor;
  sz?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
}) {
  const { graham_epv, buffett_epv, asset_floor, moat_reading, provenance } = floor;
  const epv = sz?.epv;
  return (
    <details className="text-xs text-[var(--tt-muted)]">
      <summary className="cursor-pointer text-[var(--tt-faint)]">Method &amp; numbers</summary>
      <div className="mt-2 space-y-2">
        {/* precise numbers summary */}
        <p className="font-mono text-[var(--tt-text)]">
          {oeDcf?.assessable && oeDcf.per_share_low != null ? `Owner-earnings DCF ${range(oeDcf.per_share_low, oeDcf.per_share_high)}` : null}
          {epv?.ceilings ? ` · Greenwald ${range(epv.ceilings.pessimistic, epv.ceilings.optimistic)} (neutral ${perShare(epv.ceilings.neutral)})` : epv ? ` · Greenwald zero-growth ${perShare(epv.base)}` : null}
          {epv ? ` · zero-growth base ${perShare(epv.base)}` : null}
          {sz?.assetFloor ? ` · reproduction ${perShare(sz.assetFloor.perShare)}` : null}
        </p>
        <p>
          Moat {MOAT_SHORT[moat_reading.signal]}
          {oeDcf?.assessable && oeDcf.terminal_share_pct != null ? ` · terminal value ${pct(oeDcf.terminal_share_pct)} of present value${oeDcf.terminal_dependency_flag ? " (>70% — leans on the distant future)" : ""}` : ""}
          {oeDcf?.diagnostics?.oe_yield != null ? ` · owner-earnings yield ${pct(oeDcf.diagnostics.oe_yield)}${oeDcf.discount?.dgs10_value != null ? ` vs 10Y ${pct1(oeDcf.discount.dgs10_value)}` : ""}` : ""}.
        </p>
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

        <MethodDetails floor={floor} sz={strikeZone} oeDcf={oeDcf} reconciliation={reconciliation} />
      </CardContent>
    </Card>
  );
}
