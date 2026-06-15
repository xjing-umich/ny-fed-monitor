import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EpvLamp, MoatSignal, ValuationFloor } from "@/lib/valuation";

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

export function EarningsPowerFloorCard({ floor }: { floor: ValuationFloor | undefined }) {
  if (!floor) return null;
  const { graham_epv, buffett_epv, asset_floor, moat_reading, provenance } = floor;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-4 text-[var(--tt-accent)]" />
          Earnings Power &amp; Asset Floor
        </CardTitle>
        <CardDescription>
          Zero-growth intrinsic value ranges (EPV) and a tangible asset floor — deterministic and price-free, not price
          forecasts or recommendations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {floor.high_leverage_warning ? (
          <p className="text-xs text-[var(--tt-warn)]">High leverage — ranges are a degraded approximation (see method).</p>
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
