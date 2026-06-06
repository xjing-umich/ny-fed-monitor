import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import type { Lang } from "@/lib/nav";
import { InvestorListClient } from "./InvestorListClient";
import SubNav from "@/components/shell/SubNav";

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
  return lang === "zh"
    ? {
        title: "超级投资者 — Compounder · 复利",
        description: "追踪顶级基金经理的 SEC 13F 季度持仓披露，了解聪明钱在买什么。",
      }
    : {
        title: "Superinvestors — Compounder · 复利",
        description: "Track top fund managers' quarterly SEC 13F disclosures to see what smart money is buying.",
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

  const idx = await getManagerIndex();
  const managers = [...idx.managers].sort((a, b) => b.totalValue - a.totalValue);

  return (
    <>
      <SubNav lang={lang} section="investors" active="all" />
      <InvestorListClient lang={lang} managers={managers} />
    </>
  );
}
