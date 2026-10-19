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
  const doc = getAboutDoc(lang);
  const alternates = altFor(lang, "/about");
  const title = `${doc.title} — Compounder`;
  return {
    title,
    description: doc.intro,
    alternates,
    // 本路由自带 opengraph-image,不带品牌卡图以免盖掉它。
    ...ogFor({ lang, title, description: doc.intro, path: localePath(lang, "/about"), brandImage: false }),
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
