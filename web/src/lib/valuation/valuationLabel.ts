import type { Lang } from "@/lib/nav";
import type { VerdictBucket } from "@/lib/valuation/deriveValuationVerdict";

// 估值位置的唯一说法源(spec 2026-10-23 §三.2):个股页标题徽章、投资人页持仓表、筛选器、首页卡片都经这里。
// bucket "below" = 价格低于内在价值中枢(deriveValuationVerdict:price < IV),故称“低于内在价值”,不称“低于价值带”。
// 便宜档(击球区/低于内在价值)reliable=false → pending(待确认):照实标位置,但不进任何击球区/低估计数。
export type ValuationTier = "strike" | "below" | "within" | "above" | "unassessed";
export type ValuationLabel = {
  tier: ValuationTier;
  label: string;
  pending: boolean;
  title: string | null;
  tone: "positive" | "neutral" | "warn";
};
export type VerdictLike =
  | { bucket: VerdictBucket; inStrikeZone: boolean; reliable: boolean; coverage?: "full" | "single_lamp" }
  | null
  | undefined;

export const PENDING_WORD: Record<Lang, string> = { zh: "待确认", en: "pending" };

// 价值带与内在价值同列时的说明(筛选器脚注、首页击球区卡片共用):IV 可能低于带下沿(WB、AGO)。
export const BAND_FLOOR_NOTE: Record<Lang, string> = {
  zh: "价值带下沿是零增长价值；内在价值含增长假设，个别公司会低于下沿。",
  en: "The band's lower edge is the zero-growth value; intrinsic value includes growth assumptions and can sit below it for some companies.",
};

const COPY = {
  zh: {
    strike: "击球区", below: "低于内在价值", within: "价值带内", above: "高于价值带", unassessed: "未评估",
    pendingWhy: "估值带红旗（盈利下滑 / 高杠杆 / 模型不稳 / 每股口径疑错），安全边际不可信，未计入击球区与低估计数。",
    unassessedWhy: "暂无可用估值：缺少可用财报、这类公司不适用本估值方法，或数据未通过核验。",
    singleLamp: "单法口径（无所有者盈利 DCF）",
  },
  en: {
    strike: "Strike zone", below: "Below intrinsic value", within: "Within band", above: "Above band", unassessed: "Not assessed",
    pendingWhy: "Valuation flagged (declining earnings / high leverage / model instability / per-share doubt); the margin isn't trustworthy and isn't counted as cheap.",
    unassessedWhy: "No valuation yet: usable filings are missing, the method doesn't apply to this kind of company, or the data failed our checks.",
    singleLamp: "Single-method basis (no owner-earnings DCF)",
  },
} as const;

export function valuationLabel(v: VerdictLike, lang: Lang): ValuationLabel {
  const t = COPY[lang];
  if (!v) return { tier: "unassessed", label: t.unassessed, pending: false, title: t.unassessedWhy, tone: "neutral" };
  const lampTitle = v.coverage === "single_lamp" ? t.singleLamp : null;
  const cheap = v.inStrikeZone || v.bucket === "below";
  if (cheap) {
    const tier: ValuationTier = v.inStrikeZone ? "strike" : "below";
    const pending = v.reliable === false;
    return {
      tier,
      label: tier === "strike" ? t.strike : t.below,
      pending,
      title: pending ? t.pendingWhy : lampTitle,
      tone: pending ? "neutral" : "positive",
    };
  }
  if (v.bucket === "within") return { tier: "within", label: t.within, pending: false, title: lampTitle, tone: "neutral" };
  return { tier: "above", label: t.above, pending: false, title: lampTitle, tone: "warn" };
}
