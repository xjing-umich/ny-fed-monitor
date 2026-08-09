import type { EpvLamp, MarksAdjustment, MoatReading, PerShareUnavailable, ReproductionValue, ValuationFloor, ValuationFloorInput, ValuationFloorYear } from "./types";
import { maintenanceCapex } from "./maintenanceCapex";
import { buildReproductionValue } from "./reproductionValue";
import { computeGrowthValue } from "./growthValue";
import { computeNetNet } from "./netNet";
import { deriveMoatCap, roicStability, durabilityDeclined, ROIC_HURDLE, roicTrend, sustainableGrowth, roicLongTermStrong, OPERATING_CASH_PCT, isFinancialSic, sustainableGrowthRateFinancial, roicHelpers, sustainedProfitStreak, growthFranchise, type GrowthFranchiseResult } from "./moatCap";
import { structuralConfidence } from "./structuralConfidence";
import { leveragePremium } from "./leveragePremium";

// audit #3: 股权成本带从 8/10% 提到 9/11%。原 8% 隐含的股权风险溢价(对 ~4.5% 国债仅 ~3.5%)
// 远低于历史 ~4.5–5.5%,系统性高估；提到 9–11% 让 EPV 与提 premium 后的 OE-DCF 一致、更保守。
export const DISCOUNT_RATE_LOW = 0.09;
export const DISCOUNT_RATE_HIGH = 0.11;
export const MAX_TAX_RATE = 0.21; // statutory cap
export const MIN_YEARS = 3;
export const TARGET_YEARS = 5;
export const LEVERAGE_WARN_RATIO = 1.0;
export const MOAT_FRANCHISE_MULTIPLE = 1.25;
export const MOAT_COMMODITY_FLOOR = 0.75;
// ai_capex 金融豁免的 capex-重要性阈值(mean(|capex|)/mean(revenue) over the floor's years)。
// 校准(2026-07-26,真数据,company_fundamentals_periods,FY 行,SUPABASE 生产库):
//   银行/保险/发卡行(必须豁免) — AXP 5.19% / HBAN 14.74% / KNSL 1.58% / GL 1.20%
//     (ESQ/HOMB/PDLB 无 FY capex 行,无法测量)。上沿 ≈15%。
//   比特币矿企(必须不豁免,SIC 6199 与上组同区间) — CLSK 28.82% / RIOT 52.38% /
//     CORZ 48.64% / IREN 108.86% / WULF 372.84%(HUT 无数据)。下沿 ≈29%。
//   （MSTR 0.79%/COIN 0.05% 也在矿企名单但实测极低 ——
//     二者真实资本支出是"买比特币"这项投资活动，不落在 SEC capex/PP&E 科目里，
//     该量纲天然测不出它们的资本密集度；这不影响判据本身,因为对它们 ai_capex_distortion_warning
//     多半也不会触发,豁免与否无实际分歧。）
// 两组间有 ~14pp 的干净间隔(15%–29%),取整数 20% 居中,两侧各留 ~5pp 余量。
export const AI_CAPEX_FINANCIAL_EXEMPT_MAX_CAPEX_TO_REVENUE = 0.20;

const MAINT_CAPEX_RULE =
  "Maintenance capex estimated by the four-method median (D&A proxy / Greenwald sales method / PP&E useful life), with the AI-hog 50%-of-capex floor; degrades to D&A when inputs are missing.";

const MULTI_CLASS_REASON =
  "This issuer has a multi-share-class structure; a blended per-share count is not available from the current data source, so a per-share floor is not computed here.";

const SINGLE_LAMP_BASIS_NOTE =
  "Operating income is not reported separately (e.g. banks, insurers, and some diversified issuers), so earnings power is shown via the owner-earnings lens only; the unlevered NOPAT lens does not apply.";

const MARKS_BASIS_NOTE =
  "Earnings basis: reported net income minus investment and derivative fair-value gains/losses, net of tax at the statutory 21% — portfolio marks flow through GAAP net income (ASU 2016-01) but are not operating earnings power.";

function avg(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** 净债务:优先用申报的 net_debt,缺失则 totalDebt − cash。assembleFloor 与 Buffett 灯共用。 */
function netDebtOf(latest: ValuationFloorYear): number {
  const cash = latest.cash ?? 0;
  const totalDebt = latest.total_debt ?? 0;
  return latest.net_debt ?? totalDebt - cash;
}

/**
 * 周期保守正常化(audit #2):盈利下滑(最新年 < 多年均值)时，把"正常化盈利"压到**当前运行率**，
 * 不把已过去的繁荣峰值资本化进价值带 —— Greenwald 对周期股的纪律。稳定/增长股(最新 ≥ 均值)
 * 仍用均值，行为不变(无回归)。这是 SEC 只存 ~6 年、拉不到完整周期时的下行保护。
 */
function conservativeNormalized(
  series: number[],
  latest: number | undefined,
  lift?: { s: number; target: number | undefined },
): { value: number; capped: boolean; basisLift?: number } {
  const a = avg(series);
  if (latest != null && Number.isFinite(latest) && latest < a) return { value: latest, capped: true };
  // 上行成长股:无 lift / s≤0 / target≤avg(守卫)→ 今天行为(取 avg,只上不下)。
  if (!lift || !(lift.s > 0) || lift.target == null || !(lift.target > a)) return { value: a, capped: false };
  return { value: a + lift.s * (lift.target - a), capped: false, basisLift: lift.s };
}

// 测试钩子(仅 .check.ts 用;不改变生产行为)。
export function conservativeNormalizedForTest(
  series: number[],
  latest: number | undefined,
  lift?: { s: number; target: number | undefined },
) {
  return conservativeNormalized(series, latest, lift);
}

/**
 * mean(|capex|)/mean(revenue) over years carrying both fields (spec: capex-重要性判据)。
 * 缺失年份跳过；没有任何可算年份 → undefined（调用方按"非豁免"保守处理，即 flag 保留)。
 */
function capexToRevenueRatio(years: ValuationFloorYear[]): number | undefined {
  const usable = years.filter((y) => y.capex != null && y.revenue != null && y.revenue !== 0);
  if (usable.length === 0) return undefined;
  const meanCapex = avg(usable.map((y) => Math.abs(y.capex!)));
  const meanRevenue = avg(usable.map((y) => y.revenue!));
  return meanRevenue !== 0 ? meanCapex / meanRevenue : undefined;
}

function marginOf(y: ValuationFloorYear): number | undefined {
  if (y.operating_margin != null) return y.operating_margin;
  if (y.operating_income != null && y.revenue) return y.operating_income / y.revenue;
  return undefined;
}

function selectYears(years: ValuationFloorYear[]): ValuationFloorYear[] {
  return years
    .filter((y) => y.revenue != null && marginOf(y) != null && y.net_income != null)
    .sort((a, b) => b.fiscal_year - a.fiscal_year)
    .slice(0, TARGET_YEARS);
}

/** Years carrying a net-income signal (the minimum needed for the owner-earnings lens). */
function selectEarningsYears(years: ValuationFloorYear[]): ValuationFloorYear[] {
  return years
    .filter((y) => y.net_income != null)
    .sort((a, b) => b.fiscal_year - a.fiscal_year)
    .slice(0, TARGET_YEARS);
}

/** Multi-year average effective tax rate, clamped to [0, statutory 21%]; flat 21% fallback when no rate data. */
export function normalizedTaxRate(years: ValuationFloorYear[]): { rate: number; basis: string } {
  const rates: number[] = [];
  for (const y of years) {
    let r = y.effective_tax_rate;
    if (r == null && y.income_tax_expense != null && y.pretax_income) r = y.income_tax_expense / y.pretax_income;
    if (r != null && Number.isFinite(r)) rates.push(r);
  }
  if (rates.length === 0) {
    return { rate: MAX_TAX_RATE, basis: "No effective-rate data available; fell back to the statutory 21%." };
  }
  const clamped = Math.min(MAX_TAX_RATE, Math.max(0, avg(rates)));
  return { rate: clamped, basis: `Average effective tax rate over ${rates.length} year(s), capped at the statutory 21%.` };
}

/**
 * 工作序列(spec §5):TTM 生效时 = [TTM, FY-1…](TTM 顶替 FY0,窗口与 FY-1 不重叠),
 * 否则纯 FY。**单一真相源** —— computeValuationFloor 与 deriveOeDcf 的增长窗都经此取序列,
 * 保证 oe0 与增长窗吃同一批年份(否则 oeDcf 用纯 FY 与 workYears 标签集取交集会丢 FY0 又不含 TTM)。
 */
export function workingYears(input: ValuationFloorInput): ValuationFloorYear[] {
  return input.ttm ? [input.ttm.year, ...input.years.slice(1)] : input.years;
}

export function computeValuationFloor(input: ValuationFloorInput): ValuationFloor | PerShareUnavailable | undefined {
  // TTM 基点(spec §5):工作序列 = [TTM, FY-1…](TTM 顶替 FY0,窗口与 FY-1 不重叠);
  // allYears 保持纯 FY —— 回归型判据(roicLongTermStrong/growthFranchise/结构性趋势)审计地基不动。
  const fyYears = input.years;
  const workYears = workingYears(input);
  const earningsYears = selectEarningsYears(workYears);
  if (earningsYears.length < MIN_YEARS) return undefined;

  // Prefer the diluted count from a real earnings year (so a latest stub/transition
  // period that carries a share count but no earnings can't supply the per-share
  // divisor for window-averaged earnings); fall back to any year with a usable count.
  const shares =
    earningsYears.map((y) => y.shares_diluted).find((s) => s != null && s > 0) ??
    workYears.map((y) => y.shares_diluted).find((s) => s != null && s > 0);
  if (shares == null) return { kind: "per_share_unavailable", reason: MULTI_CLASS_REASON };

  // Full path uses the margin-qualified year subset for BOTH lamps so years_used is consistent.
  const marginYears = selectYears(workYears);
  const isFinancial = isFinancialSic(input.sic);
  // pathB(roicLongTermStrong)判据须吃"完整可得历史"而非 EPV 的 5 年正常化窗口(TARGET_YEARS)——
  // 否则 ROIC_MOAT_MIN_YEARS=6 在 marginYears/earningsYears(均 slice 到 5)下永远拿不到 6 年输入,
  // pathB 变成死代码。input.years 是 fundamentalsToFloorInput 已按 fiscal_period=FY 过滤、未截断
  // 的全量年份,只喂给 roicLongTermStrong;EPV 各 lamp 仍用 marginYears/earningsYears(不动)。
  const allYears = fyYears;
  const marks = input.marks_adjustment;
  if (marginYears.length >= MIN_YEARS) return buildFullFloor(marginYears, shares, isFinancial, allYears, marks);
  return buildSingleLampFloor(earningsYears, shares, isFinancial, allYears, marks);
}

function buildFullFloor(years: ValuationFloorYear[], shares: number, isFinancial: boolean, allYears: ValuationFloorYear[], marks?: MarksAdjustment): ValuationFloor {
  const latest = years[0];
  const cash = latest.cash ?? 0;
  const totalDebt = latest.total_debt ?? 0;
  const yearsUsed = years.map((y) => y.fiscal_year);
  const tax = normalizedTaxRate(years);
  const { nopatOf, investedCapitalOf } = roicHelpers(tax.rate);
  const roicLongStrong = roicLongTermStrong({ fyYears: allYears, nopatOf, investedCapitalOf });
  const sc = structuralConfidence({ years, allYears, roicLongTermStrong: roicLongStrong });
  const grahamEpv = buildGrahamLamp(years, cash, totalDebt, shares, yearsUsed, tax.rate);
  const buffettEpv = buildBuffettLamp(years, shares, yearsUsed, isFinancial, { s: sc.s, target: sc.target });
  return assembleFloor(years, shares, grahamEpv, buffettEpv, grahamEpv, marks ? MARKS_BASIS_NOTE : undefined, isFinancial, allYears, sc.s, marks);
}

function buildSingleLampFloor(years: ValuationFloorYear[], shares: number, isFinancial: boolean, allYears: ValuationFloorYear[], marks?: MarksAdjustment): ValuationFloor {
  const yearsUsed = years.map((y) => y.fiscal_year);
  const tax = normalizedTaxRate(years);
  const { nopatOf, investedCapitalOf } = roicHelpers(tax.rate);
  const roicLongStrong = roicLongTermStrong({ fyYears: allYears, nopatOf, investedCapitalOf });
  const sc = structuralConfidence({ years, allYears, roicLongTermStrong: roicLongStrong });
  const grahamEpv = grahamNotApplicableLamp(yearsUsed);
  const buffettEpv = buildBuffettLamp(years, shares, yearsUsed, isFinancial, { s: sc.s, target: sc.target });
  const earningsBasisNote = marks ? `${SINGLE_LAMP_BASIS_NOTE} ${MARKS_BASIS_NOTE}` : SINGLE_LAMP_BASIS_NOTE;
  return assembleFloor(years, shares, grahamEpv, buffettEpv, buffettEpv, earningsBasisNote, isFinancial, allYears, sc.s, marks);
}

// Shared scaffold: asset floor, moat (off the supplied reference lamp), leverage
// flagging, and provenance — assembled identically for both the full two-lamp and
// the single-lamp paths so the leverage threshold/prose and provenance keys live once.
function assembleFloor(
  years: ValuationFloorYear[],
  shares: number,
  grahamEpv: EpvLamp,
  buffettEpv: EpvLamp,
  moatRefLamp: EpvLamp,
  earningsBasisNote: string | undefined,
  isFinancial: boolean,
  allYears: ValuationFloorYear[],
  structuralConfidenceScore?: number,
  marks?: MarksAdjustment,
): ValuationFloor {
  const latest = years[0];
  const cash = latest.cash ?? 0;
  const totalDebt = latest.total_debt ?? 0;
  const equity = latest.shareholders_equity;
  const netDebt = netDebtOf(latest);
  const yearsUsed = years.map((y) => y.fiscal_year);
  const tax = normalizedTaxRate(years);
  // roicLongStrongMoat 须在 buildMoatReading 之前算出:层② ROIC 兜底(spec §3.2)靠它在 AV 不可评估时判 franchise。
  const { nopatOf: nopatMoat, investedCapitalOf: investedCapitalMoat } = roicHelpers(tax.rate);
  const roicLongStrongMoat = roicLongTermStrong({ fyYears: allYears, nopatOf: nopatMoat, investedCapitalOf: investedCapitalMoat });
  const assetFloor = buildReproductionValue(years, shares);
  const growthFr = growthFranchise({ fyYears: allYears, isFinancial });
  const moatReading = buildMoatReading(moatRefLamp, assetFloor, shares, roicLongStrongMoat, growthFr);
  // Shared maint read for floor-level AI-hog flag + GV gate (lamps still compute their own for OE arithmetic).
  const mc = maintenanceCapex(years);
  // AI-hog 闸(capex 两年≥2×)是"维护性 capex 被增长性 capex 污染"的工业企业透镜;金融企业的
  // 资产负债表扩张通常由存款/应收/监管资本驱动,PP&E capex 是经营成本级小项,该透镜无判别力
  // (AXP 误伤实例:2026-07 探针)。但 SIC 金融区间(尤其 6100–6199)同时收纳了比特币矿企
  // (MSTR/RIOT/CLSK/CORZ/IREN/WULF/HUT/COIN 等) —— 对它们 PP&E capex 就是生意本身,若单凭
  // SIC 一刀切豁免,恰好拆掉对它们唯一判对的信号。真正的豁免机制不是"属于金融 SIC",而是
  // "capex 相对于这门受监管融资类生意的资产负债表规模确实不重要"：仅当 is_financial 且
  // capex/revenue 均值低于 AI_CAPEX_FINANCIAL_EXEMPT_MAX_CAPEX_TO_REVENUE(校准见上,银行/保险/
  // 发卡行实测 1.2–14.7%，矿企实测 28.8%+，阈值取 20%)才豁免；缺数据保守按不豁免处理。
  // 金融股风险的既定通道仍是可信度闸(high_leverage && is_financial)与 SGR 封顶(spec D7)。
  // flag 与 GV/CAP 三处收口(suppressedFlags/growthValue 同吃这一个变量)；maintenanceCapex 的
  // 数值修正(D&A 封顶)与其披露文案(buildBuffettLamp simplifications)不受此闸影响,原样保留。
  const capexToRevenue = capexToRevenueRatio(years);
  const capexImmaterial = capexToRevenue != null && capexToRevenue < AI_CAPEX_FINANCIAL_EXEMPT_MAX_CAPEX_TO_REVENUE;
  const aiCapexDistortion = mc.ai_capex_distortion_warning === true && !(isFinancial && capexImmaterial);
  const epvMid = moatRefLamp.assessable && moatRefLamp.per_share_low != null && moatRefLamp.per_share_high != null
    ? (moatRefLamp.per_share_low + moatRefLamp.per_share_high) / 2
    : undefined;
  const netDebtToEquity = equity != null && equity > 0 ? netDebt / equity : undefined;
  const highLeverage = netDebtToEquity != null && netDebtToEquity > LEVERAGE_WARN_RATIO;

  // ── Moat → competitive-advantage-period (CAP，Phase 2 耐久性闸) — SINGLE SOURCE OF TRUTH ──
  // Computed once here; growth_value (via moatGrade) and the owner-earnings DCF (reads
  // floor.moat_cap directly) both consume this same reading, so the two legs can no longer
  // diverge on grade (BUG2). NOPAT/investedCapital share the ROIC_HURDLE=10% hurdle (BUG1
  // fix: investedCapitalOf returns undefined for negative/zero equity — a basis-invalid year,
  // not a false-positive-stable one).
  const roicTax = tax.rate;
  const { nopatOf, investedCapitalOf } = roicHelpers(roicTax);
  const roicStable = roicStability({ fyYears: years, investedCapitalOf, nopatOf, discountRate: ROIC_HURDLE });
  const roicDeclining = roicTrend({ fyYears: years, investedCapitalOf, nopatOf }) === "declining";
  const sustainableGrowthRate = sustainableGrowth({ fyYears: years, nopatOf, investedCapitalOf });
  // 金融股(银行/保险,Task 4):非经营性口径(operating_income 不适用)→ 用 SGR = ROE × 留存率
  // 封顶 g_used,取代对无护城河名字系统性放水的扁平 7% cap。sector 不可得 → is_financial=false(退 none 5%)。
  const financialSgr = isFinancial ? sustainableGrowthRateFinancial(years) : undefined;
  // strong pathB(Task 3):ROIC 长期极高且稳 → 让经营资产 EPV/AV 也不够 2× 的 GOOGL/META 类仍可凭 ROIC 走 strong。
  // 吃完整 allYears(非本函数的 5 年 marginYears/earningsYears 正常化窗口)——pathB 判的是"长期回报型久期",
  // 应看能拿到的全部历史,不受 EPV lamp 的 TARGET_YEARS 限制;nopatOf/investedCapitalOf 内部对缺字段年份
  // 自然跳过,不会因为多喂了年份就产生假数据。
  // (roicLongStrongMoat 已在 buildMoatReading 之前算出,此处复用,不重复计算。)
  const epvAvRatio =
    moatReading.epv_per_share_compared != null &&
    moatReading.asset_per_share_compared != null &&
    moatReading.asset_per_share_compared > 0
      ? moatReading.epv_per_share_compared / moatReading.asset_per_share_compared
      : undefined;
  // 经营资产 EPV/AV(剔除超额现金,pathA):千亿现金撑大资产重置价值分母、压低 EPV/AV 会把 GOOGL/META
  // 这类真护城河股误判 moderate。excessCash = max(0, latest.cash − OPERATING_CASH_PCT×最新年营收)。
  // 只服务 moat 判定,不改 asset_floor/reproduction 本身的展示。
  const latestRevenue = years.find((y) => y.fiscal_year === Math.max(...years.map((y2) => y2.fiscal_year)))?.revenue;
  const excessCashPerShare =
    latest.cash != null && latestRevenue != null && shares > 0
      ? Math.max(0, latest.cash - OPERATING_CASH_PCT * latestRevenue) / shares
      : 0;
  // 件④:marks 生效 = 我们已把这些证券的重估收益从盈利里剔除,则它们也必须从资产分母里剔除,
  // 否则分子(剔了组合回报的盈利)与分母(含组合市值的资产)不同源 —— BRK 被判 value_destruction
  // 的根因。marks 未生效的票(组合回报仍在盈利里)剔除量为 0,逐字段零漂移。
  const markedSecuritiesPerShare =
    marks != null && latest.equity_securities_fv != null && shares > 0
      ? latest.equity_securities_fv / shares
      : 0;
  const assetOperating =
    moatReading.asset_per_share_compared != null
      ? moatReading.asset_per_share_compared - excessCashPerShare - markedSecuritiesPerShare
      : undefined;
  const epvAvRatioOperating =
    epvMid != null && assetOperating != null && assetOperating > 0 ? epvMid / assetOperating : undefined;

  // 件④ 三闸:① marks 生效 ② 修正后仍进不了 franchise ③ 无营业利润(无独立经营透镜)。
  // 全中 → 合并层面的 EPV/AV 测试对这类主体没有经济含义(组合的重置成本就是其市价,
  // 持有它不构成竞争壁垒),判 not_assessable 并整条抑制,而不是给一个"价值毁灭"的假结论。
  //
  // 闸②必须与下面实际发布出去的 moatReadingFinal.signal 同源判定:两者同时要求
  // (moatReading.signal === "franchise" 且修正后比值 ≥1.25),ratio == null 一律判 false
  // (不解锁抑制)。不能只用未修正的 moatReading.signal,也不能只用修正后比值单路——否则
  // 会出现"用修正后数字解锁抑制、但发布给下游(CAP/GV/聚合面)的仍是未修正 signal"的自相
  // 矛盾:组合小幅波动就可能让修正后比值越过 franchise 门槛(解除抑制)而未修正 signal 仍是
  // value_destruction(CAP=none/GV=0),价值带塌回资产底单点,原样复现"贵 124%"的 bug。
  const noOperatingIncome = years.every((y) => y.operating_income == null);
  const franchiseAfterFix =
    moatReading.signal === "franchise" &&
    epvAvRatioOperating != null && epvAvRatioOperating >= MOAT_FRANCHISE_MULTIPLE;
  // 复审外溢修复:上面的闸②只堵住了"BRK 型"(比值本就低、组合是主体)的悬崖,却误伤了
  // "RGA 型"(比值达标≥1.25,但未修正 signal 恰好落在 commodity 而非 franchise,组合占比
  // 又近乎零——EquitySecuritiesFvNi 仅 0.31B,不是它的主体)。件④的整条论证(组合重置成本
  // 就是市价、持有它不构成壁垒)只对"组合吃掉了重置基数"的主体成立,不能因为未修正比值
  // 恰巧不到 franchise 就连带抑制。改用 portfolioShare(组合占重置基数比例)直接测"是否
  // 投资主导",而非借道 moatReading.signal 这个间接代理:
  //   - assetOperating == null(av 本身不可评估)或 ≤0(组合吃穿整个重置基数)→ 视为极端
  //     投资主导,与 ratio undefined 同源,一并归入 investmentLed=true。
  //   - portfolioShare ≥ 25%:真数据校准值(见 epvFloor.check/probe),BRK ≈48%、
  //     WTM 组合本身即主体、RGA ≈0.2%——两组间近两个数量级间隔,0.25 取中留足余量。
  // 最终闸②= investmentLed(组合确是主体) OR 修正后比值仍不达标——RGA 因 investmentLed=false
  // 且修正后比值 1.43≥1.25 → 不抑制,恢复 below+reliable;BRK/WTM 因 investmentLed=true
  // 继续抑制,悬崖依旧封死(即使日后修正后比值越过 1.25 也不会解锁)。
  const portfolioShare =
    moatReading.asset_per_share_compared != null && moatReading.asset_per_share_compared > 0
      ? markedSecuritiesPerShare / moatReading.asset_per_share_compared
      : undefined;
  const investmentLed = assetOperating == null || assetOperating <= 0 || (portfolioShare ?? 0) >= 0.25;
  const holdcoNotAssessable =
    marks != null && !franchiseAfterFix && noOperatingIncome &&
    (investmentLed || (epvAvRatioOperating != null && epvAvRatioOperating < MOAT_FRANCHISE_MULTIPLE));
  const moatReadingFinal: MoatReading = holdcoNotAssessable
    ? {
        signal: "not_assessable",
        label: "Moat not assessed: at the consolidated level this is an investment-led holding company.",
        basis_note:
          "Earnings power versus reproduction value does not describe this issuer: a marketable-securities portfolio reproduces at its own market price, so holding it cannot be a competitive barrier. The asset floor below is still shown as a floor.",
      }
    : moatReading;

  const moatCap = deriveMoatCap({
    moat: moatReadingFinal,
    epvAvRatio,
    epvAvRatioOperating,
    declined: durabilityDeclined(years),
    // 杠杆已由股权成本溢价承担(见 leveragePremium.ts / spec §3.3),不再压制护城河耐久性判定
    // —— 它此前链式砍 CAP(20→10)并经 moatGrade 压低 GV,是同一风险的第三次惩罚。
    suppressedFlags: aiCapexDistortion === true && roicDeclining,
    roicStable,
    roicLongTermStrong: roicLongStrongMoat,
    sustainedProfitYears: sustainedProfitStreak(allYears),
    growthFranchiseStrong: growthFr.strong,
  });

  const growthValue = computeGrowthValue({
    moatViaGrowth: moatReadingFinal.moat_via_growth === true,
    years,
    shares,
    taxRate: tax.rate,
    moatSignal: moatReadingFinal.signal,
    epvPerShare: epvMid,
    avPerShare: assetFloor.per_share,
    aiCapexDistortion,
    moatGrade: moatCap.grade,
  });
  return {
    kind: "floor",
    graham_epv: grahamEpv,
    buffett_epv: buffettEpv,
    asset_floor: assetFloor,
    net_net: computeNetNet({
      currentAssets: latest.current_assets,
      totalLiabilities: latest.total_liabilities,
      sharesDiluted: shares,
      preferredStock: latest.preferred_equity,
    }),
    moat_reading: moatReadingFinal,
    growth_value: growthValue,
    high_leverage_warning: highLeverage,
    // Fix 2(Task 8 whole-branch review):非金融股的高杠杆现已由 leverage_premium 定价进 9–11% 带
    // (spec D4/D7),不再是"降级近似"——那句 prose 现在只对金融股成立(金融股豁免溢价,唯一杠杆
    // 处理是可信度闸,9–11% 带对它们仍是未定价的低杠杆近似)。非金融股不再发布这条 note,由
    // leveragePremiumDisclosure(UI 侧,读 leverage_premium)接替披露。
    high_leverage_note: highLeverage && isFinancial
      ? "High leverage (net debt / shareholders' equity above 1.0): for financial issuers the single 9–11% rate band is a low-leverage approximation that is not priced for leverage (financials are exempt from the leverage premium; see the reliability gate instead). The ranges are shown but should be read with that in mind."
      : undefined,
    net_debt_to_equity: netDebtToEquity,
    leverage_premium: buffettEpv.leverage_reading?.premium ?? 0,
    net_debt_to_owner_earnings: buffettEpv.leverage_reading?.leverage,
    leverage_premium_basis: buffettEpv.leverage_reading?.basis,
    ai_capex_distortion_warning: aiCapexDistortion || undefined,
    moat_cap: moatCap,
    sustainable_growth: sustainableGrowthRate,
    is_financial: isFinancial,
    financial_sgr: financialSgr,
    structural_confidence: structuralConfidenceScore,
    marks_adjustment: marks,
    holdco_not_assessable: holdcoNotAssessable || undefined,
    provenance: {
      years_used: yearsUsed,
      as_of_fiscal_year: latest.fiscal_year,
      discount_rate_band: [DISCOUNT_RATE_LOW, DISCOUNT_RATE_HIGH],
      normalized_tax_rate: tax.rate,
      normalized_tax_rate_basis: tax.basis,
      maintenance_capex_rule: MAINT_CAPEX_RULE,
      share_count_basis: "diluted",
      earnings_basis_note: earningsBasisNote,
    },
  };
}

function buildGrahamLamp(
  years: ValuationFloorYear[],
  cash: number,
  totalDebt: number,
  shares: number,
  yearsUsed: number[],
  taxRate: number,
): EpvLamp {
  const mc = maintenanceCapex(years);
  const latestDa = years[0].d_and_a;
  // write A: deduct (maintCapex − D&A) in full cash from after-tax NOPAT. When maintCapex == D&A
  // (or either is missing → degrade), this collapses to NOPAT/WACC (v1 parity).
  const canCorrect = mc.assessable && mc.value != null && latestDa != null;
  const capexDrag = canCorrect ? mc.value! - latestDa! : 0;
  const simplifications: string[] = [];
  if (canCorrect) {
    simplifications.push(
      `Maintenance capex (${mc.confidence}) deducted in full cash (write A): EPV = (NOPAT + D&A − maintenance capex) / WACC; no tax shield on the capex term.`,
    );
    // AI-hog / divergence / method notes come from maintenanceCapex (scheme C: floored then D&A-capped; OE/EPV may look optimistic).
    for (const n of mc.notes) simplifications.push(n);
  } else {
    simplifications.push("Maintenance capex unavailable → degraded to the v1 simplification (maintenance capex = D&A, so the depreciation add-back nets to zero).");
  }
  simplifications.push("Share-based compensation is left as a real expense (not added back).");

  const method = {
    earnings_basis: "Normalized NOPAT = average operating margin over the years shown × latest-year revenue × (1 − normalized tax); then + D&A − maintenance capex (write A).",
    leverage_treatment: "Unlevered (pre-interest, attributable to all capital).",
    denominator: "Capitalized at the 9–11% rate band (read as a WACC proxy).",
    bridge: "Enterprise → equity bridge applied: + cash − total debt.",
    discount_rate_low: DISCOUNT_RATE_LOW,
    discount_rate_high: DISCOUNT_RATE_HIGH,
    years_used: yearsUsed,
    simplifications,
  };
  const latestRevenue = years[0].revenue!;
  const margins = years.map((y) => marginOf(y)!);
  // 周期保守:margin 下滑时压到当前 margin,不用繁荣期均值(audit #2)。
  const normMargin = conservativeNormalized(margins, margins[0]);
  if (normMargin.capped) simplifications.push("Operating margin is below its multi-year average (cyclical/declining): normalized margin capped at the latest year — no peak-margin capitalization (audit #2).");
  const nopat = normMargin.value * latestRevenue * (1 - taxRate);
  const ownerStream = nopat - capexDrag; // = NOPAT + D&A − maintCapex when canCorrect, else NOPAT
  if (ownerStream <= 0) {
    return {
      label: "Graham earnings-power value (normalized NOPAT)",
      assessable: false,
      not_assessable_reason: "Normalized operating earnings net of maintenance capex are non-positive over the years shown; earnings power cannot be capitalized.",
      normalized_earnings: ownerStream,
      method,
    };
  }
  const equityLow = ownerStream / DISCOUNT_RATE_HIGH + cash - totalDebt;
  const equityHigh = ownerStream / DISCOUNT_RATE_LOW + cash - totalDebt;
  return {
    label: "Graham earnings-power value (normalized NOPAT)",
    assessable: true,
    normalized_earnings: ownerStream,
    equity_value_low: equityLow,
    equity_value_high: equityHigh,
    per_share_low: equityLow / shares,
    per_share_high: equityHigh / shares,
    method,
  };
}

/** Single-lamp mode: operating income absent, so the unlevered NOPAT lens cannot be applied. */
function grahamNotApplicableLamp(yearsUsed: number[]): EpvLamp {
  return {
    label: "Graham earnings-power value (normalized NOPAT)",
    assessable: false,
    not_assessable_reason: SINGLE_LAMP_BASIS_NOTE,
    method: {
      earnings_basis: "Normalized NOPAT from operating margin — not applicable when operating income is not reported separately.",
      leverage_treatment: "Unlevered (pre-interest, attributable to all capital).",
      denominator: "Capitalized at the 9–11% rate band (read as a WACC proxy).",
      bridge: "Enterprise → equity bridge (+ cash − total debt) — not applied (lens not assessable).",
      discount_rate_low: DISCOUNT_RATE_LOW,
      discount_rate_high: DISCOUNT_RATE_HIGH,
      years_used: yearsUsed,
      simplifications: [],
    },
  };
}

function buildBuffettLamp(
  years: ValuationFloorYear[],
  shares: number,
  yearsUsed: number[],
  isFinancial: boolean,
  lift?: { s: number; target: number | undefined },
): EpvLamp {
  const mc = maintenanceCapex(years);
  const niSeries = years.map((y) => y.net_income!);
  // 周期保守:净利下滑时压到当前运行率,不资本化繁荣峰值均值(audit #2)。上行成长股:结构性置信分 s
  // 驱动的连续加权(Phase 3.7)—— s 高 + target(趋势拟合)> avg → 抬基数;s=0/target≤avg → 今天行为(avg)。
  const normNi = conservativeNormalized(niSeries, niSeries[0], lift);
  const daVals = years.map((y) => y.d_and_a).filter((v): v is number => v != null);
  const avgDa = daVals.length ? avg(daVals) : undefined;
  // Real owner earnings = net income + D&A − maintenance capex, WITHOUT ΔNWC (maintenance ΔNWC ≈ 0;
  // the growth portion of ΔNWC lives in GV — audit fix #3). Degrade to avg net income when inputs missing.
  const canCorrect = mc.assessable && mc.value != null && avgDa != null;
  const ownerEarnings = canCorrect ? normNi.value + avgDa! - mc.value! : normNi.value;

  // 杠杆 → 股权成本溢价(spec D4):本灯是**股权流 / 股权成本**口径(净利起算、已扣息、无桥),
  // 股权成本随杠杆上升(MM Prop II)。Graham 灯是无杠杆 NOPAT/WACC + 桥,不加溢价。
  // 溢价必须在 ownerEarnings 算出后才能算(它是分母),故在灯内部算,再透出给 assembleFloor 发布。
  // spec D7:金融股(银行/保险)netDebt/ownerEarnings 对存款型资产负债表无意义(deriveValuationVerdict.ts
  // 的注释同源),豁免溢价 —— 金融股的唯一杠杆处理是可信度闸(Task 6),不再叠加股权成本溢价。
  const lev = isFinancial
    ? { premium: 0, leverage: undefined, basis: "Financial issuer (bank/insurer): net debt / owner earnings does not describe a deposit-funded balance sheet, so no leverage premium is applied here; leverage is instead handled by the reliability gate." }
    : leveragePremium({ netDebt: netDebtOf(years[0]), ownerEarnings });
  const rLow = DISCOUNT_RATE_LOW + lev.premium;
  const rHigh = DISCOUNT_RATE_HIGH + lev.premium;

  const simplifications: string[] = [];
  if (normNi.capped) simplifications.push("Net income is below its multi-year average (cyclical/declining): normalized owner earnings anchored to the latest year — no peak-earnings capitalization (audit #2).");
  if (canCorrect) {
    simplifications.push(`Owner earnings = net income + D&A − maintenance capex (${mc.confidence}); the working-capital change is excluded (maintenance ΔNWC ≈ 0; growth ΔNWC is carried in growth value, not double-counted).`);
    // AI-hog / divergence / method notes from maintenanceCapex (scheme C: floored then D&A-capped; OE may look optimistic).
    for (const n of mc.notes) simplifications.push(n);
  } else {
    simplifications.push("Maintenance capex or D&A unavailable → degraded to normalized net income (= average net income over the years shown).");
  }
  simplifications.push("One-time items are not separately normalized (multi-year averaging smooths them partially).");
  simplifications.push("Share-based compensation is left as a real expense (not added back); see the SBC/OE disclosure.");
  simplifications.push(
    lev.premium > 0
      ? `Capitalized at the 9–11% base band plus a ${(lev.premium * 100).toFixed(1)}pp leverage premium (cost of equity rises with leverage — MM Proposition II). ${lev.basis}`
      : lev.leverage === undefined
        ? `Capitalized at the 9–11% band as a cost-of-equity proxy; no leverage premium applied. ${lev.basis}`
        : "Capitalized at the 9–11% band as a cost-of-equity proxy; no leverage premium applied (net cash or debt within the no-charge range).",
  );

  const method = {
    earnings_basis: "Owner earnings = average net income + average D&A − maintenance capex (zero-growth floor; no ΔNWC).",
    leverage_treatment: "Levered (starts from net income, already after interest — an equity-holder stream).",
    denominator: lev.premium > 0
      ? `Capitalized at the ${(rLow * 100).toFixed(1)}–${(rHigh * 100).toFixed(1)}% band (9–11% base + ${(lev.premium * 100).toFixed(1)}pp leverage premium).`
      : "Capitalized at the 9–11% rate band (read as a cost-of-equity proxy).",
    bridge: "No enterprise→equity bridge: the capitalized result is already equity value (subtracting debt would double-count interest).",
    discount_rate_low: rLow,
    discount_rate_high: rHigh,
    years_used: yearsUsed,
    simplifications,
  };

  // SBC disclosure (not added back): average SBC / owner earnings.
  const sbcVals = years.map((y) => y.stock_based_comp).filter((v): v is number => v != null);
  const sbcToOe = sbcVals.length && ownerEarnings > 0 ? avg(sbcVals) / ownerEarnings : undefined;

  // 回购是否仅抵消 SBC 稀释(Mauboussin:回购≠净回馈)。share_repurchases 存负现金流出,取绝对值对齐 SBC 正费用。
  const repurchVals = years.map((y) => y.share_repurchases).filter((v): v is number => v != null).map(Math.abs);
  const buybackOffsetsSbc =
    repurchVals.length && sbcVals.length ? avg(repurchVals) <= avg(sbcVals) : undefined;

  if (ownerEarnings <= 0) {
    return {
      label: "Buffett owner-earnings value",
      assessable: false,
      not_assessable_reason: "Normalized owner earnings are non-positive over the years shown; earnings power cannot be capitalized.",
      normalized_earnings: ownerEarnings,
      sbc_to_oe_pct: sbcToOe,
      buyback_offsets_sbc: buybackOffsetsSbc,
      leverage_reading: lev,
      method,
    };
  }
  const equityLow = ownerEarnings / rHigh;
  const equityHigh = ownerEarnings / rLow;
  return {
    label: "Buffett owner-earnings value",
    assessable: true,
    normalized_earnings: ownerEarnings,
    equity_value_low: equityLow,
    equity_value_high: equityHigh,
    per_share_low: equityLow / shares,
    per_share_high: equityHigh / shares,
    sbc_to_oe_pct: sbcToOe,
    buyback_offsets_sbc: buybackOffsetsSbc,
    leverage_reading: lev,
    method,
  };
}

export function buildMoatReading(epvLamp: EpvLamp, reproduction: ReproductionValue, shares: number, roicLongStrong: boolean, growthFr: GrowthFranchiseResult): MoatReading {
  const dualComparable =
    reproduction.dual_av_comparable === true &&
    reproduction.reproduction_per_share != null &&
    Number.isFinite(reproduction.reproduction_per_share);

  const basisNote = dualComparable
    ? "Franchise test compares earnings power (EPV) against reproduction value on both AV_conservative (tangible + capitalized R&D) and AV_reproduction (conservative + acquired-reset proxy). Both must clear the franchise multiple for a moat signal; near it, a commodity; below it, value destruction. A directional reading, not a verdict."
    : reproduction.intangibles_separated
      ? "Franchise test compares earnings power (EPV) against reproduction value (tangible net assets + capitalized R&D). EPV well above reproduction value signals a moat; near it, a commodity; below it, value destruction. A directional reading, not a verdict."
      : "Franchise test compares earnings power (EPV) against reproduction value (tangible net assets + capitalized R&D). EPV well above reproduction value signals a moat; near it, a commodity; below it, value destruction. Dual reproduction test unavailable (intangibles not separated). A directional reading, not a verdict.";

  if (!epvLamp.assessable) {
    return { signal: "value_destruction", label: "Normalized earnings are non-positive, so earnings power sits below the reproduction-value base — a value-destruction signal (not a verdict).", basis_note: basisNote };
  }
  if (!reproduction.assessable || reproduction.per_share == null) {
    // 层② ROIC 兜底(spec §3.2):AV 因深度负权益/无形主导不可评估,但 EPV 强(本行已过 epvLamp.assessable)
    // 且 ROIC 长期极高稳 → Greenwald §1.1.1「sustained high ROIC」是护城河终极判据,AV 只是 backstop。
    if (roicLongStrong && epvLamp.per_share_low != null && epvLamp.per_share_high != null) {
      const epvMid = (epvLamp.per_share_low + epvLamp.per_share_high) / 2;
      return {
        signal: "franchise",
        label: "Reproduction value is not assessable (capital structure distorted), but sustained high ROIC signals a durable franchise — a moat signal on the returns test, not a verdict.",
        basis_note: basisNote,
        epv_per_share_compared: epvMid,
        moat_via_roic: true,
      };
    }
    // 层② 死角(spec §3.3):AV 与 ROIC 双不可评估 → 资本结构被回购扭曲,护城河不可评估。
    return {
      signal: "not_assessable",
      label: "The earnings-power vs reproduction-value comparison is unavailable: the capital structure is distorted by buybacks (deeply negative equity) and returns history is too short or unstable to judge a moat.",
      basis_note: basisNote,
      capital_structure_distorted: true,
    };
  }

  const epvMid = (epvLamp.per_share_low! + epvLamp.per_share_high!) / 2;
  const avCons = reproduction.per_share;
  const ratioCons = epvMid / avCons;

  // 成长型 franchise 旁路（spec §3）:纯比率本会判 commodity,但已证实营业利润持续增长 → 改判 franchise。
  // 保留原 dual/single 展示字段,dual_test_passed 保持 false（非经 dual EPV 测试而来）。
  const viaGrowth = (extraFields: Partial<MoatReading>): MoatReading => ({
    signal: "franchise",
    label: "Earnings power looks commodity-like today, but operating income has compounded for years — a franchise (moat) signal on proven earnings growth, not a verdict.",
    basis_note: basisNote,
    moat_via_growth: true,
    ...extraFields,
  });

  // Dual-AV franchise gate: both EPV/AV_cons and EPV/AV_repr must clear the franchise multiple.
  if (dualComparable) {
    const avRepr = reproduction.reproduction_per_share!;
    const ratioRepr = epvMid / avRepr;
    const dualFields = {
      epv_per_share_compared: epvMid,
      asset_per_share_compared: avCons,
      av_conservative_per_share: avCons,
      av_reproduction_per_share: avRepr,
    };
    if (ratioCons >= MOAT_FRANCHISE_MULTIPLE && ratioRepr >= MOAT_FRANCHISE_MULTIPLE) {
      return {
        signal: "franchise",
        label: "Earnings power sits well above both conservative and reproduction asset values — a franchise (moat) signal, not a verdict.",
        basis_note: basisNote,
        ...dualFields,
        dual_test_passed: true,
        franchise_value: (epvMid - avCons) * shares,
      };
    }
    if (ratioCons >= MOAT_FRANCHISE_MULTIPLE && ratioRepr < MOAT_FRANCHISE_MULTIPLE) {
      if (growthFr.passes) return viaGrowth({ ...dualFields, franchise_value: (epvMid - avCons) * shares });
      return {
        signal: "commodity",
        label: "Earnings power clears the conservative asset floor but not the reproduction (acquired-reset) floor — treated as commodity-like, not a franchise.",
        basis_note: basisNote,
        ...dualFields,
        dual_test_passed: false,
        franchise_blocked_by_reproduction: true,
      };
    }
    // Conservative path for commodity / value_destruction floors (unchanged thresholds).
    if (ratioCons >= MOAT_COMMODITY_FLOOR) {
      if (growthFr.passes) return viaGrowth({ ...dualFields, franchise_value: (epvMid - avCons) * shares });
      return {
        signal: "commodity",
        label: "Earnings power sits near reproduction value — a commodity-like profile with no clear moat signal.",
        basis_note: basisNote,
        ...dualFields,
        dual_test_passed: false,
      };
    }
    return {
      signal: "value_destruction",
      label: "Earnings power sits below reproduction value — a value-destruction signal, not a verdict.",
      basis_note: basisNote,
      ...dualFields,
      dual_test_passed: false,
    };
  }

  // Single-AV fallback when intangibles are not separated (dual reproduction test unavailable).
  if (ratioCons >= MOAT_FRANCHISE_MULTIPLE) {
    return {
      signal: "franchise",
      label: "Earnings power sits well above reproduction value — a franchise (moat) signal, not a verdict.",
      basis_note: basisNote,
      epv_per_share_compared: epvMid,
      asset_per_share_compared: avCons,
      franchise_value: (epvMid - avCons) * shares,
    };
  }
  if (ratioCons >= MOAT_COMMODITY_FLOOR) {
    if (growthFr.passes) return viaGrowth({ epv_per_share_compared: epvMid, asset_per_share_compared: avCons, franchise_value: (epvMid - avCons) * shares });
    return { signal: "commodity", label: "Earnings power sits near reproduction value — a commodity-like profile with no clear moat signal.", basis_note: basisNote, epv_per_share_compared: epvMid, asset_per_share_compared: avCons };
  }
  return { signal: "value_destruction", label: "Earnings power sits below reproduction value — a value-destruction signal, not a verdict.", basis_note: basisNote, epv_per_share_compared: epvMid, asset_per_share_compared: avCons };
}
