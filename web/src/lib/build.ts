/**
 * build.ts — Parallel assembler that fetches all sources and runs compute fns.
 * Exports buildAllSections(): Promise<DataPayload>
 */

import type { DataPayload, Section, Summary } from "@/lib/types";
import policyExpectations from "@/data/sme/policy-expectations.json";
import { buildDataFreshnessSection } from "@/lib/sections/dataFreshness";

// ─── Sources ──────────────────────────────────────────────────────────────────
import {
  fetchPdHistory,
  fetchReferenceRates,
  fetchSomaSummary,
  fetchFacilityUsage,
  type PdRow,
  type ReferenceRateRow,
  type SomaSummaryRow,
} from "@/lib/sources/nyfed";
import { fetchUpcomingAuctions, fetchRecentAuctionResults } from "@/lib/sources/treasury";
import { fetchFredSeriesBatch } from "@/lib/sources/fred";

// ─── Analyzers ────────────────────────────────────────────────────────────────
import { computeSingleSeries, computeFails } from "@/lib/analyzers/pd";
import { computeReferenceRates } from "@/lib/analyzers/referenceRates";
import { computeSoma } from "@/lib/analyzers/soma";
import type { SomaRow } from "@/lib/analyzers/soma";
import { computeFacilityUsage } from "@/lib/analyzers/facilityUsage";
import type { FacilityRow } from "@/lib/analyzers/facilityUsage";
import { computeAuction } from "@/lib/analyzers/auction";
import type { AuctionRow } from "@/lib/analyzers/auction";
import { computeMarketShare } from "@/lib/analyzers/marketShare";
import { computeMacroPricing } from "@/lib/analyzers/macroPricing";
import { computeMacroConditions } from "@/lib/analyzers/macroConditions";
import { computeWagePressure } from "@/lib/analyzers/wagePressure";

// ─── Section order ────────────────────────────────────────────────────────────

const SECTION_ORDER = [
  "dealer-inventory",
  "transactions",
  "repo-financing",
  "fails",
  "market-share",
  "reference-rates",
  "soma",
  "facility-usage",
  "auction-risk",
  "policy-expectations",
  "macro-pricing",
  "macro-conditions",
  "wage-pressure",
  "data-freshness",
] as const;

// ─── Unavailable section factory ──────────────────────────────────────────────

function unavailableSection(key: string, error: unknown): Section {
  return {
    title: key,
    mode: "unavailable",
    freshness_status: "Unavailable",
    data_date: null,
    key_metrics: [],
    tables: [],
    warnings: [String(error)],
  };
}

// ─── Safe wrapper ─────────────────────────────────────────────────────────────

async function safe<T>(key: string, fn: () => Promise<T>): Promise<T | Section> {
  try {
    return await fn();
  } catch (e) {
    return unavailableSection(key, e);
  }
}

// ─── Fetch + compute helpers ──────────────────────────────────────────────────

async function buildDealerInventory(): Promise<Section> {
  const rows = await fetchPdHistory("PDPOSGST-TOT");
  return computeSingleSeries(rows as PdRow[], "dealer-inventory");
}

async function buildTransactions(): Promise<Section> {
  const rows = await fetchPdHistory("PDGSWOEXTTOT");
  return computeSingleSeries(rows as PdRow[], "transactions");
}

async function buildRepoFinancing(): Promise<Section> {
  const rows = await fetchPdHistory("PDSORA-UTSETTOT");
  return computeSingleSeries(rows as PdRow[], "repo-financing");
}

async function buildFails(): Promise<Section> {
  const [deliverRows, receiveRows] = await Promise.all([
    fetchPdHistory("PDFTD-USTET"),
    fetchPdHistory("PDFTR-USTET"),
  ]);

  // Combine into combined series (same logic as Python build_fails_section)
  const deliverSorted = (deliverRows as PdRow[])
    .filter((r) => r.value !== null && r.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const receiveSorted = (receiveRows as PdRow[])
    .filter((r) => r.value !== null && r.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const receiveLookup = new Map<string, PdRow>();
  for (const r of receiveSorted) receiveLookup.set(r.date, r);

  const combined: { date: string; value: number }[] = [];
  for (const d of deliverSorted) {
    const r = receiveLookup.get(d.date);
    if (r && d.value !== null && r.value !== null) {
      combined.push({ date: d.date, value: (d.value ?? 0) + (r.value ?? 0) });
    }
  }

  const deliverLatest = deliverSorted[deliverSorted.length - 1]?.value ?? null;
  const receiveLatest = receiveSorted[receiveSorted.length - 1]?.value ?? null;

  return computeFails(combined, deliverLatest, receiveLatest);
}

async function buildReferenceRates(): Promise<Section> {
  const rows = await fetchReferenceRates();
  return computeReferenceRates(rows as ReferenceRateRow[]);
}

async function buildSoma(): Promise<Section> {
  const rows = await fetchSomaSummary();
  return computeSoma(rows as SomaRow[]);
}

async function buildMarketShare(): Promise<Section> {
  // Market share uses external fetch to NY Fed marketshare API
  // This is not exposed in the existing nyfed.ts; return unavailable for now
  // if the endpoint doesn't exist. The computeMarketShare handles empty gracefully.
  try {
    const QTRLY_URL = "https://markets.newyorkfed.org/api/marketshare/qtrly/latest.json";
    const YTD_URL = "https://markets.newyorkfed.org/api/marketshare/ytd/latest.json";

    function containerRecords(payload: unknown, frequency: string): Record<string, unknown>[] {
      if (!payload || typeof payload !== "object") return [];
      const p = payload as Record<string, unknown>;
      const container = ((p.pd as Record<string, unknown>)?.marketshare as Record<string, unknown>)?.[frequency];
      if (!container || typeof container !== "object") return [];
      const c = container as Record<string, unknown>;
      const rows: Record<string, unknown>[] = [];
      for (const [channelName, channelVal] of Object.entries(c)) {
        if (Array.isArray(channelVal)) {
          for (const row of channelVal) {
            if (row && typeof row === "object") {
              rows.push({ ...(row as Record<string, unknown>), __tradeChannel: channelName });
            }
          }
        }
      }
      return rows;
    }

    function toFloat(v: unknown): number | null {
      if (v === null || v === undefined || v === "" || v === "*" || v === "null") return null;
      const s = String(v).trim().replace(",", "").replace(/%$/, "");
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    }

    function parseDateStr(v: unknown): string | null {
      if (!v || v === "*" || v === "null") return null;
      const text = String(v).trim();
      for (const fmt of [/^\d{4}-\d{2}-\d{2}$/, /^\d{4}\/\d{2}\/\d{2}$/, /^\d{2}\/\d{2}\/\d{4}$/]) {
        if (fmt.test(text)) return text.slice(0, 10);
      }
      return text.slice(0, 10) || null;
    }

    const [qtrlyRaw, ytdRaw] = await Promise.all([
      fetch(QTRLY_URL).then((r) => r.json()).catch(() => ({})),
      fetch(YTD_URL).then((r) => r.json()).catch(() => ({})),
    ]);

    function normalizeRows(raw: unknown, frequency: string): import("@/lib/analyzers/marketShare").MarketShareRow[] {
      const rows = containerRecords(raw, frequency);
      const container = typeof raw === "object" && raw ? ((raw as Record<string, unknown>).pd as Record<string, unknown>)?.marketshare as Record<string, unknown>: null;
      const releaseDate = container ? parseDateStr(container[frequency] ? (container[frequency] as Record<string, unknown>).releaseDate : null) : null;
      return rows.map((row) => ({
        frequency: frequency === "qtrly" ? "quarterly" : "ytd",
        period_or_release_date: releaseDate,
        security_type: String(row.securityType ?? row.security_type ?? row.product ?? row.sector ?? "Unavailable"),
        security: String(row.security ?? row.instrument ?? row.instrumentType ?? row.securityType ?? row.product ?? "Unavailable"),
        sector: String(row.securityType ?? row.security_type ?? row.product ?? row.sector ?? "Unavailable"),
        trade_channel: String(row.__tradeChannel ?? row.tradeChannel ?? row.trade_channel ?? row.channel ?? "Unavailable"),
        first_quintile_market_share: toFloat(row.percentFirstQuintMktShare ?? row.first_quintile_market_share ?? row.firstQuintileMarketShare),
        second_quintile_market_share: toFloat(row.percentSecondQuintMktShare),
        third_quintile_market_share: toFloat(row.percentThirdQuintMktShare),
        fourth_quintile_market_share: toFloat(row.percentFourthQuintMktShare),
        fifth_quintile_market_share: toFloat(row.percentFifthQuintMktShare),
        daily_avg_volume_millions: toFloat(row.dailyAvgVolInMillions ?? row.daily_avg_volume_millions ?? row.dailyAvgVolMillions ?? row.dailyAvgVol),
      }));
    }

    const allRecords = [
      ...normalizeRows(qtrlyRaw, "qtrly"),
      ...normalizeRows(ytdRaw, "ytd"),
    ];
    return computeMarketShare(allRecords);
  } catch (e) {
    return computeMarketShare([]);
  }
}

async function buildMacroPricing(): Promise<Section> {
  const series = await fetchFredSeriesBatch(["DGS2", "DGS10", "DGS30", "T10Y2Y", "DFII10", "T10YIE"]);
  return computeMacroPricing(series);
}

async function buildMacroConditions(): Promise<Section> {
  const series = await fetchFredSeriesBatch(["GDPNOW", "NFCI", "ANFCI", "CFNAI", "UNRATE", "PAYEMS", "CPIAUCSL", "PCEPI"]);
  return computeMacroConditions(series);
}

async function buildWagePressure(): Promise<Section> {
  const series = await fetchFredSeriesBatch([
    "FRBATLWGT3MMAUMHWGO",
    "FRBATLWGT3MMAUMHWGJMJST",
    "FRBATLWGT3MMAUMHWGJMJSW",
  ]);
  return computeWagePressure(series);
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export async function buildAllSections(): Promise<DataPayload> {
  // Run independent sections in parallel
  const [
    dealerInventory,
    transactions,
    repoFinancing,
    fails,
    referenceRates,
    soma,
    marketShare,
    macroPricing,
    macroConditions,
    wagePressure,
  ] = await Promise.all([
    safe("dealer-inventory", buildDealerInventory),
    safe("transactions", buildTransactions),
    safe("repo-financing", buildRepoFinancing),
    safe("fails", buildFails),
    safe("reference-rates", buildReferenceRates),
    safe("soma", buildSoma),
    safe("market-share", buildMarketShare),
    safe("macro-pricing", buildMacroPricing),
    safe("macro-conditions", buildMacroConditions),
    safe("wage-pressure", buildWagePressure),
  ]);

  // Dependent sections (need reference-rates for facility-usage, and dealer/txn/fails for auction)
  const [facilityUsage, auctionRisk] = await Promise.all([
    safe("facility-usage", async () => {
      const payload = await fetchFacilityUsage();
      // Normalize facility usage (port of normalize_facility_usage)
      const rows = normalizeFacilityPayload(payload);
      return computeFacilityUsage(rows, referenceRates as Section);
    }),
    safe("auction-risk", async () => {
      const [upcoming, recent] = await Promise.all([
        fetchUpcomingAuctions(),
        fetchRecentAuctionResults(),
      ]);
      return computeAuction(
        upcoming as AuctionRow[],
        recent as AuctionRow[],
        dealerInventory as Section,
        transactions as Section,
        fails as Section
      );
    }),
  ]);

  const sections: Record<string, Section> = {
    "dealer-inventory": dealerInventory as Section,
    "transactions": transactions as Section,
    "repo-financing": repoFinancing as Section,
    "fails": fails as Section,
    "reference-rates": referenceRates as Section,
    "soma": soma as Section,
    "market-share": marketShare as Section,
    "facility-usage": facilityUsage as Section,
    "auction-risk": auctionRisk as Section,
    "policy-expectations": policyExpectations as unknown as Section,
    "macro-pricing": macroPricing as Section,
    "macro-conditions": macroConditions as Section,
    "wage-pressure": wagePressure as Section,
  };

  sections["data-freshness"] = buildDataFreshnessSection(sections);

  const liveSections = SECTION_ORDER.filter(
    (k) => sections[k]?.mode === "live"
  );
  const unavailableSections = SECTION_ORDER.filter(
    (k) => sections[k]?.mode !== "live"
  );

  let dataMode: string;
  if (unavailableSections.length === 0) {
    dataMode = "live";
  } else if (liveSections.length > 0) {
    dataMode = "partial-live";
  } else {
    dataMode = "mock";
  }

  const summary: Summary = {
    data_mode: dataMode,
    live_sections: liveSections,
    unavailable_sections: unavailableSections,
    section_order: [...SECTION_ORDER],
  };

  return {
    summary,
    sections,
    as_of: new Date().toISOString(),
  };
}

// ─── Facility usage normalization (inlined from Python facility_usage.py) ─────

function normalizeFacilityPayload(payload: unknown): FacilityRow[] {
  if (!payload || typeof payload !== "object") return [];

  function toFloat(v: unknown): number | null {
    if (v === null || v === undefined || v === "" || v === "*" || v === "null" || v === "NA" || v === "N/A") return null;
    const n = parseFloat(String(v).replace(",", ""));
    return isNaN(n) ? null : n;
  }

  function toDateStr(v: unknown): string | null {
    if (!v || v === "null") return null;
    const text = String(v).trim();
    for (const fmt of [
      [/^\d{4}-\d{2}-\d{2}/, 10],
      [/^\d{2}\/\d{2}\/\d{4}/, 10],
      [/^\d{4}\/\d{2}\/\d{2}/, 10],
      [/^\d{4}-\d{2}-\d{2}T/, 10],
    ] as Array<[RegExp, number]>) {
      if (fmt[0].test(text)) return text.slice(0, fmt[1]);
    }
    return text.length >= 10 ? text.slice(0, 10) : text;
  }

  function isSmallValueExercise(text: string): boolean {
    const l = text.toLowerCase();
    return l.includes("small value") || l.includes("small-value") || l.includes("exercise");
  }

  function classifyFacility(opType: string, desc: string): string {
    const op = opType.toLowerCase();
    const d = desc.toLowerCase();
    if (op.includes("reverse") || op.includes("rrp") || d.includes("reverse repo")) return "ON RRP";
    if (op.includes("repo") || d.includes("standing repo") || d.includes("srp") || d.includes("srf")) return "Repo / SRP";
    return "Unavailable";
  }

  // Find operation records by scanning the payload recursively
  function findLists(node: unknown): Array<Array<Record<string, unknown>>> {
    const lists: Array<Array<Record<string, unknown>>> = [];
    function visit(n: unknown) {
      if (Array.isArray(n)) {
        if (n.length > 0 && n.every((item) => typeof item === "object" && item !== null)) {
          lists.push(n as Array<Record<string, unknown>>);
        }
        n.forEach(visit);
      } else if (typeof n === "object" && n !== null) {
        Object.values(n).forEach(visit);
      }
    }
    visit(node);
    return lists;
  }

  function looksLikeOperation(rec: Record<string, unknown>): boolean {
    return Object.keys(rec).some((k) => {
      const lk = k.toLowerCase();
      return lk.includes("operation") || lk.includes("accepted") || lk.includes("submitted") || lk.includes("counterparty");
    });
  }

  const lists = findLists(payload);
  let best: Array<Record<string, unknown>> = [];
  let bestScore = -1;
  for (const l of lists) {
    const score = l.filter(looksLikeOperation).length;
    if (score > bestScore) {
      bestScore = score;
      best = l;
    }
  }

  function getFirst(rec: Record<string, unknown>, ...keys: string[]): unknown {
    const lower = Object.fromEntries(Object.entries(rec).map(([k, v]) => [k.toLowerCase(), v]));
    for (const key of keys) {
      if (key.toLowerCase() in lower) return lower[key.toLowerCase()];
    }
    return null;
  }

  return best.map((record): FacilityRow => {
    const opType = String(getFirst(record, "operationType", "operation_type", "operation", "tradeType", "operationName") ?? "");
    const desc = String(getFirst(record, "description", "operationDescription", "opDesc", "statement") ?? "");
    const mergedText = `${opType} ${desc}`.trim();
    const facility = classifyFacility(opType, desc);
    const acceptedAmount = toFloat(getFirst(record, "acceptedAmt", "acceptedAmount", "totalAccepted", "accepted", "totalAmtAccepted"));
    const submittedAmount = toFloat(getFirst(record, "submittedAmt", "submittedAmount", "totalSubmitted", "submitted", "totalAmtSubmitted"));
    const rate = toFloat(getFirst(record, "awardRate", "operationRate", "rate", "stopOutRate", "percentAwardRate", "percentStopOutRate", "percentHighRate", "minimumBidRate"));
    const counterpartyCount = toFloat(getFirst(record, "counterpartyCount", "numberOfCounterparties", "participantCount", "participatingCpty", "acceptedCpty"));
    const details = getFirst(record, "details");
    let securityType: string | null = null;
    if (Array.isArray(details)) {
      const nonZero = (details as Array<Record<string, unknown>>)
        .filter((item) => toFloat(item.amtAccepted) !== null && toFloat(item.amtAccepted) !== 0)
        .map((item) => item.securityType)
        .filter(Boolean);
      securityType = nonZero.length ? nonZero.join(", ") : null;
    }
    const dateRaw = getFirst(record, "operationDate", "date", "tradeDate", "operation_date", "submissionDate");

    return {
      date: toDateStr(dateRaw),
      facility,
      operation_type: facility === "ON RRP" ? "reverse_repo" : "repo",
      accepted_amount: acceptedAmount,
      submitted_amount: submittedAmount,
      rate,
      counterparty_count: counterpartyCount,
      security_type: securityType ?? String(getFirst(record, "securityType", "collateralType", "security_type") ?? ""),
      maturity_date: toDateStr(getFirst(record, "maturityDate", "maturity_date")),
      description: desc || opType || "Unavailable",
      is_small_value_exercise: isSmallValueExercise(mergedText),
    };
  });
}
