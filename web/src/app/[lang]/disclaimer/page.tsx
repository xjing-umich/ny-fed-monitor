import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { getLegalDoc } from "@/lib/legal";
import { altFor, ogFor, titleBrand } from "@/lib/seo";
import { localePath } from "@/lib/urls";
import LegalArticle from "@/components/legal/LegalArticle";

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
  const doc = getLegalDoc("disclaimer", lang);
  const title = `${doc.title} — ${titleBrand(lang)}`;
  return {
    title,
    description: doc.intro,
    alternates: altFor(lang, "/disclaimer"),
    ...ogFor({ lang, title, description: doc.intro, path: localePath(lang, "/disclaimer") }),
  };
}

export default async function DisclaimerPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  return <LegalArticle slug="disclaimer" lang={lang} />;
}
