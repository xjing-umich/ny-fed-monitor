import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ResearchPanel } from "@/components/research/ResearchPanel";
import { altFor } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; ticker: string }>;
}): Promise<Metadata> {
  const { lang: rawLang, ticker } = await params;
  const lang = rawLang === "zh" ? "zh" : "en";
  const upperTicker = ticker.toUpperCase();
  return {
    title:
      lang === "zh"
        ? `${upperTicker} — 数据约束研究面板 — Compounder · 复利`
        : `${upperTicker} — Data-Grounded Research Panel — Compounder`,
    description:
      lang === "zh"
        ? `查看 ${upperTicker} 的数据质量、基本面、成长能力和证据约束风险信号。`
        : `View data confidence, fundamental quality, growth capacity, and evidence-bound risk signals for ${upperTicker}.`,
    alternates: altFor(lang, `/research/${upperTicker}`),
  };
}

export default async function ResearchTickerPage({
  params,
}: {
  params: Promise<{ lang: string; ticker: string }>;
}) {
  const { lang: rawLang, ticker } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  return <ResearchPanel ticker={ticker.toUpperCase()} />;
}
