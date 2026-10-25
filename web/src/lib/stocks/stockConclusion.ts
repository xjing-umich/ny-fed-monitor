import type { Lang } from "@/lib/nav";

// 个股页“先结论后证据”的展示决策(spec 2026-10-25 §三.1–三.2)。纯函数,页面只按结果渲染。

export type ConclusionLeftState =
  | "card" | "holdcoSotp" | "unassessed" | "splitPaused"
  | "holdcoNotAssessable" | "moatDistorted" | "fundamentalsSuspect";

/** 结论带左栏显示什么。优先级与原估值区块的分支顺序一致。 */
export function conclusionLeftState(input: {
  hasFloor: boolean;
  splitCoverageStale: boolean;
  holdcoNotAssessable: boolean;
  hasHoldcoSotp: boolean;
  capitalStructureDistorted: boolean;
  fundamentalsCorrupt: boolean;
}): ConclusionLeftState {
  if (!input.hasFloor) return "unassessed";
  if (input.splitCoverageStale) return "splitPaused";
  if (input.holdcoNotAssessable) return input.hasHoldcoSotp ? "holdcoSotp" : "holdcoNotAssessable";
  if (input.capitalStructureDistorted) return "moatDistorted";
  if (input.fundamentalsCorrupt) return "fundamentalsSuspect";
  return "card";
}

export type StockAnchor = { id: "holders" | "valuation" | "quality" | "co-owned" | "sources"; label: string };

const ANCHOR_LABEL: Record<Lang, Record<StockAnchor["id"], string>> = {
  zh: { holders: "持有人", valuation: "估值与方法", quality: "生意质量", "co-owned": "共同持有", sources: "来源" },
  en: { holders: "Holders", valuation: "Valuation", quality: "Business quality", "co-owned": "Co-owned", sources: "Sources" },
};

/** 页内锚点:持有人与来源总在;估值 / 生意质量 / 共同持有有数据才出现。 */
export function stockAnchors(has: { valuation: boolean; quality: boolean; coOwned: boolean }, lang: Lang): StockAnchor[] {
  const ids: StockAnchor["id"][] = ["holders"];
  if (has.valuation) ids.push("valuation");
  if (has.quality) ids.push("quality");
  if (has.coOwned) ids.push("co-owned");
  ids.push("sources");
  return ids.map((id) => ({ id, label: ANCHOR_LABEL[lang][id] }));
}

export function holdersLine(n: number, total: string, lang: Lang): string {
  return lang === "zh" ? `${n} 位持有 · 合计 ${total}` : `${n} holder${n === 1 ? "" : "s"} · ${total} combined`;
}

export const BAND_COPY: Record<Lang, { left: string; right: string; anchorsAria: string }> = {
  zh: { left: "价格相对价值带", right: "谁在持有", anchorsAria: "本页目录" },
  en: { left: "Price vs. value band", right: "Who holds it", anchorsAria: "On this page" },
};
