import type { Lang } from "@/lib/nav";
import type { EpvLamp, OeDcfAssessment, ValuationFloor } from "./types";
import { date } from "@/lib/i18n/format";
import { ACQUIRED_RESET_DISCOUNT } from "./reproductionValue";

import type { ValuationDisplayBasis } from "./runValuation";

/** Legacy or malformed metadata must not acquire dates/ratios from newer research. */
export function parseDisplayBasis(value: unknown): ValuationDisplayBasis | undefined {
  if (!value || typeof value !== "object") return undefined;
  const basis = value as ValuationDisplayBasis;
  if (basis.version !== 1 || !(basis.adsRatio === null || (typeof basis.adsRatio === "number" && Number.isFinite(basis.adsRatio) && basis.adsRatio > 0))) return undefined;
  if (basis.ttm !== null && (!basis.ttm || !Number.isInteger(basis.ttm.year) || typeof basis.ttm.periodEnd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(basis.ttm.periodEnd) || !Number.isFinite(Date.parse(basis.ttm.periodEnd)) || new Date(basis.ttm.periodEnd).toISOString().slice(0,10) !== basis.ttm.periodEnd)) return undefined;
  return basis;
}
export type SecurityUnit = "share" | "ADS" | "unknown";
export function perSecurityUnit(unit: SecurityUnit, lang: Lang): string {
  if (unit === "unknown") return lang === "zh" ? "/ 单位未知" : "/ unit unknown";
  return unit === "ADS" ? "/ ADS" : lang === "zh" ? "/ 股" : "/ sh";
}
export function adsRatioDisclosure(unit: SecurityUnit, ratio: number | undefined, lang: Lang): string | null {
  if (unit !== "ADS") return null;
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return lang === "zh" ? "此估值记录的 ADS 换算比例未知。" : "The ADS conversion ratio is unknown for this valuation record.";
  return lang === "zh" ? `1 ADS = ${ratio} 股普通股。以下估值以每 ADS 为单位。` : `1 ADS = ${ratio} ordinary shares. Values below are per ADS.`;
}
/** Identify the synthetic period by its fiscal key, not by its position in an R&D subset. */
export function valuationPeriods(years: number[], lang: Lang, ttm?: { year: number; periodEnd: string } | null): string {
  if (ttm === null) return lang === "zh" ? "期间口径未保留" : "Period basis was not retained";
  return years.map(year => ttm && year === ttm.year ? `${lang === "zh" ? "最近十二个月，截至" : "TTM to "}${date(ttm.periodEnd, lang)}` : `FY ${year}`).join(lang === "zh" ? "、" : ", ");
}
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export function lampDisplay(lamp: EpvLamp, role: "operating" | "owner", lang: Lang): { label: string; reason: string | null; notes: string[] } {
  const zh = lang === "zh";
  const owner = role === "owner";
  const d = lamp.method.display;
  const label = owner ? (zh ? "所有者盈利价值（零增长参考）" : "Owner-earnings value (zero-growth reference)") : (zh ? "盈利能力价值（EPV，正常化税后经营利润）" : "Earnings power value (EPV, normalized NOPAT)");
  const reason = lamp.assessable ? null : lamp.not_assessable_code === "operating_income_unavailable"
    ? zh ? "未单独披露营业利润，无法计算税后经营利润口径的盈利能力价值。" : "Operating income is not reported separately, so the NOPAT earnings-power method is unavailable."
    : lamp.not_assessable_code === "non_positive_earnings"
      ? zh ? "正常化盈利不为正，无法将其资本化为正的盈利能力价值。" : "Normalized earnings are non-positive, so this method cannot produce a positive earnings-power value."
      : zh ? "现有财务资料不足以评估此方法。" : "This method cannot be assessed from the available financial information.";
  const notes: string[] = [];
  if (owner) {
    notes.push(zh ? "从已扣利息的净利润起算，资本化后已是股权价值，不再加现金或减债务，以免重复调整。" : "Starts from net income after interest. Capitalization gives equity value directly; cash and debt are not adjusted again.");
  } else if (lamp.assessable || lamp.not_assessable_code !== "operating_income_unavailable") {
    notes.push(zh ? "多年正常化营业利润率 × 最近期间营收 ×（1 − 正常化税率），得到税后经营利润；先按全部资本口径资本化，再加现金、减总债务，转为股权价值。" : "Normalized operating margin × latest-period revenue × (1 − normalized tax) gives NOPAT. Capitalize this return to all capital, then add cash and subtract total debt to obtain equity value.");
  }
  notes.push(zh ? `折现率 ${pct(lamp.method.discount_rate_low)}–${pct(lamp.method.discount_rate_high)}，作为${owner ? "股权成本" : "加权平均资本成本"}的近似。` : `Discount rate ${pct(lamp.method.discount_rate_low)}–${pct(lamp.method.discount_rate_high)}, used as a proxy for ${owner ? "cost of equity" : "weighted average cost of capital"}.`);
  if (d) {
    if (d.cashflow_adjusted) notes.push(owner
      ? zh ? "所有者盈利 = 正常化净利润 + 平均折旧摊销 − 维持性资本开支。营运资本变动不计入，假设维持经营所需变动约为零，增长投入由增长价值处理。" : "Owner earnings = normalized net income + average depreciation and amortization − maintenance capex. Working-capital changes are excluded: maintenance needs are assumed near zero and growth investment is handled in growth value."
      : zh ? "税后经营利润加回折旧摊销，再全额扣除维持性资本开支；资本开支扣减不另计税盾。" : "Add depreciation and amortization back to NOPAT, then deduct maintenance capex in cash, without a separate tax shield on that deduction.");
    else notes.push(owner
      ? zh ? "维持性资本开支或折旧摊销资料不足，以正常化净利润近似所有者盈利；营运资本变动未计入。" : "Maintenance capex or depreciation data are missing, so normalized net income approximates owner earnings; working-capital changes are excluded."
      : zh ? "维持性资本开支或折旧摊销资料不足，假设两者相等，净加回为零。" : "Maintenance capex or depreciation data are missing; the two are assumed equal, with no net add-back.");
    if (d.maintenance_confidence === "degraded" && d.cashflow_adjusted) notes.push(d.maintenance_method_count === 1
      ? zh ? "维持性资本开支仅有一种可用估计方法，可信度较低。" : "Only one maintenance-capex estimate is available, reducing confidence."
      : zh ? `维持性资本开支估计的可信度较低${d.maintenance_divergence != null ? `，方法间差异约 ${pct(d.maintenance_divergence)}` : ""}。` : `Maintenance-capex confidence is reduced${d.maintenance_divergence != null ? `; estimates differ by about ${pct(d.maintenance_divergence)}` : ""}.`);
    if (d.normalization_capped) notes.push(zh ? `${owner ? "净利润" : "营业利润率"}低于多年均值，正常化基数采用最近期间水平，避免将高峰盈利永久化。` : `${owner ? "Net income is" : "Operating margin is"} below its multi-year mean, so normalization uses the latest-period level rather than capitalizing peak earnings.`);
  } else notes.push(zh ? "旧记录未保留资本开支调整和正常化的细分依据，无法进一步确认所用近似。" : "This record lacks the detailed capex and normalization facts needed to confirm the approximation used.");
  notes.push(zh ? "股权激励保留为费用，不加回。" : "Stock-based compensation remains an expense and is not added back.");
  if (owner) notes.push(zh ? "一次性项目未逐项剔除，多年平均只能部分平滑其影响。" : "One-time items are not removed individually; multi-year averaging smooths them only partly.");
  return { label, reason, notes };
}
export function assetDisplay(floor: ValuationFloor, lang: Lang, unit: SecurityUnit = "share"): { label: string; basis: string; moat: string } {
  const a = floor.asset_floor;
  const zh = lang === "zh";
  const bankTbv = floor.is_financial && a.intangibles_separated && !(a.capitalized_rd && a.capitalized_rd > 0) && !(a.tangible_net_assets != null && a.tangible_net_assets < 0);
  const label = bankTbv && unit === "unknown" ? (zh ? "有形净资产（证券单位未知）" : "Tangible book value (security unit unknown)") : bankTbv ? unit === "ADS" ? (zh ? "每 ADS 有形净资产" : "Tangible book value per ADS") : (zh ? "每股有形净资产（TBVPS）" : "Tangible book value per share (TBVPS)") : zh ? "资产价值" : "Asset value";
  const rd = a.capitalized_rd != null;
  let basis = !a.assessable ? zh ? "现有资料无法支持可用的资产价值。" : "Available information does not support a usable asset value."
    : !a.intangibles_separated
      ? zh ? "商誉与其他无形资产未分开披露，使用股东权益账面值，未视为有形净资产。" : "Goodwill and other intangibles are not separated; the calculation uses shareholders’ book equity, which is not tangible net assets."
      : zh ? "股东权益减商誉及其他无形资产。" : "Shareholders’ equity less goodwill and other intangible assets.";
  if (rd && a.assessable) basis += zh ? " 加计按五年直线摊销资本化的研发投入。" : " Add R&D capitalized over five years with straight-line amortization.";
  if (a.assessable && !a.dual_av_comparable && a.acquired_reset_proxy != null) basis += zh ? ` 加计商誉及其他无形资产的 ${pct(ACQUIRED_RESET_DISCOUNT)} 作为重建成本近似。` : ` Add ${pct(ACQUIRED_RESET_DISCOUNT)} of goodwill and other intangibles as an estimated reconstruction cost.`;
  if (a.assessable) basis += zh ? " 总额除以摊薄后的证券数量。" : " Divide the total by diluted security count.";
  let moat = bankTbv ? zh ? "比较盈利能力价值与有形净资产；该比值只提供方向性线索。" : "Compare earnings power value with tangible book value; the ratio is directional."
    : a.dual_av_comparable ? zh ? `分别比较盈利能力价值与两种资产口径：有形净资产加资本化研发，以及再加商誉和其他无形资产 ${pct(ACQUIRED_RESET_DISCOUNT)} 的重建成本近似。两项均须通过才形成资产测试的护城河信号。` : `Compare earnings power with two asset bases: tangible net assets plus capitalized R&D, and that total plus ${pct(ACQUIRED_RESET_DISCOUNT)} of goodwill and other intangibles as estimated reconstruction cost. Both must pass for an asset-based moat signal.`
      : zh ? "比较盈利能力价值与可用资产价值；双重资产测试不可用，只作方向性参考。" : "Compare earnings power with the available asset value; the dual asset test is unavailable, so this is directional.";
  if (bankTbv && a.dual_av_comparable) moat += zh ? ` 另以有形净资产加商誉及其他无形资产 ${pct(ACQUIRED_RESET_DISCOUNT)} 的口径复核，两项均须通过。` : ` A second test adds ${pct(ACQUIRED_RESET_DISCOUNT)} of goodwill and other intangibles; both tests must pass.`;
  if (floor.moat_reading.moat_via_roic) moat += zh ? " 本次护城河信号来自长期高资本回报率。" : " The moat signal here comes from sustained high returns on invested capital.";
  if (floor.moat_reading.moat_via_growth) moat += zh ? " 本次护城河信号来自已证明的营业利润增长。" : " The moat signal here comes from demonstrated operating-income growth.";
  return { label, basis, moat };
}
export function taxDisplay(floor: ValuationFloor, lang: Lang): string {
  const p = floor.provenance;
  if (p.tax_source === "statutory_fallback") return lang === "zh" ? "缺少有效税率资料，采用 21% 法定税率。" : "Effective-tax data are missing; the statutory 21% rate is used.";
  if (p.tax_source === "effective_average") return lang === "zh" ? `采用 ${p.tax_year_count ?? p.years_used.length} 个期间的平均有效税率，限制在 0%–21%。` : `Average effective tax over ${p.tax_year_count ?? p.years_used.length} periods, bounded to 0%–21%.`;
  return lang === "zh" ? "所示为模型正常化税率；旧记录未保留税率来源细分。" : "The displayed tax rate is normalized; this record lacks its detailed source facts.";
}
export function discountDisplay(oe: OeDcfAssessment, floor: ValuationFloor, lang: Lang): string {
  const d = oe.discount;
  const zh = lang === "zh";
  if (!d) return zh ? "此记录未保留折现率来源明细。" : "Discount-rate source details are unavailable for this record.";
  const notes = [zh ? `实际股权折现率 ${pct(d.r_low)}–${pct(d.r_high)}。` : `Effective equity discount rate: ${pct(d.r_low)}–${pct(d.r_high)}.`];
  if (d.dgs10_value != null && d.dgs10_date) {
    notes.push(zh ? `参照 FRED 10 年期美债收益率 ${pct(d.dgs10_value)}（${date(d.dgs10_date, lang)}），一端加 4.5 个百分点，另一端为 12%。` : `Based on the FRED 10-year Treasury yield of ${pct(d.dgs10_value)} (${date(d.dgs10_date, lang)}): one end adds 4.5 percentage points; the other is 12%.`);
    if (!d.anchored) notes.push(zh ? "该利率观测值已过时；计算仍使用该历史值，未锚定实时利率。" : "That rate observation is stale; the calculation still uses this historical value and is not anchored to a current rate.");
    if (d.inverted) notes.push(zh ? "美债收益率加溢价的一端已高于固定端，区间按较低值至较高值排列。" : "The Treasury-plus-premium end exceeds the fixed end; the discount-rate range is ordered from lower to higher rate.");
  } else notes.push(zh ? "美债收益率不可用，采用 9%–11% 备用区间，未锚定实时利率。" : "The Treasury yield is unavailable; a 9%–11% fallback band is used without a current rate anchor.");
  if ((floor.leverage_premium ?? 0) > 0) notes.push(zh ? `两端均已加计 ${pct(floor.leverage_premium!)} 的杠杆风险溢价。` : `Both ends include a ${pct(floor.leverage_premium!)} leverage premium.`);
  notes.push(zh ? "所有者盈利已经扣息，折现结果为股权价值，不再进行现金或债务调整。" : "Owner earnings are after interest; the discounted result is equity value, with no further cash or debt adjustment.");
  return notes.join(" ");
}
