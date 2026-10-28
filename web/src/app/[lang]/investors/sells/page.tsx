import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { MovesPage, notFoundIfBadLang } from "../_movesPage";
import { altFor, ogFor } from "@/lib/seo";
import { localePath } from "@/lib/urls";

export const revalidate = 259200; // 列表页 3 天,见 app/[lang]/page.tsx 注释
export function generateStaticParams() { return [{ lang: "zh" }, { lang: "en" }]; }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const alternates = altFor(lang, "/investors/sells");
  const meta = lang === "zh"
    ? { title: "最多人卖 · 超级投资者 — Compounder · 复利", description: "按最新可比 13F 申报季，被最多超级投资者清仓或减持的股票。" }
    : { title: "Top sells · Superinvestors — Compounder", description: "Stocks most superinvestors exited or trimmed in the latest comparable 13F quarter." };
  return {
    ...meta,
    alternates,
    // 本路由自带 opengraph-image,不带品牌卡图以免盖掉它。
    ...ogFor({ lang, title: meta.title, description: meta.description, path: localePath(lang, "/investors/sells"), brandImage: false }),
  };
}

export default async function SellsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  notFoundIfBadLang(lang);
  return <MovesPage lang={lang as Lang} side="sell" />;
}
