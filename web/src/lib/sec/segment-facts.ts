import { InstanceFact, pickFact } from "./instance-facts";

/**
 * 分部利润取数。
 *
 * 第二栏(非保险经营)= 经营分部合计 − 保险集团合计;第三栏(承保)= 承保分部。
 * ★ 保险的**投资分部**(BRK FY2025 15.26B)必须能被单独识别并排除 —— 它是第一栏那些证券
 *   产生的收益,计入即与第一栏重复。这是本模块 kind 分类存在的首要理由。
 */
export type SegmentKind = "insurance_underwriting" | "insurance_investments" | "operating" | "corporate";

export type SegmentPeriod = {
  period_end: string;
  segment_member: string;
  segment_label: string;
  kind: SegmentKind;
  pretax_income: number | null;
  income_tax: number | null;
};

export type SegmentYear = {
  period_end: string;
  total_pretax: number | null;
  total_tax: number | null;
  insurance_pretax: number | null;
  insurance_tax: number | null;
  underwriting_pretax: number | null;
  investments_pretax: number | null;
  segments: SegmentPeriod[];
};

export const SEGMENT_PRETAX_TAG =
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";
const SEGMENT_TAX_TAG = "IncomeTaxExpenseBenefit";

const CONSOLIDATION_AXIS = "ConsolidationItems";
const OPERATING_SEGMENTS_MEMBER = "OperatingSegmentsMember";
const BUSINESS_SEGMENTS_AXIS = "StatementBusinessSegments";
const PRODUCT_AXIS = "ProductOrService";

/** member 名是公司自定义的,只能按关键词判。故意只判**结构性**关键词,不猜行业(见 spec §2.2:
 *  逐分部行业倍数是无法校准的臆断,统一混合倍数把不确定性显式放进三档区间)。 */
export function classifySegment(dims: Record<string, string>): SegmentKind {
  const values = Object.entries(dims)
    .filter(([axis]) => !axis.includes(CONSOLIDATION_AXIS))
    .map(([, m]) => m)
    .join("|");
  const consolidation = Object.entries(dims).find(([axis]) => axis.includes(CONSOLIDATION_AXIS))?.[1] ?? "";
  if (/Corporate|Eliminat|Reconcil/i.test(consolidation) || /Corporate|Eliminat|Reconcil/i.test(values)) {
    return "corporate";
  }
  if (/Underwriting/i.test(values)) return "insurance_underwriting";
  if (/InvestmentsSegment|InvestmentIncome/i.test(values)) return "insurance_investments";
  return "operating";
}

/** member localName → 展示标签:去掉尾部 Member,驼峰拆词。 */
function toLabel(member: string): string {
  return member.replace(/Member$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
}

function isOperatingSegmentsContext(f: InstanceFact): boolean {
  for (const [axis, member] of Object.entries(f.dims)) {
    if (axis.includes(CONSOLIDATION_AXIS) && member === OPERATING_SEGMENTS_MEMBER) return true;
  }
  return false;
}

/** 该事实所属分部的键:优先业务分部轴,否则产品/服务轴(承保、投资是挂在后者上的)。 */
function segmentKeyOf(f: InstanceFact): string | null {
  let business: string | null = null;
  let product: string | null = null;
  for (const [axis, member] of Object.entries(f.dims)) {
    if (axis.includes(BUSINESS_SEGMENTS_AXIS)) business = member;
    else if (axis.includes(PRODUCT_AXIS)) product = member;
  }
  return product ?? business;
}

/**
 * 从 instance 提取全部 FY 的分部数据。单份 10-K 带 3 个 FY,多份合并由调用方去重。
 * 只认 ConsolidationItems=OperatingSegments 上下文,只认 350–380 天的 duration。
 */
export function extractSegmentYears(facts: InstanceFact[]): SegmentYear[] {
  const opSegFacts = facts.filter(isOperatingSegmentsContext);
  const ends = Array.from(
    new Set(
      opSegFacts
        .filter((f) => f.start && f.end)
        .filter((f) => {
          const days = (new Date(f.end!).getTime() - new Date(f.start!).getTime()) / 86400000;
          return days >= 350 && days <= 380;
        })
        .map((f) => f.end!),
    ),
  ).sort((a, b) => b.localeCompare(a));

  return ends.map((end) => {
    // ★ 必须排除子分部(Subsegments 轴)。承保分部下面还挂着 GEICO / 再保险集团 / 主要集团
    // 三个子分部,它们与承保合计共用 ProductOrService=Underwriting 维度;不排除的话
    // pickFact 的「取最大绝对值」只是碰巧选中合计,某年子分部超过合计就会静默取错。
    const noSubsegment = (f: InstanceFact) =>
      !Object.keys(f.dims).some((a) => a.includes("Subsegments"));
    const pick = (tag: string, opts: { axisContains?: string; member?: string } = {}) =>
      pickFact(opSegFacts.filter(noSubsegment), { tag, end, fyOnly: true, ...opts });

    // 合计行 = 只带 ConsolidationItems 一个维度的那条。
    const totalOnly = opSegFacts.filter(
      (f) => f.end === end && f.start && Object.keys(f.dims).every((a) => a.includes(CONSOLIDATION_AXIS)),
    );
    const totalOf = (tag: string) => {
      const hits = totalOnly.filter((f) => f.tag === tag);
      if (!hits.length) return null;
      const days = (f: InstanceFact) =>
        (new Date(f.end!).getTime() - new Date(f.start!).getTime()) / 86400000;
      const fy = hits.filter((f) => days(f) >= 350 && days(f) <= 380);
      if (!fy.length) return null;
      return fy.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a)).value;
    };

    // 保险集团合计 = 只带业务分部轴(保险集团)+ConsolidationItems 的那条,不含承保/投资细分。
    const insuranceOnly = opSegFacts.filter(
      (f) =>
        f.end === end &&
        f.start &&
        Object.entries(f.dims).some(
          ([a, m]) => a.includes(BUSINESS_SEGMENTS_AXIS) && /Insurance/i.test(m),
        ) &&
        !Object.keys(f.dims).some((a) => a.includes(PRODUCT_AXIS)),
    );
    const insuranceOf = (tag: string) => {
      const hits = insuranceOnly.filter((f) => f.tag === tag);
      return hits.length ? hits.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a)).value : null;
    };

    // 逐分部明细
    const bySegment = new Map<string, SegmentPeriod>();
    for (const f of opSegFacts) {
      if (f.end !== end || !f.start) continue;
      if (f.tag !== SEGMENT_PRETAX_TAG && f.tag !== SEGMENT_TAX_TAG) continue;
      const days = (new Date(f.end).getTime() - new Date(f.start).getTime()) / 86400000;
      if (days < 350 || days > 380) continue;
      const key = segmentKeyOf(f);
      if (!key) continue;
      const existing = bySegment.get(key) ?? {
        period_end: end,
        segment_member: key,
        segment_label: toLabel(key),
        kind: classifySegment(f.dims),
        pretax_income: null,
        income_tax: null,
      };
      if (f.tag === SEGMENT_PRETAX_TAG) {
        existing.pretax_income =
          existing.pretax_income == null || Math.abs(f.value) > Math.abs(existing.pretax_income)
            ? f.value
            : existing.pretax_income;
      } else {
        existing.income_tax =
          existing.income_tax == null || Math.abs(f.value) > Math.abs(existing.income_tax)
            ? f.value
            : existing.income_tax;
      }
      bySegment.set(key, existing);
    }

    return {
      period_end: end,
      total_pretax: totalOf(SEGMENT_PRETAX_TAG),
      total_tax: totalOf(SEGMENT_TAX_TAG),
      insurance_pretax: insuranceOf(SEGMENT_PRETAX_TAG),
      insurance_tax: insuranceOf(SEGMENT_TAX_TAG),
      underwriting_pretax: pick(SEGMENT_PRETAX_TAG, { axisContains: PRODUCT_AXIS, member: "UnderwritingMember" }),
      investments_pretax: pick(SEGMENT_PRETAX_TAG, { axisContains: PRODUCT_AXIS, member: "InvestmentsSegmentMember" }),
      segments: Array.from(bySegment.values()),
    };
  });
}
