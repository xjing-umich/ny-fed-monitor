import React from "react";
import type { Lang } from "@/lib/nav";
import { getLegalDoc, LAST_UPDATED, type LegalSlug } from "@/lib/legal";

interface LegalArticleProps {
  slug: LegalSlug;
  lang: Lang;
}

// Shared prose layout for the three legal pages. Pure presentation — content
// comes from legal.ts so the pages stay one-liners.
export default function LegalArticle({ slug, lang }: LegalArticleProps) {
  const doc = getLegalDoc(slug, lang);
  const updatedLabel = lang === "zh" ? "最后更新" : "Last updated";

  return (
    <article className="max-w-[720px] mx-auto py-4">
      <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--tt-text)]">
        {doc.title}
      </h1>
      <p className="mt-1 text-xs text-[var(--tt-faint)]">
        {updatedLabel}: {LAST_UPDATED}
      </p>

      <p className="mt-5 text-sm leading-relaxed text-[var(--tt-muted)]">
        {doc.intro}
      </p>

      {doc.sections.map((section, i) => (
        <section key={i} className="mt-7">
          <h2 className="font-display text-base font-medium text-[var(--tt-text)]">
            {section.heading}
          </h2>
          {section.paragraphs.map((p, j) => (
            <p
              key={j}
              className="mt-2 text-sm leading-relaxed text-[var(--tt-muted)]"
            >
              {p}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
