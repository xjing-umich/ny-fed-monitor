import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";

export const alt = "Compounder — Learn";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const isEn = lang !== "zh";
  return ogCard({
    eyebrow: "Compounder",
    title: isEn ? "Learn" : "学习",
    subtitle: isEn
      ? "Plain guides to 13F filings & value investing"
      : "13F 申报与价值投资的大白话指南",
  });
}
