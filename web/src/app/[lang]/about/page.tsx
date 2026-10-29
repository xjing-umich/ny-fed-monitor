import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { getAboutDoc } from "@/lib/about";
import { altFor, ogFor } from "@/lib/seo";
import { localePath } from "@/lib/urls";
import ProseDoc from "@/components/legal/ProseDoc";

export function generateStaticParams() {
  return [{ lang: "zh" }, { lang: "en" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const alternates = altFor(lang, "/about");
  const title = lang === "zh" ? "关于 Compounder · 复利" : "About Compounder";
  const description = lang === "zh"
    ? "Compounder（复利）整理超级投资者的 SEC 13F 持仓与个股估值，说明数据来源、方法与局限。了解本站的研究理念与教育用途。"
    : "Compounder brings together superinvestors' SEC 13F portfolios and stock valuations. Read about our sources, methods and approach to investment education.";
  return {
    title,
    description,
    alternates,
    // 本路由自带 opengraph-image,不带品牌卡图以免盖掉它。
    ...ogFor({ lang, title, description, path: localePath(lang, "/about"), brandImage: false }),
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  return <ProseDoc doc={getAboutDoc(lang)} eyebrow={lang === "zh" ? "关于 · 复利" : "About · Compounder"} />;
}
