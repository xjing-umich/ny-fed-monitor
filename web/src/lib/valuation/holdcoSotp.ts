/**
 * 件⑤ 控股集团分部 SOTP(spec 2026-08-10)。
 *
 *   SOTP(档) = 投资按市值
 *            + 非保险经营业务税后盈利(三年均) × 倍数(档)
 *            + 保险承保税后利润(三年均) × 承保倍数(档)
 *            − 递延税
 *
 * 为什么合并层面的单一镜头对这类主体无效(件④已论证):资产里几千亿是按市值计价的证券,其
 * 回报是价格增值而非现金收益;件③又已把这部分增值从盈利里剔除。于是「盈利资本化」与「资产
 * 重置成本」两个数不同源,取大取小都不对 —— 正确做法是**相加**。
 *
 * 本模块是纯函数,不 import sec 层,输入用自有窄接口。
 */

/** 非保险经营业务的混合倍数。三档而非单一倍数是主流 SOTP 的既定纪律。
 *  刻意**不做逐分部行业倍数**:member 名是公司自定义的,按关键词猜行业再配倍数是无法校准的
 *  臆断;混合倍数把这份不确定性显式放进三档区间里,比假装精确诚实。 */
export const OPERATING_MULTIPLES = [12, 15, 18] as const;

/** 承保倍数。BRK 承保税前三年 6.91/11.40/9.46,摆动 ±30%,远大于经营业务 → 给更低倍数。 */
export const UNDERWRITING_MULTIPLES = [8, 10, 12] as const;

/** 承保按法定税率而非保险集团混合实际税率 —— 后者被投资分部的股息扣除拉低,用在承保上会低估税负。 */
export const UNDERWRITING_TAX_RATE = 0.21;

/** 递延税按面值全额扣(保守;无息递延的折现优惠留作后续)。 */
export const DEFERRED_TAX_RATE = 0.21;

export const SOTP_MIN_YEARS = 3;
export const SOTP_RECONCILE_TOLERANCE = 0.1;

export type SotpTier = { pessimistic: number; base: number; optimistic: number };

export type SotpBlockReason =
  | "insufficient_years"
  | "reconciliation_failed"
  | "investments_unavailable"
  | "shares_unavailable"
  | "no_operating_earnings";

export type HoldcoSotp = {
  assessable: true;
  per_share: SotpTier;
  columns: {
    investments: number;
    operating: SotpTier;
    underwriting: SotpTier;
    deferred_tax: number;
  };
  basis: {
    investments_total: number;
    operating_after_tax_mean: number;
    underwriting_after_tax_mean: number;
    years_used: number;
    shares: number;
    operating_multiples: readonly number[];
    underwriting_multiples: readonly number[];
  };
};

export type HoldcoSotpUnavailable = { assessable: false; reason: SotpBlockReason };

export type HoldcoSotpYear = {
  period_end: string;
  total_pretax: number | null;
  total_tax: number | null;
  insurance_pretax: number | null;
  insurance_tax: number | null;
  underwriting_pretax: number | null;
};

export type HoldcoSotpInput = {
  shares: number;
  investments: { total: number; unrealized_gain: number | null } | null;
  years: HoldcoSotpYear[];
  consolidatedPretaxByYear?: Record<string, number | null>;
};

const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function tierOf(base: number, multiples: readonly number[], shares: number): SotpTier {
  const [lo, mid, hi] = multiples;
  return {
    pessimistic: (base * lo) / shares,
    base: (base * mid) / shares,
    optimistic: (base * hi) / shares,
  };
}

export function computeHoldcoSotp(input: HoldcoSotpInput): HoldcoSotp | HoldcoSotpUnavailable {
  const { shares, investments, years, consolidatedPretaxByYear } = input;

  if (!finite(shares) || shares <= 0) return { assessable: false, reason: "shares_unavailable" };
  if (!investments || !finite(investments.total) || investments.total <= 0) {
    return { assessable: false, reason: "investments_unavailable" };
  }
  // 递延税基数缺失时不静默按 0 —— 少扣一项会系统性抬高估值。
  if (!finite(investments.unrealized_gain)) {
    return { assessable: false, reason: "investments_unavailable" };
  }

  // 闸①:至少 3 个完整年份,且每年第二、三栏所需分量齐备。
  const usable = years.filter(
    (y) =>
      finite(y.total_pretax) && finite(y.total_tax) &&
      finite(y.insurance_pretax) && finite(y.insurance_tax) &&
      finite(y.underwriting_pretax),
  );
  if (usable.length < SOTP_MIN_YEARS) return { assessable: false, reason: "insufficient_years" };

  // 闸②:分部税前合计与合并口径对账。传了才查(fail-open 会让闸形同虚设,故缺值视为不查而非放行——
  // 调用方若拿不到合并口径就不传,由上游的其他闸兜底)。
  if (consolidatedPretaxByYear) {
    for (const y of usable) {
      const consolidated = consolidatedPretaxByYear[y.period_end];
      if (!finite(consolidated) || consolidated === 0) continue;
      const dev = Math.abs((y.total_pretax as number) - consolidated) / Math.abs(consolidated);
      if (dev > SOTP_RECONCILE_TOLERANCE) return { assessable: false, reason: "reconciliation_failed" };
    }
  }

  const recent = [...usable]
    .sort((a, b) => b.period_end.localeCompare(a.period_end))
    .slice(0, SOTP_MIN_YEARS);

  // 第二栏:非保险经营 = 经营分部合计 − 保险集团合计,用**实际分部税**。
  // BHE 的可再生能源抵免让有效税率落在 13% 上下,真实且重复发生(须在页面披露)。
  const operatingAfterTax = recent.map(
    (y) => (y.total_pretax as number) - (y.insurance_pretax as number)
         - ((y.total_tax as number) - (y.insurance_tax as number)),
  );
  if (operatingAfterTax.some((v) => !finite(v))) return { assessable: false, reason: "no_operating_earnings" };
  const operatingMean = mean(operatingAfterTax);
  if (!(operatingMean > 0)) return { assessable: false, reason: "no_operating_earnings" };

  // 第三栏:承保按法定税率。★ 保险的**投资分部**不进任何一栏 —— 它是第一栏那些证券产生的
  // 收益,计入即与第一栏重复。这里用「保险集团 − 承保」的补集天然排除它。
  const underwritingMean = mean(
    recent.map((y) => (y.underwriting_pretax as number) * (1 - UNDERWRITING_TAX_RATE)),
  );

  const investmentsPerShare = investments.total / shares;
  const deferredTaxPerShare = ((investments.unrealized_gain as number) * DEFERRED_TAX_RATE) / shares;
  const operating = tierOf(operatingMean, OPERATING_MULTIPLES, shares);
  // 承保为负时三档会反序(亏得越多、倍数越大扣得越狠),对承保亏损年份这是正确方向,但要保证
  // per_share 三档仍单调 → 按数值排序后再组装。
  const underwritingRaw = tierOf(underwritingMean, UNDERWRITING_MULTIPLES, shares);
  const uwSorted = [underwritingRaw.pessimistic, underwritingRaw.base, underwritingRaw.optimistic].sort(
    (a, b) => a - b,
  );
  const underwriting: SotpTier = { pessimistic: uwSorted[0], base: uwSorted[1], optimistic: uwSorted[2] };

  const compose = (tier: keyof SotpTier) =>
    investmentsPerShare + operating[tier] + underwriting[tier] - deferredTaxPerShare;

  return {
    assessable: true,
    per_share: {
      pessimistic: compose("pessimistic"),
      base: compose("base"),
      optimistic: compose("optimistic"),
    },
    columns: {
      investments: investmentsPerShare,
      operating,
      underwriting,
      deferred_tax: deferredTaxPerShare,
    },
    basis: {
      investments_total: investments.total,
      operating_after_tax_mean: operatingMean,
      underwriting_after_tax_mean: underwritingMean,
      years_used: recent.length,
      shares,
      operating_multiples: OPERATING_MULTIPLES,
      underwriting_multiples: UNDERWRITING_MULTIPLES,
    },
  };
}
