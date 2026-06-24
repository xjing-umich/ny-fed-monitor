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

// The readable read: a plain status (margin of safety / fair value / above fair value),
// a neutral cheaper→pricier gauge with the price marker, one sentence. Every precise
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
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  // bucket: prefer the two-method consistency, else the single-method position.
  const bucket =
    (bothMethods ? bucketFromConsistency(reconciliation?.consistency) : null) ?? bucketFromPosition(epv.position);
  const onMethods = bothMethods ? "both methods" : "this method";

  const status = bucket === "below" ? "Margin of safety" : bucket === "within" ? "In fair-value range" : "Above fair value";
  const sub =
    bucket === "below"
      ? `Price sits below ${onMethods}' value estimate.`
      : bucket === "within"
        ? `Price sits within ${onMethods}' value estimate.`
        : "Little to no margin of safety today.";
  const sits = bucket === "below" ? "below both" : bucket === "within" ? "inside both" : "above both";
  const sentence = bothMethods
    ? `Two methods value the business — a conservative owner-earnings DCF and a growth-credited Greenwald estimate. Today’s price sits ${sits}.`
    : `A conservative earnings-power estimate; today’s price sits ${bucket === "below" ? "below" : bucket === "within" ? "inside" : "above"} it.`;

  // gauge: three categorical zones (cheaper · fair · pricier); marker placed within the
  // active zone by how far the price runs through the value range.
  const spanRange = rangeHi - rangeLo || 1;
  const marker =
    bucket === "below"
      ? 33 * clamp(price / (rangeLo || 1), 0, 1)
      : bucket === "within"
        ? 33 + 33 * clamp((price - rangeLo) / spanRange, 0, 1)
        : 66 + 33 * clamp((price - rangeHi) / (rangeHi || 1), 0, 1);
  const markerPct = clamp(marker, 2, 98);
  const zones: { key: Bucket; label: string }[] = [
    { key: "below", label: "margin of safety" },
    { key: "within", label: "fair value" },
    { key: "above", label: "above fair value" },
  ];

  return (
    <div className="space-y-3">
      {/* status */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-md border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-muted)_8%,transparent)] px-2.5 py-1 text-sm font-medium text-[var(--tt-text)]">
          {status}
        </span>
        <span className="text-sm text-[var(--tt-muted)]">{sub}</span>
      </div>

      {/* neutral cheaper → pricier gauge */}
      <div>
        <div className="relative pt-4">
          <div className="flex h-7 overflow-hidden rounded-md">
            {zones.map((z) => {
              const active = z.key === bucket;
              return (
                <div
                  key={z.key}
                  className="flex flex-1 items-center justify-center text-[10px]"
                  style={{
                    backgroundColor: `color-mix(in srgb, var(--tt-faint) ${active ? 16 : 7}%, transparent)`,
                    color: active ? "var(--tt-text)" : "var(--tt-faint)",
                  }}
                >
                  {z.label}
                </div>
              );
            })}
          </div>
          {/* price marker */}
          <div className="absolute bottom-0 top-3 w-0.5 bg-[var(--tt-accent)]" style={{ left: `${markerPct}%` }} title={`Price ${perShare(price)}`} />
          <span className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-[var(--tt-text)]" style={{ left: `${markerPct}%` }}>{usd0(price)}</span>
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--tt-faint)]">
          <span>cheaper</span>
          <span>{usd0(rangeLo)} – {usd0(rangeHi)} value estimate</span>
          <span>pricier</span>
        </div>
      </div>

      <p className="text-sm text-[var(--tt-text)]">{sentence}</p>

      {sz.assetFloor?.priceBelow ? (
        <p className="text-sm text-[var(--tt-muted)]">
          Price is at or below the reproducible tangible asset base ({usd0(sz.assetFloor.perShare)} / sh) — a rarer, harder floor.
        </p>
      ) : null}

      <p className="text-xs text-[var(--tt-muted)]">An observation from two valuation methods — not investment advice, not a buy/sell signal, and not a price target.</p>

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
