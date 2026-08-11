import { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "../supabase/server";
import { COMPANY_UNIVERSE, KNOWN_FOREIGN_ISSUERS, normalizeTicker } from "./company-universe";
import { fetchCompanyFacts } from "./company-facts";
import { fetchCompanySubmissions, normalizeRecentFilings } from "./company-submissions";
import { FundamentalPeriod, normalizeCompanyFacts } from "./normalize-facts";
import { needsClassSharesFallback, applyClassSharesFallback } from "./class-shares-fallback";
import { needsHoldcoSotp, ingestHoldcoSotp } from "./holdco-ingest";
import { resolveTickerCik } from "./ticker-cik";
import { sleep } from "./sec-client";
import { isLikelyTicker } from "../externalLinks";

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
    // 分股类申报公司(V/BRK 等)在 companyfacts 拿不到无维度股数 → 从 10-K instance 的
    // ClassOfStockAxis 维度事实回退推导经济股数(spec 2026-07-26)。窄闸:全年份缺股数才触发。
    if (needsClassSharesFallback(normalized.annual)) {
      const patched = await applyClassSharesFallback(normalized.annual, filings);
      if (patched > 0) console.log(`  ${ticker}: class-dimension share fallback patched ${patched} FY rows`);
    }
    // 件⑤:投资主导型控股集团才拉 instance 解析分部与第一栏(窄闸,其余票零新增取数)。
    if (needsHoldcoSotp(normalized.annual)) {
      await ingestHoldcoSotp(supabase, ticker, normalized.annual, filings);
    }
    // Replace (not merge) this company's periods: the normalizer is fully
    // re-derived each run, so any period the new logic no longer produces must
    // not linger as an orphan row (matches the 13F holdings delete+insert).
    const { error: clearError } = await supabase.from("company_fundamentals_periods").delete().eq("ticker", ticker);
    if (clearError) throw clearError;
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

/** SEC ingest 默认覆盖广度：不设上限 = 全部被机构持有(consensus)的名字。传数字可截断为 Top-N。 */
export const DEFAULT_UNIVERSE_LIMIT = Infinity;

const CONSENSUS_PAGE = 1000; // Supabase 单请求行上限,分页拉全。

/**
 * SEC ingest 的 ticker universe —— 数据驱动、自动同步、无外部成分股名单。
 * 默认拉全 consensus_holdings(被追踪 13F 投资者持有的全部名字),按 holder_count 降序;
 * 传 limit 则截断为 Top-N(如 500 = 标普级大盘)。
 *  - 分页(每页 ≤1000)绕过 Supabase 单请求行上限,拉到 limit 或拉完为止。
 *  - isLikelyTicker 过滤未解析的原始 CUSIP/CINS(如 G0403H108)。
 *  - 并入 COMPANY_UNIVERSE 种子置顶:保证精选名字恒在(含双类 GOOG/GOOGL),且供 DB 异常兜底。
 *  - 优雅降级:consensus_holdings 读失败/空 → 回退已拉到的 + 种子,绝不返回空(同既有读取器范式)。
 */
export async function resolveIngestUniverse(
  limit: number = DEFAULT_UNIVERSE_LIMIT,
  supabase: SupabaseClient = createServiceSupabaseClient(),
): Promise<string[]> {
  const seed = COMPANY_UNIVERSE.map((t) => t.toUpperCase());
  const take = (list: string[]) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of list) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= limit) break;
    }
    return out;
  };
  const ranked: string[] = [];
  try {
    for (let from = 0; ; from += CONSENSUS_PAGE) {
      const { data, error } = await supabase
        .from("consensus_holdings")
        .select("ticker,holder_count")
        .order("holder_count", { ascending: false })
        .order("ticker", { ascending: true })
        .range(from, from + CONSENSUS_PAGE - 1);
      if (error) {
        console.error(`resolveIngestUniverse 读 consensus_holdings 失败(已拉 ${ranked.length},回退已拉+种子): ${error.message}`);
        break;
      }
      if (!data?.length) break;
      for (const r of data) {
        const t = String(r.ticker).toUpperCase();
        if (isLikelyTicker(t)) ranked.push(t);
      }
      if (data.length < CONSENSUS_PAGE) break; // 末页
      if (ranked.length >= limit) break; // 有 cap 时早停
    }
  } catch (err) {
    console.error(`resolveIngestUniverse 异常(已拉 ${ranked.length},回退已拉+种子): ${err instanceof Error ? err.message : String(err)}`);
  }
  // 种子置顶(精选恒在),再按持有广度补足。
  return take([...seed, ...ranked]);
}

export async function ingestAllCompanies(limit: number = DEFAULT_UNIVERSE_LIMIT) {
  const supabase = createServiceSupabaseClient();
  const runId = await startRun(supabase, "all");
  const tickers = await resolveIngestUniverse(limit, supabase);
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
