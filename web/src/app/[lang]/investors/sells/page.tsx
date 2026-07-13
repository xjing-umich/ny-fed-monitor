import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { MovesPage, notFoundIfBadLang } from "../_movesPage";
import { altFor } from "@/lib/seo";

export const revalidate = 86400;
export function generateStaticParams() { return [{ lang: "zh" }, { lang: "en" }]; }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const alternates = altFor(lang, "/investors/sells");
  return lang === "zh"
    ? { title: "最多人卖 · 超级投资者 — Compounder · 复利", description: "按最新可比 13F 申报季，被最多顶级投资者清仓或减仓的股票。", alternates }
    : { title: "Top sells · Superinvestors — Compounder", description: "Stocks most superinvestors exited or trimmed in the latest comparable 13F quarter.", alternates };
}

export default async function SellsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  notFoundIfBadLang(lang);
  return <MovesPage lang={lang as Lang} side="sell" />;
}
