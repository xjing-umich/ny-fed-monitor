import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { getLegalDoc } from "@/lib/legal";
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
  return { title: `${doc.title} — Compounder`, description: doc.intro };
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
