import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";

export const alt = "About Compounder";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const isEn = lang !== "zh";
  return ogCard({
    eyebrow: "Compounder",
    title: isEn ? "About Compounder" : "关于 Compounder",
    subtitle: isEn
      ? "Smart-money holdings, valuation & macro — editorial, not advice"
      : "超级投资者持仓、估值与宏观 — 编辑视角，不构成建议",
  });
}
