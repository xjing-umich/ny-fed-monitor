import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { ScreenerPage, screenerMetadata } from "./_screenerPage";

// 默认组合(全部可估值 + 按安全边际)。其余视图/排序见 [variant]/page.tsx。
export const revalidate = 259200; // 列表页 3 天,见 app/[lang]/page.tsx 注释

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return screenerMetadata(lang === "en" ? "en" : "zh");
}

export default async function ScreenerDefaultPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  return <ScreenerPage lang={rawLang as Lang} view="all" sort="margin" />;
}
