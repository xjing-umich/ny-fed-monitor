import { InstanceFact, pickFact } from "./instance-facts";

/**
 * 第一栏:投资按市值。
 *
 * ★ 本模块存在的理由是一次真实事故:件⑤第一版把第一栏算成 388.2B、每股 SOTP 上沿仅 $396,
 *   与 1.10 万亿市值严重不符。根因是漏了 USTreasuryBills 321.43B(占第一栏 46%)——该事实带
 *   ProductOrService 维度,被 companyfacts API 在接口层剥掉,而库内 short_term_investments 的
 *   tag 清单(ShortTermInvestments/AvailableForSaleSecuritiesCurrent/MarketableSecuritiesCurrent)
 *   不含它 → 字段为 NULL,"字段齐备"检查照样通过。
 *
 *   教训:光靠「字段非空」判齐备不够,必须用**会计恒等式**把漏项逼出来。故本模块的两道闸
 *   (归属闸 + 闭合闸)是主角,不是附属校验。
 */
export type HoldcoInvestments = {
  period_end: string;
  cash: number;
  treasuries: number;
  equity_securities: number;
  equity_method: number;
  afs_debt: number;
  total: number;
  unrealized_gain: number | null;
  gate_attribution_ok: boolean;
  gate_closure_ok: boolean;
};

/** 两道会计恒等式闸的容差。2% 足以吸收受限现金这类小额未分列项,又拦得住 46% 量级的漏项。 */
export const HOLDCO_GATE_TOLERANCE = 0.02;

/** 投资所在的列。伯克希尔把资产负债表分成「保险与其他」与「铁路、公用事业和能源」两列,
 *  投资全部在前者;后者的经营现金属于第二栏那些业务,计入第一栏即重复。 */
export const INVESTMENT_COLUMN_MEMBER = "InsuranceAndOtherMember";
const PRODUCT_AXIS = "ProductOrService";

/** 短期国债。BRK 用 USTreasuryBills;其余 filer 的同族兜底按优先级排列。 */
export const TREASURY_TAGS = [
  "USTreasuryBills",
  "ShortTermInvestments",
  "AvailableForSaleSecuritiesCurrent",
  "MarketableSecuritiesCurrent",
];

const CASH_TAG = "CashAndCashEquivalentsAtCarryingValue";
const CONSOLIDATED_CASH_TAGS = [
  "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
  "CashAndCashEquivalentsAtCarryingValue",
];

/** 在指定列里取一个 tag;列内取不到时**不**回退到无维度值(那正是串值来源)。 */
function inColumn(facts: InstanceFact[], tag: string, periodEnd: string): number | null {
  return pickFact(facts, {
    tag,
    instant: periodEnd,
    axisContains: PRODUCT_AXIS,
    member: INVESTMENT_COLUMN_MEMBER,
  });
}

/** 先取无维度值,取不到再取投资列的值(权益证券等在 BRK 上是无维度申报的)。 */
function plainOrColumn(facts: InstanceFact[], tag: string, periodEnd: string): number | null {
  return (
    pickFact(facts, { tag, instant: periodEnd, dimensionless: true }) ?? inColumn(facts, tag, periodEnd)
  );
}

function firstOf(facts: InstanceFact[], tags: string[], periodEnd: string,
                 get: (f: InstanceFact[], t: string, p: string) => number | null): number | null {
  for (const tag of tags) {
    const v = get(facts, tag, periodEnd);
    if (v != null) return v;
  }
  return null;
}

/**
 * 闸①归属:投资列现金 + 其余各列现金 ≈ 合并现金总额。
 * 拦「漏取了某一列」与「错把合并数当成某一列」。
 */
function checkAttribution(facts: InstanceFact[], periodEnd: string, columnCash: number): boolean {
  const consolidated = firstOf(facts, CONSOLIDATED_CASH_TAGS, periodEnd,
    (f, t, p) => pickFact(f, { tag: t, instant: p, dimensionless: true }));
  if (consolidated == null || consolidated <= 0) return false; // fail-closed:测不了就不放行
  const perColumn = facts
    .filter((f) => f.tag === CASH_TAG && f.instant === periodEnd && f.dims[`${PRODUCT_AXIS}Axis`] != null)
    .reduce<Record<string, number>>((acc, f) => {
      const m = f.dims[`${PRODUCT_AXIS}Axis`];
      acc[m] = Math.max(acc[m] ?? 0, f.value); // 同列重复申报取一次
      return acc;
    }, {});
  const summed = Object.values(perColumn).reduce((a, b) => a + b, 0);
  if (!(summed > 0) || perColumn[INVESTMENT_COLUMN_MEMBER] !== columnCash) return false;
  // 合并数常含受限现金等未分列项 → 只要求各列之和不超过合并数,且缺口在容差内。
  return summed <= consolidated && (consolidated - summed) / consolidated <= HOLDCO_GATE_TOLERANCE;
}

/**
 * 闸②闭合:各 ProductOrService 列的 Assets 之和 ≈ 合并 Assets。
 * 拦「存在第三个未被发现的资产池」——若真有一整块资产没被任何列覆盖,第一栏就可能又漏一次。
 */
function checkClosure(facts: InstanceFact[], periodEnd: string): boolean {
  const consolidated = pickFact(facts, { tag: "Assets", instant: periodEnd, dimensionless: true });
  if (consolidated == null || consolidated <= 0) return false;
  const perColumn = facts
    .filter((f) => f.tag === "Assets" && f.instant === periodEnd && f.dims[`${PRODUCT_AXIS}Axis`] != null)
    .reduce<Record<string, number>>((acc, f) => {
      const m = f.dims[`${PRODUCT_AXIS}Axis`];
      acc[m] = Math.max(acc[m] ?? 0, f.value);
      return acc;
    }, {});
  const summed = Object.values(perColumn).reduce((a, b) => a + b, 0);
  if (!(summed > 0)) return false;
  return Math.abs(summed - consolidated) / consolidated <= HOLDCO_GATE_TOLERANCE;
}

/**
 * 提取第一栏。任一组成缺失或任一闸不过 → 返回 null(fail-closed),由调用方退回件④的抑制。
 * 递延税基数 unrealized_gain 允许缺失(调用方另有 FvNi − FvNiCost 的第二来源)。
 */
export function extractHoldcoInvestments(facts: InstanceFact[], periodEnd: string): HoldcoInvestments | null {
  const cash = inColumn(facts, CASH_TAG, periodEnd);
  const treasuries = firstOf(facts, TREASURY_TAGS, periodEnd, inColumn)
    ?? firstOf(facts, TREASURY_TAGS, periodEnd,
         (f, t, p) => pickFact(f, { tag: t, instant: p, dimensionless: true }));
  const equity_securities = plainOrColumn(facts, "EquitySecuritiesFvNi", periodEnd);
  const equity_method = plainOrColumn(facts, "EquityMethodInvestments", periodEnd);
  const afs_debt = plainOrColumn(facts, "AvailableForSaleSecuritiesDebtSecurities", periodEnd);

  // 五项缺一不可 —— 这正是 321B 事故的直接防线。
  if (cash == null || treasuries == null || equity_securities == null
      || equity_method == null || afs_debt == null) return null;

  const gate_attribution_ok = checkAttribution(facts, periodEnd, cash);
  const gate_closure_ok = checkClosure(facts, periodEnd);
  if (!gate_attribution_ok || !gate_closure_ok) return null;

  // 递延税基数:优先直取(无维度),否则由 FvNi − FvNiCost 反算(两者在 BRK 上分毫不差)。
  const direct = pickFact(facts, { tag: "EquitySecuritiesAccumulatedUnrealizedGainLoss", instant: periodEnd, dimensionless: true });
  const cost = pickFact(facts, { tag: "EquitySecuritiesFvNiCost", instant: periodEnd, dimensionless: true });
  const unrealized_gain = direct ?? (cost != null ? equity_securities - cost : null);

  return {
    period_end: periodEnd,
    cash,
    treasuries,
    equity_securities,
    equity_method,
    afs_debt,
    total: cash + treasuries + equity_securities + equity_method + afs_debt,
    unrealized_gain,
    gate_attribution_ok,
    gate_closure_ok,
  };
}
