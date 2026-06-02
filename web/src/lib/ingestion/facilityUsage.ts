import "server-only";
import type { MarketTimeSeriesObservationInput } from "@/lib/db/market";
import { fetchFacilityUsage } from "@/lib/sources/nyfed";
import { persistIngestion, recordFailedIngestion, toDate, toFloat } from "@/lib/ingestion/common";

export const facilityUsageSourceName = "ON RRP / SRP Facility Usage";

function findRecordLists(node: unknown): Array<Array<Record<string, unknown>>> {
  const lists: Array<Array<Record<string, unknown>>> = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) {
      if (value.length > 0 && value.every((item) => item && typeof item === "object")) {
        lists.push(value as Array<Record<string, unknown>>);
      }
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  }
  visit(node);
  return lists;
}

function getFirst(record: Record<string, unknown>, keys: string[]): unknown {
  const lower = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) {
    if (lower.has(key.toLowerCase())) return lower.get(key.toLowerCase());
  }
  return null;
}

function facilityFrom(record: Record<string, unknown>): "ON_RRP" | "SRP" | null {
  const text = [
    getFirst(record, ["operationType", "operation_type", "operation", "tradeType", "operationName"]),
    getFirst(record, ["description", "operationDescription", "opDesc", "statement"]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (text.includes("reverse") || text.includes("rrp")) return "ON_RRP";
  if (text.includes("repo") || text.includes("standing") || text.includes("srp") || text.includes("srf")) {
    return "SRP";
  }
  return null;
}

type FacilityDailyAggregate = {
  source_id: number;
  series_code: string;
  observation_date: string;
  value: number;
  unit: string;
  metadata: {
    provider: string;
    facility: "ON_RRP" | "SRP";
    operation_count: number;
    latest_rate?: number;
    descriptions: string[];
  };
};

function addAggregate(
  map: Map<string, FacilityDailyAggregate>,
  row: {
    facility: "ON_RRP" | "SRP";
    date: string;
    seriesCode: string;
    value: number;
    unit: string;
    description: unknown;
  }
) {
  const key = `${row.seriesCode}|${row.date}`;
  const current = map.get(key);
  const description = typeof row.description === "string" ? row.description : null;
  if (!current) {
    map.set(key, {
      source_id: 0,
      series_code: row.seriesCode,
      observation_date: row.date,
      value: row.value,
      unit: row.unit,
      metadata: {
        provider: "NY Fed",
        facility: row.facility,
        operation_count: 1,
        descriptions: description ? [description] : [],
      },
    });
    return;
  }
  current.metadata.operation_count += 1;
  if (row.unit === "millions_usd") {
    current.value += row.value;
  } else {
    current.value = row.value;
    current.metadata.latest_rate = row.value;
  }
  if (description && current.metadata.descriptions.length < 5) {
    current.metadata.descriptions.push(description);
  }
}

export async function ingestFacilityUsage() {
  const startedAt = new Date().toISOString();
  try {
    const payload = await fetchFacilityUsage();
    const bestList = findRecordLists(payload)
      .map((list) => ({
        list,
        score: list.filter((record) =>
          Object.keys(record).some((key) => /operation|accepted|submitted|counterparty/i.test(key))
        ).length,
      }))
      .sort((a, b) => b.score - a.score)[0]?.list ?? [];

    const aggregates = new Map<string, FacilityDailyAggregate>();
    for (const record of bestList) {
      const facility = facilityFrom(record);
      const date = toDate(getFirst(record, ["operationDate", "date", "tradeDate", "operation_date", "submissionDate"]));
      if (!facility || !date) continue;
      const accepted = toFloat(getFirst(record, ["acceptedAmt", "acceptedAmount", "totalAccepted", "accepted", "totalAmtAccepted"]));
      const rate = toFloat(getFirst(record, ["awardRate", "operationRate", "rate", "stopOutRate", "percentAwardRate"]));
      const baseMetadata = {
        provider: "NY Fed",
        facility,
        description: getFirst(record, ["description", "operationDescription", "opDesc", "statement"]),
        submitted_amount: toFloat(getFirst(record, ["submittedAmt", "submittedAmount", "totalSubmitted", "submitted"])),
        counterparty_count: toFloat(getFirst(record, ["counterpartyCount", "numberOfCounterparties", "participantCount"])),
      };
      if (accepted !== null) {
        addAggregate(aggregates, {
          facility,
          date,
          seriesCode: facility === "ON_RRP" ? "ON_RRP_USAGE" : "SRP_USAGE",
          value: accepted,
          unit: "millions_usd",
          description: baseMetadata.description,
        });
      }
      if (rate !== null) {
        addAggregate(aggregates, {
          facility,
          date,
          seriesCode: facility === "ON_RRP" ? "ON_RRP_AWARD_RATE" : "SRP_AWARD_RATE",
          value: rate,
          unit: "percent",
          description: baseMetadata.description,
        });
      }
    }
    const observations: MarketTimeSeriesObservationInput[] = [...aggregates.values()];

    return persistIngestion({
      sourceName: facilityUsageSourceName,
      observations,
      cadence: "business_daily",
      startedAt,
      series: ["ON_RRP_USAGE", "SRP_USAGE", "ON_RRP_AWARD_RATE", "SRP_AWARD_RATE"],
    });
  } catch (error) {
    return recordFailedIngestion({ sourceName: facilityUsageSourceName, startedAt, error });
  }
}
