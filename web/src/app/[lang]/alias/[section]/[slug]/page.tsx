import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { resolveEntity } from "@/lib/aliases/resolve";
import { investorPath, stockPath } from "@/lib/urls";
import type { Lang } from "@/lib/nav";

// 非 ASCII slug(如 /zh/investors/段永平、/zh/stocks/苹果)由 next.config 的 beforeFiles rewrite 送到这里。
// 原因:ISR 页面会把解码后的动态段写进 x-next-cache-tags 响应头,Node 拒绝非 ASCII 头值 → 500
// (ERR_INVALID_CHAR)。本页不走 ISR(force-dynamic),只做别名解析:命中 308 到 canonical,否则 404。
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NonAsciiSlugPage({
  params,
}: {
  params: Promise<{ lang: string; section: string; slug: string }>;
}): Promise<never> {
  const { lang: rawLang, section, slug } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  if (section === "investors" || section === "stocks") {
    const type = section === "investors" ? "investor" : "stock";
    const hit = await resolveEntity(type, slug);
    if (hit) permanentRedirect(type === "investor" ? investorPath(lang, hit.canonicalSlug) : stockPath(lang, hit.canonicalSlug));
  }
  // learn 文章 slug 全是 ASCII;其余未命中的中文 slug 一律 404。
  notFound();
}
