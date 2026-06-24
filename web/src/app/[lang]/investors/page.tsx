import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getManagerIndex, getManagerQoQ } from "@/lib/managers/source";
import type { Lang } from "@/lib/nav";
import { InvestorListClient } from "./InvestorListClient";
import SubNav from "@/components/shell/SubNav";
import { ogFor } from "@/lib/seo";

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
  const alternates = {
    canonical: `/${lang}/investors`,
    languages: { en: "/en/investors", "zh-CN": "/zh/investors", "x-default": "/en/investors" },
  };
  const title =
    lang === "zh"
      ? "超级投资者 — Compounder · 复利"
      : "Superinvestors — Compounder";
  const description =
    lang === "zh"
      ? "追踪顶级基金经理的 SEC 13F 季度持仓披露，了解聪明钱在买什么。"
      : "Track top fund managers' quarterly SEC 13F disclosures to see what smart money is buying.";
  return {
    title,
    description,
    alternates,
    ...ogFor({ lang, title, description, path: `/${lang}/investors` }),
  };
}

export default async function InvestorsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") {
    notFound();
  }
  const lang = rawLang as Lang;

  const [idx, qoq] = await Promise.all([getManagerIndex(), getManagerQoQ()]);
  const managers = [...idx.managers]
    .sort((a, b) => b.totalValue - a.totalValue)
    .map((m) => ({ ...m, qoq: qoq.get(m.cik) }));

  return (
    <>
      <SubNav lang={lang} section="investors" active="all" />
      <InvestorListClient lang={lang} managers={managers} />
    </>
  );
}
