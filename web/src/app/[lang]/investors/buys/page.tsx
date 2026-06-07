import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { MovesPage, notFoundIfBadLang } from "../_movesPage";

export const revalidate = 86400;
export function generateStaticParams() { return [{ lang: "zh" }, { lang: "en" }]; }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return lang === "zh"
    ? { title: "本季最多人买 · 超级投资者 — Compounder · 复利", description: "本季被最多顶级投资者新建仓或加仓的股票（13F）。" }
    : { title: "Top buys · Superinvestors — Compounder", description: "Stocks most superinvestors opened or added this quarter (13F)." };
}

export default async function BuysPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  notFoundIfBadLang(lang);
  return <MovesPage lang={lang as Lang} side="buy" />;
}
