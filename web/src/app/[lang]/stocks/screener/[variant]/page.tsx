import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { ScreenerPage, SCREENER_VARIANTS, parseVariant, screenerMetadata } from "../_screenerPage";

// 公开 URL 是 /stocks/screener?view=…&sort=…,由 next.config.ts rewrites 改写到这里(原因见 _screenerPage.tsx)。
export const revalidate = 259200; // 列表页 3 天,见 app/[lang]/page.tsx 注释
export const dynamicParams = false;

export function generateStaticParams() {
  return SCREENER_VARIANTS.map((variant) => ({ variant }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  // canonical 恒指向 /stocks/screener(与改造前 ?view= 形态一致),各组合不单独收录。
  return screenerMetadata(lang === "en" ? "en" : "zh");
}

export default async function ScreenerVariantPage({ params }: { params: Promise<{ lang: string; variant: string }> }) {
  const { lang: rawLang, variant } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const parsed = parseVariant(variant);
  if (!parsed) notFound();
  return <ScreenerPage lang={rawLang as Lang} view={parsed.view} sort={parsed.sort} />;
}
