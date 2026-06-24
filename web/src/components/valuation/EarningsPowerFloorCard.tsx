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
  franchise: "Franchise (moat) signal",
  commodity: "Commodity-like",
  value_destruction: "Below asset base",
  not_assessable: "Not assessable",
};

// Compact headline: label + the per-share range only. Detail lives in the
// collapsible section below.
function LampSummary({ lamp }: { lamp: EpvLamp }) {
  return (
    <div className="rounded-lg border border-[var(--tt-border)] p-4">
      <h4 className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">{lamp.label}</h4>
      {lamp.assessable ? (
        <p className="mt-1 font-mono text-xl text-[var(--tt-text)]">{range(lamp.per_share_low, lamp.per_share_high)}</p>
      ) : (
        <p className="mt-1 text-sm text-[var(--tt-muted)]">{lamp.not_assessable_reason ?? "Not assessable."}</p>
      )}
      <p className="mt-0.5 text-xs text-[var(--tt-faint)]">per share</p>
    </div>
  );
}

// Full method note for one lamp — rendered only inside the collapsible details.
function LampMethod({ lamp }: { lamp: EpvLamp }) {
  return (
    <div>
      <p className="font-medium text-[var(--tt-faint)]">{lamp.label}</p>
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

// Spec A: full Greenwald fair value (max(AV,EPV) + growth value) as a first-class
// headline. The range IS the v2 value-band upper edges (epv.ceilings) — no new math.
// GV collapsed → honest zero-growth-only reading. RSC, no hydration.
function FairValueHeadline({ floor, sz }: { floor: ValuationFloor; sz: StrikeZoneAssessment }) {
  const epv = sz.epv;
  if (!epv) return null;

  if (!epv.ceilings) {
    const gv = floor.growth_value;
    const reason = !gv.assessable
      ? (gv.not_assessable_reason ?? "not assessable")
      : gv.gated_to_zero
        ? "no moat / ROIIC ≤ WACC"
        : "growth value not credited";
    return (
      <div className="rounded-lg border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-accent)_5%,transparent)] p-4">
        <h4 className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Greenwald fair value</h4>
        <p className="mt-1 font-mono text-2xl tabular-nums text-[var(--tt-text)]">≈ {perShare(epv.base)}<span className="ml-1 text-sm text-[var(--tt-faint)]">/ sh</span></p>
        <p className="mt-1 text-sm text-[var(--tt-muted)]">
          Zero-growth value — no growth value credited ({reason}). The honest reading for a business whose moat is being harvested, not compounded.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-accent)_5%,transparent)] p-4">
      <h4 className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Greenwald fair value</h4>
      <p className="mt-1 font-mono text-2xl tabular-nums text-[var(--tt-text)]">
        {perShare(epv.ceilings.pessimistic)} – {perShare(epv.ceilings.optimistic)}
        <span className="ml-1 text-sm text-[var(--tt-faint)]">/ sh</span>
      </p>
      <p className="mt-1 text-sm text-[var(--tt-muted)]">
        Floor {perShare(epv.valueFloor)} → zero-growth value {perShare(epv.base)} → fair value incl. moat-driven growth (neutral{" "}
        <strong className="font-mono tabular-nums text-[var(--tt-text)]">{perShare(epv.ceilings.neutral)}</strong>).
      </p>
      <p className="mt-1 text-xs text-[var(--tt-faint)]">
        A conservative→optimistic range, not a price target or recommendation.
      </p>
    </div>
  );
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

const CONSISTENCY_TEXT: Record<string, string> = {
  both_margin_of_safety: "Price sits below both value ranges — both methods show a margin of safety.",
  within_value_range: "Price sits inside the two methods' value ranges.",
  above_both_values: "Price sits above both methods' value ranges.",
};

function CrossCheckSection({
  oeDcf,
  reconciliation,
}: {
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
}) {
  if (!oeDcf || !oeDcf.assessable || !oeDcf.tiers) return null;

  return (
    <div className="border-t border-[var(--tt-border)] pt-4 mt-4 space-y-2">
      <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
        Two-method cross-check
      </span>

      {/* Buffett owner-earnings DCF range */}
      <p className="text-sm text-[var(--tt-text)]">
        Owner-earnings DCF (Buffett, zero-growth terminal):{" "}
        <span className="font-mono">
          {perShare(oeDcf.per_share_low!)} – {perShare(oeDcf.per_share_high!)}
        </span>{" "}
        / sh
      </p>

      {reconciliation?.comparable && reconciliation.greenwald_range ? (
        <p className="text-sm text-[var(--tt-muted)]">
          Greenwald fair value:{" "}
          <span className="font-mono">
            {perShare(reconciliation.greenwald_range[0])} – {perShare(reconciliation.greenwald_range[1])}
          </span>{" "}
          / sh.{" "}
          {reconciliation.consistency ? CONSISTENCY_TEXT[reconciliation.consistency] : null}
        </p>
      ) : (
        <p className="text-sm text-[var(--tt-muted)]">
          {reconciliation?.reason_if_not ??
            "Greenwald growth ceilings unavailable — methods cannot be cross-checked; showing the owner-earnings DCF alone."}
        </p>
      )}

      {reconciliation?.divergence_flag ? (
        <p className="text-sm text-[var(--tt-warn)]">
          The two methods&apos; midpoints differ by{" "}
          <span className="font-mono">{pct(reconciliation.divergence_pct!)}</span> (&gt;20%) — the underlying
          assumptions warrant review.
        </p>
      ) : null}

      {/* Danger diagnostics (honest disclosure, not a verdict) */}
      <ul className="text-xs text-[var(--tt-muted)] space-y-1">
        {oeDcf.terminal_dependency_flag ? (
          <li>
            Terminal value is{" "}
            <span className="font-mono">{pct(oeDcf.terminal_share_pct!)}</span> of present value (&gt;70%) — this
            estimate leans heavily on the distant future.
          </li>
        ) : (
          <li>
            Terminal share of value:{" "}
            <span className="font-mono">{pct(oeDcf.terminal_share_pct!)}</span>.
          </li>
        )}
        {oeDcf.diagnostics?.oe_yield != null ? (
          <li>
            Owner-earnings yield:{" "}
            <span className="font-mono">{pct(oeDcf.diagnostics.oe_yield)}</span>
            {oeDcf.diagnostics.oe_yield_flag ? " — far from the 10-year treasury yield." : "."}
          </li>
        ) : null}
      </ul>

      {/* Provenance + mandatory disclaimer */}
      <p className="text-[11px] text-[var(--tt-faint)]">
        Growth g₁ ={" "}
        <span className="font-mono">{pct(oeDcf.growth_g1!)}</span>
        {oeDcf.declined ? " (history declining → capped at 0)" : ""}; OE FY{" "}
        {oeDcf.oe_fiscal_years?.join(", ")}; discount {oeDcf.discount?.note} {oeDcf.no_bridge_note} A range of
        observations from two valuation methods — educational only, not investment advice, and not a price target.
      </p>
    </div>
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
  const { graham_epv, buffett_epv, asset_floor, moat_reading, provenance } = floor;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-4 text-[var(--tt-accent)]" />
          Earnings Power &amp; Asset Floor
        </CardTitle>
        <CardDescription>
          Zero-growth intrinsic value ranges (EPV) and a tangible asset floor — deterministic, not price forecasts or
          recommendations.{strikeZone ? " The price comparison below is the only price-aware part." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {floor.high_leverage_warning ? (
          <p className="text-xs text-[var(--tt-warn)]">High leverage — ranges are a degraded approximation (see method).</p>
        ) : null}

        {graham_epv.assessable && buffett_epv.assessable ? (
          <p className="text-xs text-[var(--tt-muted)]">
            Two independent zero-growth lenses — together they bracket a conservative earnings-power range.
          </p>
        ) : provenance.earnings_basis_note ? (
          <p className="text-xs text-[var(--tt-muted)]">{provenance.earnings_basis_note}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <LampSummary lamp={graham_epv} />
          <LampSummary lamp={buffett_epv} />
        </div>

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

        {strikeZone?.epv ? <FairValueHeadline floor={floor} sz={strikeZone} /> : null}
        {strikeZone ? <StrikeZoneSection floor={floor} sz={strikeZone} /> : null}
        <CrossCheckSection oeDcf={oeDcf} reconciliation={reconciliation} />

        <details className="text-xs text-[var(--tt-muted)]">
          <summary className="cursor-pointer text-[var(--tt-faint)]">Method, assumptions &amp; sources</summary>
          <div className="mt-2 space-y-2">
            <LampMethod lamp={graham_epv} />
            <LampMethod lamp={buffett_epv} />
            <p>Asset floor: {asset_floor.basis}</p>
            <p>Moat reading: {moat_reading.basis_note}</p>
            <p>
              Window FY {provenance.years_used.join(", ")} · discount band {pct(provenance.discount_rate_band[0])}–
              {pct(provenance.discount_rate_band[1])} · normalized tax {pct(provenance.normalized_tax_rate)} (
              {provenance.normalized_tax_rate_basis}) · {provenance.share_count_basis} shares.
            </p>
            {floor.high_leverage_note ? <p>{floor.high_leverage_note}</p> : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
