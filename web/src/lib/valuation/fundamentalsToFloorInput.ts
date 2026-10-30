import { buildGrowthEvidence, type GrowthFiling } from "./growthEvidence";
import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";
import type { MarksAdjustment, ValuationFloorInput, ValuationFloorYear } from "./types";
import { buildTtm } from "./ttmBasis";

export const MARKS_TAX_RATE = 0.21;
export const MARKS_MATERIALITY_MIN = 0.25;
export const MARKS_MIN_ALIGNED_YEARS = 3;

/** 只接受真实、有限的损益;净利为零但损益非零也不能放行未调整的 TTM。 */
function hasMaterialMarks(row: FundamentalPeriod | undefined): row is FundamentalPeriod & { net_income: number; investment_fv_gain_loss: number } {
  return row != null && row.net_income != null && Number.isFinite(row.net_income)
    && row.investment_fv_gain_loss != null && Number.isFinite(row.investment_fv_gain_loss)
    && row.investment_fv_gain_loss !== 0
    && Math.abs(row.investment_fv_gain_loss) >= MARKS_MATERIALITY_MIN * Math.abs(row.net_income);
}

/**
 * 件③三闸(spec §2.2,fail-closed):①整窗覆盖(每个有净利的 FY 都有 gains,防序列内口径混杂)
 * ②对齐年数≥3 ③材料性 |mean(gains)|/mean(|NI|) ≥ 0.25(校准:BRK 53%/MKL 53%/RLI 37%/WTM 34%/
 * RGA 33% vs FAF 20.6%,~8pp 实测间隔)。税率用法定 21% 常量——分年 effective rate 被 marks 本身
 * 污染;21% 有 BRK 股东信 operating earnings 逐年对账背书(FY2022 −22.8→+30.8B)。调整对称:
 * gains 均值为负(RGA)同式抬升,口径一致性优先。
 * FY 未达材料性门槛时,完整、未降级的 TTM 也可触发同一调整(2026-10 GOOGL/GOOG);
 * FY 覆盖闸不放宽,且 FY/TTM 必须一起调整,不能把投资收益突增当成经营盈利增长。
 */
export function deriveMarksAdjustment(fyRows: FundamentalPeriod[], ttm?: FundamentalPeriod): MarksAdjustment | undefined {
  const niYears = fyRows.filter((r) => r.net_income != null);
  if (niYears.length < MARKS_MIN_ALIGNED_YEARS) return undefined;
  if (!niYears.every((r) => Number.isFinite(r.net_income) && r.investment_fv_gain_loss != null && Number.isFinite(r.investment_fv_gain_loss))) return undefined;
  const meanGain = niYears.reduce((s, r) => s + (r.investment_fv_gain_loss as number), 0) / niYears.length;
  const meanAbsNi = niYears.reduce((s, r) => s + Math.abs(r.net_income as number), 0) / niYears.length;
  if (!(meanAbsNi > 0)) return undefined;
  let materiality = Math.abs(meanGain) / meanAbsNi;
  let triggerPeriodEnd: string | undefined;
  if (materiality < MARKS_MATERIALITY_MIN) {
    // 零净利不能产生有限的材料性比率;此时调用方丢弃有重大损益的 TTM,回退 FY。
    if (!hasMaterialMarks(ttm) || ttm.net_income === 0) return undefined;
    materiality = Math.abs(ttm.investment_fv_gain_loss) / Math.abs(ttm.net_income);
    triggerPeriodEnd = ttm.period_end;
  }
  return {
    tax_rate: MARKS_TAX_RATE,
    materiality,
    ...(triggerPeriodEnd ? { trigger_period_end: triggerPeriodEnd } : {}),
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
  return ttmSyn.degraded_fields.includes("investment_fv_gain_loss")
    || ttmSyn.row.investment_fv_gain_loss == null || !Number.isFinite(ttmSyn.row.investment_fv_gain_loss);
}

const u = (v: number | null | undefined): number | undefined => (v == null ? undefined : v);

function operatingWorkingCapital(r: FundamentalPeriod | undefined): number | undefined {
  if (!r || r.working_capital == null || !Number.isFinite(r.working_capital) || r.cash_and_equivalents == null || !Number.isFinite(r.cash_and_equivalents)) return undefined;
  const investments = r.short_term_investments ?? 0;
  return Number.isFinite(investments) ? r.working_capital - r.cash_and_equivalents - investments : undefined;
}

function toFloorYear(r: FundamentalPeriod, adsRatio: number): ValuationFloorYear {
  return {
    fiscal_year: r.fiscal_year as number,
    period_end: r.period_end,
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
    equity_securities_fv: u(r.equity_securities_fv),
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
    operating_working_capital: operatingWorkingCapital(r),
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
  filings?: GrowthFiling[],
): ValuationFloorInput {
  const fyRows = (rows ?? [])
    .filter((r) => r.fiscal_period === "FY" && r.fiscal_year != null)
    .sort((a, b) => (b.period_end ?? "").localeCompare(a.period_end ?? ""));
  const ttmSyn = quarterRows?.length ? buildTtm(rows ?? [], quarterRows) : null;
  // buildTtm 对缺数单项回填 FY 值,该值不能冒充真实 TTM 损益触发调整。
  const ttmMarksRow = ttmSyn && !shouldDropTtmForMarks(ttmSyn) ? ttmSyn.row : undefined;
  const marks = deriveMarksAdjustment(fyRows, ttmMarksRow);
  // 逐行用自身字段计算,不经 fiscal_year 做 Map 键——两条 FY 行共享同一 fiscal_year 标签时
  // (period_end 才是真主键,财年标签 off-by-one 真实存在),按标签查表会把较旧行的调整值错套到两行上。
  const applyMarks = (r: FundamentalPeriod): FundamentalPeriod =>
    r.net_income != null && r.investment_fv_gain_loss != null
      ? { ...r, net_income: r.net_income - r.investment_fv_gain_loss * (1 - MARKS_TAX_RATE) }
      : r;
  const years: ValuationFloorYear[] = fyRows.map((r) => toFloorYear(marks ? applyMarks(r) : r, adsRatio));
  // 件③口径一致性:调整启用而 TTM 的 gains 不可得 → 丢 TTM(回退纯 FY),防止 GAAP-TTM 顶替经营口径 FY0。
  // 已知 TTM 损益重大但历史覆盖闸未过/净利为零 → 同样回退 FY,不能无调整放行污染盈利。
  const ttmUsable = ttmSyn && !(marks && !ttmMarksRow) && !(!marks && hasMaterialMarks(ttmMarksRow));
  const ttm = ttmUsable
    ? {
        year: { ...toFloorYear(
          marks ? applyMarks(ttmSyn.row) : ttmSyn.row,
          adsRatio,
        ), operating_working_capital: operatingWorkingCapital(quarterRows?.find(r => r.period_end === ttmSyn.period_end && r.form === "10-Q" && r.is_derived !== true)) },
        period_end: ttmSyn.period_end,
        quarters_used: ttmSyn.quarters_used,
        shares_from_fy: ttmSyn.shares_from_fy,
      }
    : undefined;
  const adjustedFy = marks ? fyRows.map(applyMarks) : fyRows;
  // Do not compare raw quarterly marks with adjusted annual operating earnings.
  const adjustedQs = marks ? (quarterRows ?? []).map(r => r.investment_fv_gain_loss != null && Number.isFinite(r.investment_fv_gain_loss)
    ? applyMarks(r) : { ...r, net_income: null }) : (quarterRows ?? []);
  const growth_evidence = buildGrowthEvidence(adjustedFy, adjustedQs, filings);
  return { growth_evidence, ticker, company_name: companyName ?? undefined, years, sic: sic ?? undefined, ...(ttm ? { ttm } : {}), ...(marks ? { marks_adjustment: marks } : {}) };
}
