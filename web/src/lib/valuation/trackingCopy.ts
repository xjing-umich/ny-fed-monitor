import { pctDelta } from "../i18n/format";
import type { Lang } from "../nav";
import type { ChangeKind, TrackingComparison } from "./trackingComparison";
import { PENDING_WORD, valuationLabel } from "./valuationLabel";

const COPY: Record<Lang, Record<Exclude<ChangeKind, "unavailable">, string>> = {
  zh: {
    no_change: "与基准相比暂无可确认变化。",
    price_only: "价格变化，估值参照未变。",
    fundamentals: "财务数据已更新，估值结果已调整。",
    assumptions: "估值假设已更新，估值结果已调整。",
    multiple_inputs: "多项估值依据更新。",
    result_updated: "估值结果已更新，具体原因待核实。",
    not_comparable: "证券身份或估值口径已变化，暂不比较变化幅度。",
  },
  en: {
    no_change: "No confirmed change relative to the baseline.",
    price_only: "Price changed; the valuation reference is unchanged.",
    fundamentals: "Financial data was updated and the valuation was revised.",
    assumptions: "Valuation assumptions were updated and the valuation was revised.",
    multiple_inputs: "Multiple valuation inputs were updated.",
    result_updated: "The valuation was updated; the specific cause remains unverified.",
    not_comparable: "Security identity or valuation basis changed; changes are not comparable.",
  },
};

/** Describes evidence categories only; this contract cannot identify a business driver. */
export function trackingChangeText(result: TrackingComparison, lang: Lang): string {
  if (result.kind === "unavailable") {
    const pending = result.reasons.some((reason) => reason === "baseline_pending" || reason === "latest_pending");
    return pending ? lang === "zh" ? `估值${PENDING_WORD.zh}，暂不比较变化。` : `Valuation ${PENDING_WORD.en}; comparison is paused.`
      : lang === "zh" ? "暂不可评估，保留原始基准。" : `${valuationLabel(null, lang).label}; the original baseline is retained.`;
  }
  let text = COPY[lang][result.kind];
  if (!result.comparable || result.kind === "no_change") return text;
  if (result.kind === "price_only" && result.marginChangePp !== null && Number.isFinite(result.marginChangePp)) {
    const delta = pctDelta(result.marginChangePp / 100).replace(/%$/, "");
    if (delta !== "0") text += lang === "zh" ? `安全边际变化 ${delta} 个百分点。` : ` Margin changed by ${delta} percentage points.`;
  }
  if (result.zoneChange) {
    const zone = valuationLabel({ bucket: "below", reliable: true, inStrikeZone: true }, lang).label;
    text += lang === "zh" ? `相对基准${result.zoneChange === "entered" ? "进入" : "离开"}${zone}。`
      : ` ${result.zoneChange === "entered" ? "Entered" : "Left"} the ${zone.toLowerCase()} relative to the baseline.`;
  }
  return text;
}
