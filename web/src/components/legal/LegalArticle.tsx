import React from "react";
import { date as formatDate } from "@/lib/i18n/format";
import type { Lang } from "@/lib/nav";
import { getLegalDoc, LAST_UPDATED, type LegalSlug } from "@/lib/legal";
import ProseDoc from "./ProseDoc";

interface LegalArticleProps {
  slug: LegalSlug;
  lang: Lang;
}

// Thin wrapper: pulls the legal doc from legal.ts and renders it via the shared
// ProseDoc layout (also used by the About page).
export default function LegalArticle({ slug, lang }: LegalArticleProps) {
  const doc = getLegalDoc(slug, lang);
  const updatedLabel = lang === "zh" ? "最后更新" : "Last updated";
  const eyebrow = lang === "zh" ? "法律条款" : "Legal";
  return <ProseDoc doc={doc} eyebrow={eyebrow} updated={formatDate(LAST_UPDATED[slug], lang)} updatedLabel={updatedLabel} />;
}
