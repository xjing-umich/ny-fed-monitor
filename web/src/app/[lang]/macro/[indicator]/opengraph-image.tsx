import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";
import { SECTION_NAME, type IndicatorKey } from "@/lib/macroNames";

export const alt = "Macro / liquidity indicator — Compounder";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string; indicator: string }>;
}) {
  const { lang, indicator } = await params;
  const isEn = lang !== "zh";

  const names = SECTION_NAME[indicator as IndicatorKey];
  const name = names ? names[isEn ? "en" : "zh"] : indicator;

  return ogCard({
    eyebrow: isEn ? "Macro · Liquidity" : "宏观 · 流动性",
    title: name,
    subtitle: isEn
      ? "US Treasury market & funding indicator"
      : "美债市场与资金面指标",
  });
}
