import "server-only";
import type { MarketTimeSeriesObservationInput } from "@/lib/db/market";
import policyExpectations from "@/data/sme/policy-expectations.json";
import {
  calendarDaysSince,
  persistIngestion,
  recordFailedIngestion,
  toFloat,
} from "@/lib/ingestion/common";
import { getMarketDataSourceByName, recordIngestionRun } from "@/lib/db/market";
import { updateFreshnessStatus } from "@/lib/db/freshness";

export const policyExpectationsSourceName = "SME / Policy Expectations";

function metricValue(label: string): string | null {
  const metric = (policyExpectations.key_metrics ?? []).find((item) => item.label === label);
  return metric?.value ?? null;
}

export async function ingestPolicyExpectations() {
  const startedAt = new Date().toISOString();
  try {
    const dataDate = policyExpectations.data_date ?? metricValue("SME Release Date");
    const observations: MarketTimeSeriesObservationInput[] = [];
    const metrics = [
      ["SME_FED_FUNDS_MEDIAN_LATEST", "Latest Fed Funds Median"],
      ["SME_FED_FUNDS_MEDIAN_YEAR_END_2026", "Year-end 2026 Fed Funds Median"],
      ["SME_RECESSION_PROBABILITY_NOW", "U.S. Recession Now"],
      ["SME_RECESSION_PROBABILITY_6M", "U.S. Recession in 6 Months"],
      ["SME_CORE_PCE_2026_MEDIAN", "Core PCE 2026 Median"],
    ] as const;

    if (dataDate) {
      for (const [seriesCode, label] of metrics) {
        const value = toFloat(metricValue(label));
        if (value === null) continue;
        observations.push({
          source_id: 0,
          series_code: seriesCode,
          observation_date: dataDate,
          value,
          unit: "percent",
          metadata: {
            provider: "NY Fed",
            source: "bundled SME policy expectations JSON",
            label,
          },
        });
      }
    }

    const result = await persistIngestion({
      sourceName: policyExpectationsSourceName,
      observations,
      cadence: "manual",
      startedAt,
      partial: true,
      message: "Policy Expectations ingestion uses bundled/manual SME data and does not fetch real-time values.",
      series: metrics.map(([seriesCode]) => seriesCode),
    });

    const source = await getMarketDataSourceByName(policyExpectationsSourceName);
    if (source && dataDate) {
      const days = calendarDaysSince(dataDate);
      await updateFreshnessStatus({
        source_id: source.id,
        latest_observation_date: dataDate,
        last_successful_fetch: new Date().toISOString(),
        freshness_status: days <= 100 ? "partial" : "manual_required",
        days_since_latest: days,
        expected_frequency: source.update_frequency,
        checked_at: new Date().toISOString(),
        warning: days <= 100
          ? "Policy Expectations is based on bundled/manual SME data."
          : "Policy Expectations manual SME data may need an updated file.",
      });
    } else if (source) {
      await recordIngestionRun({
        source_id: source.id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: "empty",
        rows_fetched: 0,
        error_message: "No parseable SME release date was available.",
      });
    }

    return result;
  } catch (error) {
    return recordFailedIngestion({ sourceName: policyExpectationsSourceName, startedAt, error });
  }
}
