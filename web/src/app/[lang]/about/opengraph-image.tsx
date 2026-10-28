import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";

export const alt = "About Compounder";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// 静态缓存:否则 [lang] 段下的 OG 图每次被抓取都在函数里重绘 PNG(计入 Vercel Fluid Active CPU)。
export const dynamic = "force-static";
export const revalidate = 604800;

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const isEn = lang !== "zh";
  return ogCard({
    lang: isEn ? "en" : "zh",
    eyebrow: "Compounder",
    title: isEn ? "About Compounder" : "关于 Compounder",
    subtitle: isEn
      ? "Superinvestor holdings and valuations. Research, not stock picks."
      : "超级投资者持仓与个股估值。只做研究，不荐股。",
  });
}
