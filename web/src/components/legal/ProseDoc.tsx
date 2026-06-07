import React from "react";
import type { LegalDoc } from "@/lib/legal";

interface ProseDocProps {
  doc: LegalDoc;
  /** Optional "Last updated" date line shown under the title. */
  updated?: string;
  updatedLabel?: string;
}

// Shared prose layout for the legal pages and the About page. Pure presentation —
// content (title / intro / sections) is supplied by the caller, so the pages stay
// one-liners.
export default function ProseDoc({ doc, updated, updatedLabel }: ProseDocProps) {
  return (
    <article className="max-w-[720px] mx-auto py-4">
      <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--tt-text)]">
        {doc.title}
      </h1>
      {updated && (
        <p className="mt-1 text-xs text-[var(--tt-faint)]">
          {updatedLabel}: {updated}
        </p>
      )}

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
