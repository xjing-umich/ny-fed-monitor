import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";
import { getManagerDetail } from "@/lib/managers/source";
import { managerLabel } from "@/lib/managers/displayName";
import { displayFundName } from "@/lib/managers/profileProse";

export async function generateImageMetadata({ params }: { params: { lang: string; slug: string } }) {
  const lang = params.lang === "zh" ? "zh" : "en";
  const detail = await getManagerDetail(params.slug);
  const person = detail ? managerLabel(lang, params.slug, detail.manager.person) : params.slug;
  const alt = lang === "zh" ? `${person}的 13F 持仓 — Compounder · 复利` : `${person}'s 13F holdings — Compounder`;
  return [{ id: "default", alt, size: OG_SIZE, contentType: OG_CONTENT_TYPE }];
}
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// 静态缓存:否则 [lang] 段下的 OG 图每次被抓取都在函数里重绘 PNG(计入 Vercel Fluid Active CPU)。
export const dynamic = "force-static";
export const revalidate = 604800;

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const isEn = lang !== "zh";

  const d = await getManagerDetail(slug);
  const person = d ? managerLabel(isEn ? "en" : "zh", slug, d.manager.person) : slug;
  const fund = d ? displayFundName(d.manager.name) : "";

  return ogCard({
    lang: isEn ? "en" : "zh",
    eyebrow: isEn ? "Superinvestor" : "超级投资者",
    title: isEn ? `${person}'s 13F holdings` : `${person} 的 13F 持仓`,
    subtitle: fund || undefined,
  });
}
