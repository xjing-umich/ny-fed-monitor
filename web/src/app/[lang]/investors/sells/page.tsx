import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { MovesPage, notFoundIfBadLang } from "../_movesPage";

export const revalidate = 86400;
export function generateStaticParams() { return [{ lang: "zh" }, { lang: "en" }]; }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return lang === "zh"
    ? { title: "本季最多人卖 · 超级投资者 — Compounder · 复利", description: "本季被最多顶级投资者清仓或减仓的股票（13F）。" }
    : { title: "Top sells · Superinvestors — Compounder", description: "Stocks most superinvestors exited or trimmed this quarter (13F)." };
}

export default async function SellsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  notFoundIfBadLang(lang);
  return <MovesPage lang={lang as Lang} side="sell" />;
}
