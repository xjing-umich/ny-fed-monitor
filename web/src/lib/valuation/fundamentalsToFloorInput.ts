import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";
import type { MarksAdjustment, ValuationFloorInput, ValuationFloorYear } from "./types";
import { buildTtm } from "./ttmBasis";

export const MARKS_TAX_RATE = 0.21;
export const MARKS_MATERIALITY_MIN = 0.25;
export const MARKS_MIN_ALIGNED_YEARS = 3;

/**
 * 件③三闸(spec §2.2,fail-closed):①整窗覆盖(每个有净利的 FY 都有 gains,防序列内口径混杂)
 * ②对齐年数≥3 ③材料性 |mean(gains)|/mean(|NI|) ≥ 0.25(校准:BRK 53%/MKL 53%/RLI 37%/WTM 34%/
 * RGA 33% vs FAF 20.6%,~8pp 实测间隔)。税率用法定 21% 常量——分年 effective rate 被 marks 本身
 * 污染;21% 有 BRK 股东信 operating earnings 逐年对账背书(FY2022 −22.8→+30.8B)。调整对称:
 * gains 均值为负(RGA)同式抬升,口径一致性优先。
 */
export function deriveMarksAdjustment(fyRows: FundamentalPeriod[]): MarksAdjustment | undefined {
  const niYears = fyRows.filter((r) => r.net_income != null);
  if (niYears.length < MARKS_MIN_ALIGNED_YEARS) return undefined;
  if (!niYears.every((r) => r.investment_fv_gain_loss != null)) return undefined;
  const meanGain = niYears.reduce((s, r) => s + (r.investment_fv_gain_loss as number), 0) / niYears.length;
  const meanAbsNi = niYears.reduce((s, r) => s + Math.abs(r.net_income as number), 0) / niYears.length;
  if (!(meanAbsNi > 0)) return undefined;
  const materiality = Math.abs(meanGain) / meanAbsNi;
  if (materiality < MARKS_MATERIALITY_MIN) return undefined;
  return {
    tax_rate: MARKS_TAX_RATE,
    materiality,
    per_year: niYears.map((r) => ({
      fiscal_year: r.fiscal_year as number,
      pretax: r.investment_fv_gain_loss as number,
      net_income_reported: r.net_income as number,
      net_income_adjusted: (r.net_income as number) - (r.investment_fv_gain_loss as number) * (1 - MARKS_TAX_RATE),
    })),
  };
}

/** TTM 与调整后 FY 序列口径不一致(gains 降级回退/缺失)→ 丢 TTM 整体回退纯 FY。 */
export function shouldDropTtmForMarks(ttmSyn: { degraded_fields: string[]; row: FundamentalPeriod }): boolean {
  return ttmSyn.degraded_fields.includes("investment_fv_gain_loss") || ttmSyn.row.investment_fv_gain_loss == null;
}

const u = (v: number | null | undefined): number | undefined => (v == null ? undefined : v);

function toFloorYear(r: FundamentalPeriod, adsRatio: number): ValuationFloorYear {
  return {
    fiscal_year: r.fiscal_year as number,
    revenue: u(r.revenue),
    gross_profit: u(r.gross_profit),
    operating_income: u(r.operating_income),
    operating_margin: u(r.operating_margin),
    net_income: u(r.net_income),
    pretax_income: u(r.pretax_income),
    income_tax_expense: u(r.income_tax_expense),
    effective_tax_rate: u(r.effective_tax_rate),
    shareholders_equity: u(r.shareholders_equity),
    goodwill: u(r.goodwill),
    intangibles: u(r.intangibles),
    cash: u(r.cash_and_equivalents),
    total_debt: u(r.total_debt),
    net_debt: u(r.net_debt),
    // ADR 归一化:SEC shares 是普通股数,÷ADS比例 = ADS 张数,使每股口径对齐每 ADS 价。
    // adsRatio 默认 1(非 ADR / 未传)→ 恒等,零行为变化。
    shares_diluted: r.shares_diluted == null ? undefined : r.shares_diluted / adsRatio,
    d_and_a: u(r.d_and_a),
    // capex is stored NEGATIVE (XBRL cash-outflow); the engine wants a positive outflow magnitude.
    capex: r.capex == null ? undefined : Math.abs(r.capex),
    rd_expense: u(r.rd_expense),
    sga_expense: u(r.sga_expense),
    stock_based_comp: u(r.stock_based_comp),
    working_capital: u(r.working_capital),
    ppe_net: u(r.ppe_net),
    operating_cash_flow: u(r.operating_cash_flow),
    share_repurchases: u(r.share_repurchases),
    dividends_paid: u(r.dividends_paid),
    current_assets: u(r.current_assets),
    current_liabilities: u(r.current_liabilities),
    total_liabilities: u(r.total_liabilities),
    preferred_equity: u(r.preferred_equity),
  };
}

/** Map stored FundamentalPeriod rows (FY only) to the engine's input contract, most-recent-first. */
export function fundamentalsToFloorInput(
  ticker: string,
  companyName: string | null | undefined,
  rows: FundamentalPeriod[] | undefined,
  adsRatio: number = 1,
  sic?: number | null,
  quarterRows?: FundamentalPeriod[],
): ValuationFloorInput {
  const fyRows = (rows ?? [])
    .filter((r) => r.fiscal_period === "FY" && r.fiscal_year != null)
    .sort((a, b) => (b.period_end ?? "").localeCompare(a.period_end ?? ""));
  const marks = deriveMarksAdjustment(fyRows);
  // 逐行用自身字段计算,不经 fiscal_year 做 Map 键——两条 FY 行共享同一 fiscal_year 标签时
  // (period_end 才是真主键,财年标签 off-by-one 真实存在),按标签查表会把较旧行的调整值错套到两行上。
  const applyMarks = (r: FundamentalPeriod): FundamentalPeriod =>
    r.net_income != null && r.investment_fv_gain_loss != null
      ? { ...r, net_income: r.net_income - r.investment_fv_gain_loss * (1 - MARKS_TAX_RATE) }
      : r;
  const years: ValuationFloorYear[] = fyRows.map((r) => toFloorYear(marks ? applyMarks(r) : r, adsRatio));
  const ttmSyn = quarterRows?.length ? buildTtm(rows ?? [], quarterRows) : null;
  // 件③口径一致性:调整启用而 TTM 的 gains 不可得 → 丢 TTM(回退纯 FY),防止 GAAP-TTM 顶替经营口径 FY0。
  const ttmUsable = ttmSyn && !(marks && shouldDropTtmForMarks(ttmSyn));
  const ttm = ttmUsable
    ? {
        year: toFloorYear(
          marks
            ? { ...ttmSyn.row, net_income: (ttmSyn.row.net_income as number) - (ttmSyn.row.investment_fv_gain_loss as number) * (1 - MARKS_TAX_RATE) }
            : ttmSyn.row,
          adsRatio,
        ),
        period_end: ttmSyn.period_end,
        quarters_used: ttmSyn.quarters_used,
        shares_from_fy: ttmSyn.shares_from_fy,
      }
    : undefined;
  return { ticker, company_name: companyName ?? undefined, years, sic: sic ?? undefined, ...(ttm ? { ttm } : {}), ...(marks ? { marks_adjustment: marks } : {}) };
}
