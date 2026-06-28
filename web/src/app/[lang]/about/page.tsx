import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { getAboutDoc } from "@/lib/about";
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
  const alternates = {
    canonical: `/${lang}/about`,
    languages: { en: "/en/about", "zh-CN": "/zh/about", "x-default": "/en/about" },
  };
  return { title: `${doc.title} — Compounder`, description: doc.intro, alternates };
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
