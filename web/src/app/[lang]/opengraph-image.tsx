import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";

// Site-wide default social card. Per-route opengraph-image files override this.
export const alt = "Compounder — superinvestor 13F holdings and valuations";
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
    title: isEn ? "Superinvestor 13F holdings, valued stock by stock" : "超级投资者的 13F 持仓，逐只估值",
    subtitle: isEn ? "Every position they reported, next to a conservative valuation." : "他们上报的每一笔持仓，旁边配一个保守估值。",
  });
}
