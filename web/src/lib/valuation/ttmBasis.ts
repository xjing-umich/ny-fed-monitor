import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";

// spec §4.2:配对窗 ±45 天(覆盖 4-4-5 财历/周末漂移);FY 后新季度 >3 个 = 年报缺报,整体放弃。
export const TTM_PAIR_WINDOW_DAYS = 45;
export const TTM_MAX_NEW_QUARTERS = 3;

/** 流量项:TTM = FY + Σ新季度 − Σ去年同期(spec §4.3)。 */
const FLOW_FIELDS = [
  "revenue", "gross_profit", "operating_income", "net_income", "pretax_income",
  "income_tax_expense", "d_and_a", "capex", "rd_expense", "sga_expense",
  "stock_based_comp", "operating_cash_flow", "share_repurchases", "dividends_paid",
] as const;
type FlowField = (typeof FLOW_FIELDS)[number];

/** 存量项:直取最新真实 10-Q,单项 null 回退 FY 值(spec §4.3)。 */
const STOCK_FIELDS = [
  "shareholders_equity", "goodwill", "intangibles", "cash_and_equivalents",
  "short_term_investments", "total_debt", "net_debt", "working_capital", "ppe_net",
  "current_assets", "current_liabilities", "total_assets", "total_liabilities",
  "minority_interest", "preferred_equity",
] as const;

export type TtmSynthesis = {
  /** fiscal_period="TTM" 合成行,FundamentalPeriod 同构 → 复用既有 row→ValuationFloorYear mapper。 */
  row: FundamentalPeriod;
  period_end: string;
  quarters_used: string[];
  /** 单项回退 FY 原值的流量字段(revenue/net_income 落入即整体 null,不会出现在成功结果里)。 */
  degraded_fields: string[];
};

const isRealQ = (r: FundamentalPeriod): boolean =>
  r.form === "10-Q" && r.is_derived !== true && r.period_end != null;

/** 去年同期配对:全按 period_end 日期窗,禁用 fiscal_year/fiscal_period 标签(spec §3 off-by-one 雷区)。 */
function findYearAgoMatch(q: FundamentalPeriod, pool: FundamentalPeriod[], fyEnd: string): FundamentalPeriod | null {
  const target = Date.parse(q.period_end) - 365 * 86_400_000;
  let best: FundamentalPeriod | null = null;
  let bestDist = Infinity;
  for (const c of pool) {
    if (c.period_end > fyEnd) continue; // 配对季度必须落在 FY 锚窗口内,否则差额跑出锚外
    const dist = Math.abs(Date.parse(c.period_end) - target) / 86_400_000;
    if (dist <= TTM_PAIR_WINDOW_DAYS && dist < bestDist) { best = c; bestDist = dist; }
  }
  return best;
}

const fin = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/**
 * TTM 合成(spec §4):增量法 TTM = 最新FY + Σ(FY后真实10-Q) − Σ(去年同期真实10-Q)。
 * 返回 null = 不可用,调用方回退 FY(现状路径,零漂移)。五道卫生闸见 spec §4.4。
 */
export function buildTtm(
  fyRows: FundamentalPeriod[],
  quarterRows: FundamentalPeriod[],
): TtmSynthesis | null {
  const fy0 = (fyRows ?? [])
    .filter((r) => r.fiscal_period === "FY" && r.period_end != null)
    .sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
  if (!fy0) return null;

  const realQs = (quarterRows ?? []).filter(isRealQ);
  const newQs = realQs
    .filter((q) => q.period_end > fy0.period_end)
    .sort((a, b) => a.period_end.localeCompare(b.period_end));
  if (newQs.length === 0) return null;                      // 闸1:没有比年报新的 10-Q
  if (newQs.length > TTM_MAX_NEW_QUARTERS) return null;     // 闸1':年报缺报
  // 同一新季度期末重复行(修订重报)取 filing_date 最新的一条:显式按 filing_date 升序排序
  // 后再塞入 Map(后写入者覆盖同 key 先写入者),而非依赖入参顺序。filing_date=null 视为最旧。
  const byFilingAsc = [...newQs].sort(
    (a, b) => Date.parse(a.filing_date ?? "1900-01-01") - Date.parse(b.filing_date ?? "1900-01-01"),
  );
  const dedupNew = [...new Map(byFilingAsc.map((q) => [q.period_end, q])).values()]
    .sort((a, b) => a.period_end.localeCompare(b.period_end));

  const matches: FundamentalPeriod[] = [];
  for (const q of dedupNew) {
    const m = findYearAgoMatch(q, realQs, fy0.period_end);
    if (!m) return null;                                    // 闸2:缺去年同期配对
    matches.push(m);
  }

  const degraded: string[] = [];
  const flow: Partial<Record<FlowField, number | null>> = {};
  for (const f of FLOW_FIELDS) {
    const parts = [fy0[f], ...dedupNew.map((q) => q[f]), ...matches.map((m) => m[f])];
    if (parts.every(fin)) {
      flow[f] = (fy0[f] as number)
        + dedupNew.reduce((s, q) => s + (q[f] as number), 0)
        - matches.reduce((s, m) => s + (m[f] as number), 0);
    } else {
      flow[f] = fy0[f];                                     // 单项回退 FY 原值
      degraded.push(f);
    }
  }
  if (degraded.includes("revenue") || degraded.includes("net_income")) return null; // 闸4:核心流量必须真 TTM
  const rev = flow.revenue, ni = flow.net_income;
  if (!fin(rev) || rev <= 0 || !fin(ni)) return null;       // 闸3:TTM 营收/净利不成立
  // 闸5:物理不变量(与 fundamentalsIntegrityViolated 同口径)
  if (fin(flow.operating_income) && flow.operating_income > rev) return null;
  if (fin(flow.gross_profit) && flow.gross_profit > rev) return null;

  const lastQ = dedupNew[dedupNew.length - 1];
  const stock = Object.fromEntries(
    STOCK_FIELDS.map((f) => [f, lastQ[f] ?? fy0[f]]),        // 存量:最新10-Q,单项 null 回退 FY
  );
  const taxRate = fin(flow.income_tax_expense) && fin(flow.pretax_income) && (flow.pretax_income as number) > 0
    ? (flow.income_tax_expense as number) / (flow.pretax_income as number)
    : null;

  const row: FundamentalPeriod = {
    ...fy0,
    ...stock,
    ...flow,
    fiscal_year: (fy0.fiscal_year ?? 0) + 1,                // spec §4.3:滚动窗标签 = FY0+1(工作序列已剔 FY0,无冲突)
    fiscal_period: "TTM",
    period_end: lastQ.period_end,
    filing_date: lastQ.filing_date,
    accession_number: lastQ.accession_number,
    form: "10-K+10-Q",
    shares_diluted: lastQ.shares_diluted ?? fy0.shares_diluted, // 最新10-Q报告值;null 回退 FY
    effective_tax_rate: taxRate,
    operating_margin: fin(flow.operating_income) ? (flow.operating_income as number) / rev : null,
    // 未重算的派生列一律清空,防 FY 旧值假冒 TTM
    eps_diluted: null, free_cash_flow: null, ebitda: null,
    revenue_yoy: null, net_income_yoy: null, fcf_yoy: null,
    gross_margin: null, net_margin: null, fcf_margin: null, roe: null,
    debt_to_equity: null,
    shares_outstanding: lastQ.shares_outstanding ?? null,
    // 溯源字段是 FY 行的原始快照,对 TTM 拼接行不成立,清空防误用
    missing_fields: {},
    raw_facts: {},
    // TTM 行是本函数算术拼接的产物,不是任一 SEC 申报的直接摘录;is_derived=true 如实标注
    // (`...fy0` 会带入 FY 的 is_derived=false,语义错误,须显式覆盖)。
    is_derived: true,
  };
  return { row, period_end: lastQ.period_end, quarters_used: dedupNew.map((q) => q.period_end), degraded_fields: degraded };
}
