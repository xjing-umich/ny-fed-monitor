import Link from "next/link";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { normalizeTicker } from "@/lib/sec/company-universe";

export const dynamic = "force-dynamic";

function n(value: number | null) {
  if (value === null || value === undefined) return "-";
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function pct(value: number | null) {
  if (value === null || value === undefined) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function FinancialTable({ rows }: { rows: any[] }) {
  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th className="left">Period</th>
            <th>Revenue</th>
            <th>Gross profit</th>
            <th>Operating income</th>
            <th>Net income</th>
            <th>OCF</th>
            <th>CapEx</th>
            <th>FCF</th>
            <th>Cash</th>
            <th>Debt</th>
            <th>Equity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.form}-${row.period_end}`}>
              <td className="left">{row.fiscal_period} {row.fiscal_year}</td>
              <td>{n(row.revenue)}</td>
              <td>{n(row.gross_profit)}</td>
              <td>{n(row.operating_income)}</td>
              <td>{n(row.net_income)}</td>
              <td>{n(row.operating_cash_flow)}</td>
              <td>{n(row.capex)}</td>
              <td>{n(row.free_cash_flow)}</td>
              <td>{n(row.cash_and_equivalents)}</td>
              <td>{n(row.total_debt)}</td>
              <td>{n(row.shareholders_equity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();
  const supabase = createServiceSupabaseClient();
  const normalizedTicker = normalizeTicker(ticker);

  const [{ data: company }, { data: filings }, { data: periods }, { data: latest }] = await Promise.all([
    supabase.from("sec_companies").select("*").eq("normalized_ticker", normalizedTicker).maybeSingle(),
    supabase.from("sec_filings").select("*").eq("ticker", ticker).order("filing_date", { ascending: false }).limit(16),
    supabase.from("company_fundamentals_periods").select("*").eq("ticker", ticker).order("period_end", { ascending: false }).limit(32),
    supabase.from("company_fundamentals_latest").select("*").eq("ticker", ticker).maybeSingle()
  ]);

  if (!company) {
    return (
      <main className="page">
        <Link href="/zh/stocks">返回股票列表</Link>
        <h1>{ticker}</h1>
        <p className="notice">SEC 数据尚未同步，请先运行 /api/sec/ingest/company 或 /api/sec/ingest/all。</p>
      </main>
    );
  }

  const annual = (periods ?? []).filter((row) => row.fiscal_period === "FY");
  const quarterly = (periods ?? []).filter((row) => row.fiscal_period !== "FY").slice(0, 8);
  const latestFiling = filings?.[0];
  const missingFields = annual[0]?.missing_fields ?? quarterly[0]?.missing_fields ?? {};
  const latestFilingIsStale = latestFiling?.filing_date
    ? Date.now() - new Date(latestFiling.filing_date).getTime() > 550 * 24 * 60 * 60 * 1000
    : true;

  return (
    <main className="page">
      <div className="topbar">
        <div>
          <p className="eyebrow">
            <Link href="/zh/stocks">股票监控</Link>
          </p>
          <h1>{ticker} SEC Fundamentals</h1>
        </div>
        <p className="muted">{company.company_name}</p>
      </div>

      {company.is_foreign_issuer ? (
        <p className="notice">10-K/10-Q unavailable; use 20-F/6-K if available.</p>
      ) : null}

      <section className="grid">
        <div className="metric"><span>CIK</span><strong>{company.cik}</strong></div>
        <div className="metric"><span>Exchange</span><strong>{company.exchange ?? "-"}</strong></div>
        <div className="metric"><span>Latest filing</span><strong>{latestFiling?.filing_date ?? "-"}</strong></div>
        <div className="metric"><span>Quality</span><strong>{latest?.quality_status ?? "unknown"}</strong></div>
      </section>

      <h2>最新 10-K / 10-Q</h2>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th className="left">Form</th>
              <th>Report date</th>
              <th>Filing date</th>
              <th>Fiscal year</th>
              <th>Fiscal period</th>
              <th>SEC filing</th>
            </tr>
          </thead>
          <tbody>
            {(filings ?? []).map((filing) => (
              <tr key={filing.accession_number}>
                <td className="left">{filing.form}</td>
                <td>{filing.report_date ?? "-"}</td>
                <td>{filing.filing_date ?? "-"}</td>
                <td>{filing.fiscal_year ?? "-"}</td>
                <td>{filing.fiscal_period ?? "-"}</td>
                <td><a href={filing.filing_url}>打开</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>年度财务</h2>
      <FinancialTable rows={annual} />

      <h2>季度财务</h2>
      <FinancialTable rows={quarterly} />

      <h2>质量检查</h2>
      <div className="panel">
        <table>
          <tbody>
            <tr><td className="left">missing fields</td><td>{Object.keys(missingFields).join(", ") || "-"}</td></tr>
            <tr><td className="left">foreign issuer</td><td>{String(company.is_foreign_issuer)}</td></tr>
            <tr><td className="left">latest filing is stale</td><td>{String(latestFilingIsStale)}</td></tr>
            <tr><td className="left">confidence</td><td>{latest?.quality_status ?? "unknown"}</td></tr>
          </tbody>
        </table>
      </div>

      <h2>AI normalized fundamentals JSON</h2>
      <pre className="panel" style={{ padding: 16, overflowX: "auto" }}>
        {JSON.stringify({ company, latest, annual, quarterly, quality: { missingFields, latestFilingIsStale } }, null, 2)}
      </pre>
    </main>
  );
}
