import { getDb } from "@/lib/managers/db";

export type SecLatestSummary = {
  ticker: string;
  cik: string;
  company_name: string | null;
  latest_10k_period_end: string | null;
  latest_10q_period_end: string | null;
  latest_filing_date: string | null;
  latest_revenue: number | null;
  latest_net_income: number | null;
  latest_fcf: number | null;
  latest_cash: number | null;
  latest_debt: number | null;
  latest_equity: number | null;
  latest_revenue_yoy: number | null;
  latest_net_margin: number | null;
  latest_roe: number | null;
  latest_fcf_margin: number | null;
  quality_status: string | null;
};

export async function getSecLatestMap(): Promise<Map<string, SecLatestSummary>> {
  try {
    const { data, error } = await getDb()
      .from("company_fundamentals_latest")
      .select("*");
    if (error || !data) return new Map();
    return new Map((data as SecLatestSummary[]).map((row) => [row.ticker, row]));
  } catch {
    return new Map();
  }
}

export async function getSecCompanyData(ticker: string) {
  let db;
  try {
    db = getDb();
  } catch {
    return {
      company: null,
      filings: [],
      annual: [],
      quarterly: [],
      latest: null,
    };
  }
  const upper = ticker.toUpperCase();
  const [{ data: company }, { data: filings }, { data: periods }, { data: latest }] =
    await Promise.all([
      db.from("sec_companies").select("*").eq("ticker", upper).maybeSingle(),
      db.from("sec_filings").select("*").eq("ticker", upper).order("filing_date", { ascending: false }).limit(24),
      db.from("company_fundamentals_periods").select("*").eq("ticker", upper).order("period_end", { ascending: false }).limit(32),
      db.from("company_fundamentals_latest").select("*").eq("ticker", upper).maybeSingle(),
    ]);

  const rows = periods ?? [];
  return {
    company,
    filings: filings ?? [],
    annual: rows.filter((row: any) => row.fiscal_period === "FY"),
    // TTM 增量法最坏 3 新 + 3 配对 + 跨年缓冲(spec §4.2)。
    quarterly: rows.filter((row: any) => row.fiscal_period !== "FY").slice(0, 12),
    latest,
  };
}
