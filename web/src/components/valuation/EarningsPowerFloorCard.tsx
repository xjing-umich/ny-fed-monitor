import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EpvLamp, MoatSignal, PerShareUnavailable, StrikeZone, StrikeZoneAssessment, ValuationFloor } from "@/lib/valuation";
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

// Signed margin-of-safety percentage, e.g. "33%" or "−12%" (real minus glyph).
function mosPct(value: number): string {
  const p = Math.round(value * 100);
  return p < 0 ? `−${Math.abs(p)}%` : `${p}%`;
}

const ZONE_LABEL: Record<StrikeZone, string> = {
  in_strike_zone: "In strike zone",
  approaching: "Approaching",
  outside: "Above floor",
};

// Zone badge color via tokens (no opacity modifiers): accent / warn / faint.
const ZONE_TONE: Record<StrikeZone, string> = {
  in_strike_zone: "var(--tt-accent)",
  approaching: "var(--tt-warn)",
  outside: "var(--tt-faint)",
};

function ZoneBadge({ zone }: { zone: StrikeZone }) {
  const tone = ZONE_TONE[zone];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]"
      style={{ color: tone, borderColor: tone }}
    >
      {ZONE_LABEL[zone]}
    </span>
  );
}

// Static number-line band: shaded strike-zone segment + two EPV lamp ranges +
// asset-floor tick + current-price marker. RSC, no hydration — geometry is
// emitted as inline percent styles.
function StrikeBand({ floor, sz }: { floor: ValuationFloor; sz: StrikeZoneAssessment }) {
  const { graham_epv, buffett_epv } = floor;
  const epv = sz.epv;
  const candidates = [
    sz.price.close,
    sz.assetFloor?.perShare,
    graham_epv.assessable ? graham_epv.per_share_high : undefined,
    buffett_epv.assessable ? buffett_epv.per_share_high : undefined,
    epv?.ceiling,
  ].filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const domainMax = (candidates.length ? Math.max(...candidates) : sz.price.close) * 1.08 || 1;
  const xPct = (v: number) => Math.max(0, Math.min(100, (v / domainMax) * 100));
  const strikeMax = epv ? epv.floorConservative * (1 - GRAHAM_MOS) : 0;
  const lampBand = (lamp: EpvLamp, top: string) =>
    lamp.assessable && finitePositive(lamp.per_share_low) && finitePositive(lamp.per_share_high) ? (
      <div
        className="absolute h-1.5 rounded-full bg-[var(--tt-faint)]"
        style={{ left: `${xPct(lamp.per_share_low)}%`, width: `${xPct(lamp.per_share_high) - xPct(lamp.per_share_low)}%`, top }}
        title={`${lamp.label}: ${range(lamp.per_share_low, lamp.per_share_high)}`}
      />
    ) : null;

  return (
    <div className="mt-2">
      <div className="relative h-14 w-full">
        {/* baseline */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--tt-border)]" />
        {/* shaded strike-zone segment: price <= floorConservative × (1 − 1/3) */}
        {epv ? (
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
        ) : null}
        {/* two EPV lamp ranges */}
        {lampBand(graham_epv, "30%")}
        {lampBand(buffett_epv, "60%")}
        {/* asset-floor tick */}
        {sz.assetFloor ? (
          <div
            className="absolute top-1/4 h-1/2 w-px bg-[var(--tt-muted)]"
            style={{ left: `${xPct(sz.assetFloor.perShare)}%` }}
            title={`Asset floor ${perShare(sz.assetFloor.perShare)}`}
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
        {epv ? <span>▢ Strike zone ≤ {perShare(strikeMax)}</span> : null}
        <span>EPV ranges (two lenses)</span>
        {sz.assetFloor ? <span>Asset floor {perShare(sz.assetFloor.perShare)}</span> : null}
      </div>
    </div>
  );
}

function StrikeZoneSection({ floor, sz }: { floor: ValuationFloor; sz: StrikeZoneAssessment }) {
  // Currency mismatch: suppress the whole comparison, state the reason only.
  if (sz.currencyMismatch) {
    return (
      <div className="border-t border-[var(--tt-border)] pt-3">
        <h4 className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Price vs. floor</h4>
        <p className="mt-1 text-sm text-[var(--tt-muted)]">{sz.suppressedReason}</p>
      </div>
    );
  }

  const epv = sz.epv;
  const sentence = epv
    ? epv.zone === "in_strike_zone"
      ? `At ${perShare(sz.price.close)}, the price sits inside the Graham strike zone — at least a one-third margin of safety below the most conservative zero-growth earnings-power floor.`
      : epv.zone === "approaching"
        ? `At ${perShare(sz.price.close)}, the price is approaching the strike zone, but the margin of safety is still under one-third of the conservative floor.`
        : `At ${perShare(sz.price.close)}, the price is above the conservative zero-growth floor — no margin of safety on this lens.`
    : `At ${perShare(sz.price.close)}, compared against the tangible asset floor below.`;

  return (
    <div className="space-y-2 border-t border-[var(--tt-border)] pt-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Price vs. floor</h4>
        {epv ? <ZoneBadge zone={epv.zone} /> : null}
      </div>

      <StrikeBand floor={floor} sz={sz} />

      <p className="text-sm text-[var(--tt-text)]">{sentence}</p>

      {epv ? (
        <p className="text-sm text-[var(--tt-muted)]">
          Margin of safety {mosPct(epv.mosLow)} to {mosPct(epv.mosHigh)} (conservative floor {perShare(epv.floorConservative)} →
          ceiling {perShare(epv.ceiling)}).
        </p>
      ) : null}

      {sz.assetFloor?.priceBelow ? (
        <p className="text-sm text-[var(--tt-text)]">
          Price is at or below the reproducible tangible asset base ({perShare(sz.assetFloor.perShare)} / sh) — a rarer, harder
          floor.
        </p>
      ) : null}

      <p className="text-xs text-[var(--tt-muted)]">
        Mechanical, zero-growth, deliberately conservative estimate — not investment advice, not a buy/sell signal, and not a
        price target. Whether to act is your judgment. See method below.
      </p>

      <p className="text-[10px] text-[var(--tt-faint)]">
        Price as of {sz.price.date}
        {sz.price.source ? ` · ${sz.price.source}` : ""}
        {sz.stale ? " · may be stale" : ""}.
      </p>
    </div>
  );
}

export function EarningsPowerFloorCard({
  floor,
  strikeZone,
}: {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
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
            <span className="text-[var(--tt-faint)]">Asset floor </span>
            {asset_floor.assessable ? `${perShare(asset_floor.per_share)} / sh` : "—"}
          </span>
          <span>
            <span className="text-[var(--tt-faint)]">Moat </span>
            {MOAT_SHORT[moat_reading.signal]} <span className="text-[var(--tt-faint)]">(directional)</span>
          </span>
        </div>

        {strikeZone ? <StrikeZoneSection floor={floor} sz={strikeZone} /> : null}

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
