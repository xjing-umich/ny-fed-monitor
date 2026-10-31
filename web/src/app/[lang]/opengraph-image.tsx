import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";

// Site-wide default social card. Per-route opengraph-image files override this.
export function generateImageMetadata({ params }: { params: { lang: string } }) {
  return [{ id: "default", alt: params.lang === "zh" ? "Compounder · 复利 — 13F 持仓与个股估值" : "Compounder — superinvestor 13F holdings and valuations", size: OG_SIZE, contentType: OG_CONTENT_TYPE }];
}
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// 静态缓存:否则 [lang] 段下的 OG 图每次被抓取都在函数里重绘 PNG(计入 Vercel Fluid Active CPU)。
export const dynamic = "force-static";
export const revalidate = 604800;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const isEn = lang !== "zh";
  return ogCard({
    lang: isEn ? "en" : "zh",
    title: isEn ? "Superinvestor 13F holdings and stock valuations" : "投资人的 13F 季末持仓与个股估值",
    subtitle: isEn ? "Research reported holdings and valuation assumptions where available." : "查阅 13F 申报持仓；有足够证据时展示估值区间及假设。",
  });
}
