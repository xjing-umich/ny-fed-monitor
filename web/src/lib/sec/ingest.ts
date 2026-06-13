import { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "../supabase/server";
import { COMPANY_UNIVERSE, KNOWN_FOREIGN_ISSUERS, normalizeTicker } from "./company-universe";
import { fetchCompanyFacts } from "./company-facts";
import { fetchCompanySubmissions, normalizeRecentFilings } from "./company-submissions";
import { FundamentalPeriod, normalizeCompanyFacts } from "./normalize-facts";
import { resolveTickerCik } from "./ticker-cik";
import { sleep } from "./sec-client";

type SavedSummary = {
  company: boolean;
  filings: number;
  annual_periods: number;
  quarterly_periods: number;
  latest: boolean;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export type IngestCompanyResult = {
  ticker: string;
  cik: string | null;
  status: "success" | "failed" | "unresolved";
  foreign_issuer?: boolean;
  saved: SavedSummary;
  quality_status: string;
  error?: string;
};

function latestByForm(periods: FundamentalPeriod[], forms: string[]) {
  return periods.find((period) => forms.includes(period.form)) ?? null;
}

function latestPeriod(periods: FundamentalPeriod[]) {
  return [...periods].sort((a, b) => b.period_end.localeCompare(a.period_end))[0] ?? null;
}

async function startRun(supabase: SupabaseClient, runType: string, ticker?: string) {
  const { data, error } = await supabase
    .from("sec_ingest_runs")
    .insert({ run_type: runType, ticker, status: "running" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function finishRun(supabase: SupabaseClient, id: string, status: string, summary: unknown, errorMessage?: string) {
  const { error } = await supabase
    .from("sec_ingest_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      error_message: errorMessage ?? null,
      summary
    })
    .eq("id", id);
  if (error) throw error;
}

async function upsertPeriods(supabase: SupabaseClient, periods: FundamentalPeriod[]) {
  // A reporting period is identified by its end date + fiscal period (Q1..Q4/FY).
  // We do NOT key on fiscal_year/form: the XBRL fy/fp that used to feed those was
  // unreliable (comparatives in later filings carry the new filing's fy/fp), and
  // a derived Q4 shares its period_end with the FY row, so fiscal_period must be
  // part of the key to keep them distinct.
  const uniquePeriods = Array.from(
    new Map(periods.map((period) => [`${period.ticker}|${period.period_end}|${period.fiscal_period}`, period])).values()
  );
  if (!uniquePeriods.length) return;
  const { error } = await supabase.from("company_fundamentals_periods").upsert(uniquePeriods, {
    onConflict: "ticker,period_end,fiscal_period"
  });
  if (error) throw error;
}

async function upsertLatest(
  supabase: SupabaseClient,
  ticker: string,
  cik: string,
  companyName: string | null,
  annual: FundamentalPeriod[],
  quarterly: FundamentalPeriod[],
  fallbackQualityStatus?: string
) {
  const latest10k = latestByForm(annual, ["10-K", "20-F"]);
  const latest10q = latestByForm(quarterly, ["10-Q", "6-K"]);
  const latest = latestPeriod([...annual, ...quarterly]);
  if (!latest) {
    if (!fallbackQualityStatus) return false;
    const { error } = await supabase.from("company_fundamentals_latest").upsert(
      {
        ticker,
        cik,
        company_name: companyName,
        quality_status: fallbackQualityStatus,
        updated_at: new Date().toISOString()
      },
      { onConflict: "ticker" }
    );
    if (error) throw error;
    return true;
  }

  const { error } = await supabase.from("company_fundamentals_latest").upsert(
    {
      ticker,
      cik,
      company_name: companyName,
      latest_10k_period_end: latest10k?.period_end ?? null,
      latest_10q_period_end: latest10q?.period_end ?? null,
      latest_filing_date: latest.filing_date,
      latest_revenue: latest.revenue,
      latest_net_income: latest.net_income,
      latest_fcf: latest.free_cash_flow,
      latest_cash: latest.cash_and_equivalents,
      latest_debt: latest.total_debt,
      latest_equity: latest.shareholders_equity,
      latest_revenue_yoy: latest.revenue_yoy,
      latest_net_margin: latest.net_margin,
      latest_roe: latest.roe,
      latest_fcf_margin: latest.fcf_margin,
      quality_status: latest.data_quality,
      updated_at: new Date().toISOString()
    },
    { onConflict: "ticker" }
  );
  if (error) throw error;
  return true;
}

export async function ingestCompany(tickerInput: string, supabase = createServiceSupabaseClient()): Promise<IngestCompanyResult> {
  const ticker = tickerInput.trim().toUpperCase();
  const runId = await startRun(supabase, "company", ticker);
  const emptySaved = { company: false, filings: 0, annual_periods: 0, quarterly_periods: 0, latest: false };

  try {
    const match = await resolveTickerCik(ticker);
    if (!match) {
      const result: IngestCompanyResult = {
        ticker,
        cik: null,
        status: "unresolved",
        saved: emptySaved,
        quality_status: "unresolved",
        error: "Ticker could not be resolved to SEC CIK"
      };
      await finishRun(supabase, runId, "failed", result, result.error);
      return result;
    }

    const [submission, facts] = await Promise.all([fetchCompanySubmissions(match.cik), fetchCompanyFacts(match.cik)]);
    const filings = Array.from(
      new Map(normalizeRecentFilings(ticker, submission).map((filing) => [filing.accession_number, filing])).values()
    );
    const forms = new Set(filings.map((filing) => filing.form));
    const isForeignIssuer = KNOWN_FOREIGN_ISSUERS.has(ticker) || (!forms.has("10-K") && forms.has("20-F"));

    const { error: companyError } = await supabase.from("sec_companies").upsert(
      {
        ticker,
        normalized_ticker: normalizeTicker(ticker),
        cik: match.cik,
        company_name: submission.name ?? match.companyName,
        exchange: submission.exchanges?.[0] ?? null,
        sic: submission.sic ?? null,
        sic_description: submission.sicDescription ?? null,
        fiscal_year_end: submission.fiscalYearEnd ?? null,
        is_foreign_issuer: isForeignIssuer,
        updated_at: new Date().toISOString()
      },
      { onConflict: "normalized_ticker" }
    );
    if (companyError) throw companyError;

    const { error: filingsError } = await supabase.from("sec_filings").upsert(filings, { onConflict: "accession_number" });
    if (filingsError) throw filingsError;

    const normalized = normalizeCompanyFacts(ticker, match.cik, facts, filings, submission.fiscalYearEnd);
    await upsertPeriods(supabase, normalized.annual);
    await upsertPeriods(supabase, normalized.quarterly);
    const latestSaved = await upsertLatest(
      supabase,
      ticker,
      match.cik,
      submission.name ?? match.companyName,
      normalized.annual,
      normalized.quarterly,
      isForeignIssuer ? "foreign" : undefined
    );

    const qualityStatus = isForeignIssuer ? "foreign" : latestPeriod([...normalized.annual, ...normalized.quarterly])?.data_quality ?? "low";
    const result: IngestCompanyResult = {
      ticker,
      cik: match.cik,
      status: "success",
      foreign_issuer: isForeignIssuer,
      saved: {
        company: true,
        filings: filings.length,
        annual_periods: normalized.annual.length,
        quarterly_periods: normalized.quarterly.length,
        latest: latestSaved
      },
      quality_status: qualityStatus
    };
    await finishRun(supabase, runId, "success", result);
    return result;
  } catch (error) {
    const message = errorMessage(error);
    const result: IngestCompanyResult = {
      ticker,
      cik: null,
      status: "failed",
      saved: emptySaved,
      quality_status: "low",
      error: message
    };
    await finishRun(supabase, runId, "failed", result, message);
    return result;
  }
}

export async function ingestAllCompanies(limit: number = COMPANY_UNIVERSE.length) {
  const supabase = createServiceSupabaseClient();
  const runId = await startRun(supabase, "all");
  const tickers = COMPANY_UNIVERSE.slice(0, limit);
  const results: IngestCompanyResult[] = [];

  for (const ticker of tickers) {
    results.push(await ingestCompany(ticker, supabase));
    await sleep(300);
  }

  const summary = {
    status: "completed",
    total: tickers.length,
    success: results.filter((result) => result.status === "success").length,
    failed: results.filter((result) => result.status === "failed").length,
    foreign_issuer: results.filter((result) => result.foreign_issuer).length,
    skipped: 0,
    unresolved_tickers: results.filter((result) => result.status === "unresolved").map((result) => result.ticker),
    results
  };

  await finishRun(supabase, runId, "completed", summary);
  return summary;
}
