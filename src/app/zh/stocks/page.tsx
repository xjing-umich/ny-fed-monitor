import Link from "next/link";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { COMPANY_UNIVERSE } from "@/lib/sec/company-universe";

export const dynamic = "force-dynamic";

function formatNumber(value: number | null) {
  if (value === null || value === undefined) return "SEC 数据待同步";
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined) return "SEC 数据待同步";
  return `${(value * 100).toFixed(1)}%`;
}

export default async function StocksPage() {
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase.from("company_fundamentals_latest").select("*");
  const latestByTicker = new Map((data ?? []).map((row) => [row.ticker, row]));

  return (
    <main className="page">
      <div className="topbar">
        <div>
          <p className="eyebrow">Compounder / Treasury Market Monitor</p>
          <h1>股票监控</h1>
        </div>
        <p className="muted">SEC 数据来自 Supabase 已同步数据，不在前端实时请求 SEC。</p>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th className="left">Ticker</th>
              <th>最新收入</th>
              <th>收入 YoY</th>
              <th>净利润率</th>
              <th>FCF margin</th>
              <th>ROE</th>
              <th>数据状态</th>
            </tr>
          </thead>
          <tbody>
            {COMPANY_UNIVERSE.map((ticker) => {
              const row = latestByTicker.get(ticker);
              return (
                <tr key={ticker}>
                  <td className="left">
                    <Link href={`/zh/stocks/${ticker}`}>{ticker}</Link>
                  </td>
                  <td>{formatNumber(row?.latest_revenue ?? null)}</td>
                  <td>{formatPercent(row?.latest_revenue_yoy ?? null)}</td>
                  <td>{formatPercent(row?.latest_net_margin ?? null)}</td>
                  <td>{formatPercent(row?.latest_fcf_margin ?? null)}</td>
                  <td>{formatPercent(row?.latest_roe ?? null)}</td>
                  <td>{row?.quality_status ?? "SEC 数据待同步"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
