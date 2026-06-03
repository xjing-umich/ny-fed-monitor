import "server-only";
import {
  getMarketDataSourceByName,
  listLatestObservationsBySeries,
  type MarketTimeSeriesObservation,
} from "@/lib/db/market";
import {
  getFreshnessReport,
  type MarketFreshnessReport,
  type MarketFreshnessStatusRow,
} from "@/lib/db/freshness";

type ObservationMap = Record<string, MarketTimeSeriesObservation | null>;

type FundingStressSignal = {
  signal: string;
  status: "normal" | "watch" | "elevated" | "unavailable";
  evidence: string;
  limitation: string;
};

export type FundingStressReport = {
  title: "Funding Stress Report";
  as_of: string;
  freshness_summary: {
    fresh: number;
    stale: number;
    failed: number;
    partial: number;
    empty: number;
    unknown: number;
    safe_to_analyze: boolean;
  };
  latest_reference_rates: ObservationMap;
  latest_facility_usage: ObservationMap;
  funding_stress_signals: FundingStressSignal[];
  interpretation: string;
  limitations: string[];
  confidence: "low" | "medium" | "high";
};

const SERIES = {
  referenceRates: ["SOFR", "EFFR", "OBFR", "TGCR", "BGCR"],
  facilityUsage: ["ON_RRP_USAGE", "SRP_USAGE", "ON_RRP_AWARD_RATE", "SRP_AWARD_RATE"],
  repoFinancing: ["PD_REPO_FINANCING_TOTAL"],
  settlementFails: ["PD_FAILS_TO_DELIVER", "PD_FAILS_TO_RECEIVE", "PD_FAILS_TOTAL"],
} as const;

const SOURCE_NAMES = {
  referenceRates: "Reference Rates",
  facilityUsage: "ON RRP / SRP Facility Usage",
  repoFinancing: "Repo Financing",
  settlementFails: "Settlement Fails",
} as const;

function bySourceName(report: MarketFreshnessReport): Map<string, MarketFreshnessStatusRow> {
  const rows = [
    ...report.fresh_modules,
    ...report.stale_modules,
    ...report.failed_modules,
    ...report.partial_modules,
    ...report.empty_modules,
    ...report.manual_required_modules,
    ...report.unknown_modules,
  ];
  return new Map(rows.map((row) => [row.source?.name ?? `source:${row.source_id}`, row]));
}

function freshnessStatus(
  statusBySource: Map<string, MarketFreshnessStatusRow>,
  sourceName: string
): string {
  return statusBySource.get(sourceName)?.freshness_status ?? "unknown";
}

async function latestBySourceName(sourceName: string, seriesCodes: readonly string[]): Promise<ObservationMap> {
  const source = await getMarketDataSourceByName(sourceName);
  const empty = Object.fromEntries(seriesCodes.map((series) => [series, null])) as ObservationMap;
  if (!source) return empty;
  const rows = await listLatestObservationsBySeries(source.id, [...seriesCodes]);
  const bySeries = new Map(rows.map((row) => [row.series_code, row]));
  return Object.fromEntries(
    seriesCodes.map((series) => [series, bySeries.get(series) ?? null])
  ) as ObservationMap;
}

function formatObservation(row: MarketTimeSeriesObservation | null): string {
  if (!row || row.value === null) return "unavailable";
  return `${row.value}${row.unit ? ` ${row.unit}` : ""} on ${row.observation_date}`;
}

function numeric(row: MarketTimeSeriesObservation | null): number | null {
  return row?.value ?? null;
}

function securedFundingSignal(referenceFresh: boolean, rates: ObservationMap): FundingStressSignal {
  if (!referenceFresh) {
    return {
      signal: "Secured funding conditions",
      status: "unavailable",
      evidence: "Reference Rates are not fresh, so secured funding rates are not used as current evidence.",
      limitation: "Requires fresh SOFR, TGCR, and BGCR observations.",
    };
  }
  const sofr = numeric(rates.SOFR);
  const tgcr = numeric(rates.TGCR);
  const bgcr = numeric(rates.BGCR);
  if (sofr === null || tgcr === null || bgcr === null) {
    return {
      signal: "Secured funding conditions",
      status: "unavailable",
      evidence: "One or more secured reference rates are missing.",
      limitation: "Missing SOFR, TGCR, or BGCR prevents deterministic classification.",
    };
  }
  const spread = Math.max(Math.abs(sofr - tgcr), Math.abs(sofr - bgcr));
  return {
    signal: "Secured funding conditions",
    status: spread >= 0.15 ? "watch" : "normal",
    evidence: `SOFR is ${formatObservation(rates.SOFR)}, TGCR is ${formatObservation(rates.TGCR)}, and BGCR is ${formatObservation(rates.BGCR)}.`,
    limitation: "Reference rates measure overnight funding conditions and should be interpreted with context.",
  };
}

function unsecuredFundingSignal(referenceFresh: boolean, rates: ObservationMap): FundingStressSignal {
  if (!referenceFresh) {
    return {
      signal: "Unsecured bank funding",
      status: "unavailable",
      evidence: "Reference Rates are not fresh, so EFFR and OBFR are not used as current evidence.",
      limitation: "Requires fresh EFFR and OBFR observations.",
    };
  }
  const effr = numeric(rates.EFFR);
  const obfr = numeric(rates.OBFR);
  if (effr === null || obfr === null) {
    return {
      signal: "Unsecured bank funding",
      status: "unavailable",
      evidence: "EFFR or OBFR is missing.",
      limitation: "Missing unsecured reference rates prevent deterministic classification.",
    };
  }
  const spread = Math.abs(obfr - effr);
  return {
    signal: "Unsecured bank funding",
    status: spread >= 0.15 ? "watch" : "normal",
    evidence: `EFFR is ${formatObservation(rates.EFFR)} and OBFR is ${formatObservation(rates.OBFR)}.`,
    limitation: "EFFR and OBFR are unsecured bank funding rates, not broad market stress labels.",
  };
}

function cashBufferSignal(facilityFresh: boolean, facility: ObservationMap): FundingStressSignal {
  if (!facilityFresh) {
    return {
      signal: "Cash buffer",
      status: "unavailable",
      evidence: "ON RRP / SRP Facility Usage is not fresh.",
      limitation: "Requires fresh ON RRP and SRP observations.",
    };
  }
  const onRrp = numeric(facility.ON_RRP_USAGE);
  const srp = numeric(facility.SRP_USAGE);
  if (onRrp === null && srp === null) {
    return {
      signal: "Cash buffer",
      status: "unavailable",
      evidence: "ON RRP and SRP usage observations are missing.",
      limitation: "Cannot assess facility usage without current observations.",
    };
  }
  return {
    signal: "Cash buffer",
    status: srp && srp > 0 ? "watch" : "normal",
    evidence: `ON RRP usage is ${formatObservation(facility.ON_RRP_USAGE)} and SRP usage is ${formatObservation(facility.SRP_USAGE)}.`,
    limitation: "Facility usage can reflect operational and cash-management choices, not only stress.",
  };
}

function unavailableStaleSignal(signal: string, sourceName: string): FundingStressSignal {
  return {
    signal,
    status: "unavailable",
    evidence: `${sourceName} is stale and is not used as current evidence.`,
    limitation: "Primary dealer data is not whole-market data and stale observations should not support current-stress conclusions.",
  };
}

export async function buildFundingStressReport(): Promise<FundingStressReport> {
  const freshnessReport = await getFreshnessReport();
  const statusBySource = bySourceName(freshnessReport);
  const [
    latestReferenceRates,
    latestFacilityUsage,
    latestRepoFinancing,
    latestSettlementFails,
  ] = await Promise.all([
    latestBySourceName(SOURCE_NAMES.referenceRates, SERIES.referenceRates),
    latestBySourceName(SOURCE_NAMES.facilityUsage, SERIES.facilityUsage),
    latestBySourceName(SOURCE_NAMES.repoFinancing, SERIES.repoFinancing),
    latestBySourceName(SOURCE_NAMES.settlementFails, SERIES.settlementFails),
  ]);

  const referenceStatus = freshnessStatus(statusBySource, SOURCE_NAMES.referenceRates);
  const facilityStatus = freshnessStatus(statusBySource, SOURCE_NAMES.facilityUsage);
  const repoStatus = freshnessStatus(statusBySource, SOURCE_NAMES.repoFinancing);
  const failsStatus = freshnessStatus(statusBySource, SOURCE_NAMES.settlementFails);
  const referenceFresh = referenceStatus === "fresh";
  const facilityFresh = facilityStatus === "fresh";

  const limitations: string[] = [];
  if (!referenceFresh) limitations.push("Reference Rates are not fresh, so confidence is low.");
  if (!facilityFresh) limitations.push("ON RRP / SRP Facility Usage is not fresh.");
  if (repoStatus !== "fresh") limitations.push("Repo Financing is stale or unavailable and is not used as current evidence.");
  if (failsStatus !== "fresh") limitations.push("Settlement Fails are stale or unavailable and are not used as current evidence.");
  if (!freshnessReport.safe_to_analyze) {
    limitations.push("Some modules are stale, failed, partial, or empty; analysis must mention these data limitations.");
  }

  const signals: FundingStressSignal[] = [
    securedFundingSignal(referenceFresh, latestReferenceRates),
    unsecuredFundingSignal(referenceFresh, latestReferenceRates),
    cashBufferSignal(facilityFresh, latestFacilityUsage),
    repoStatus === "fresh"
      ? {
          signal: "Dealer funding pressure",
          status: "normal",
          evidence: `Repo Financing latest observation is ${formatObservation(latestRepoFinancing.PD_REPO_FINANCING_TOTAL)}.`,
          limitation: "Primary dealer repo financing is dealer-reported data and does not represent the whole Treasury market.",
        }
      : unavailableStaleSignal("Dealer funding pressure", SOURCE_NAMES.repoFinancing),
    failsStatus === "fresh"
      ? {
          signal: "Settlement pressure",
          status: "normal",
          evidence: `Settlement fails total is ${formatObservation(latestSettlementFails.PD_FAILS_TOTAL)}.`,
          limitation: "Settlement fails alone are not a conclusive stress signal and require corroborating evidence.",
        }
      : {
          signal: "Settlement pressure",
          status: "unavailable",
          evidence: "Settlement Fails are stale and are not used as current evidence.",
          limitation: "Settlement fails alone are not a conclusive stress signal, especially when stale.",
        },
  ];

  const confidence: "low" | "medium" | "high" = !referenceFresh
    ? "low"
    : freshnessReport.safe_to_analyze
      ? "high"
      : "medium";

  const interpretation = freshnessReport.safe_to_analyze
    ? "Fresh Reference Rates and facility observations provide a current view of overnight funding conditions. Deterministic signals should still be treated as monitoring context, not trading advice."
    : "Fresh Reference Rates and ON RRP / SRP data can be discussed, but stale, failed, partial, or empty modules limit the analysis. Repo Financing and Settlement Fails should not be used as current evidence until refreshed.";

  return {
    title: "Funding Stress Report",
    as_of: new Date().toISOString(),
    freshness_summary: {
      fresh: freshnessReport.data_status_summary.fresh,
      stale: freshnessReport.data_status_summary.stale,
      failed: freshnessReport.data_status_summary.failed,
      partial: freshnessReport.data_status_summary.partial,
      empty: freshnessReport.data_status_summary.empty,
      unknown: freshnessReport.data_status_summary.unknown,
      safe_to_analyze: freshnessReport.safe_to_analyze,
    },
    latest_reference_rates: latestReferenceRates,
    latest_facility_usage: latestFacilityUsage,
    funding_stress_signals: signals,
    interpretation,
    limitations,
    confidence,
  };
}
