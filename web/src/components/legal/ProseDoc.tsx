import React from "react";
import type { LegalDoc } from "@/lib/legal";

interface ProseDocProps {
  doc: LegalDoc;
  /** Optional green-mono eyebrow above the title (editorial masthead rhythm). */
  eyebrow?: string;
  /** Optional "Last updated" date line shown under the title. */
  updated?: string;
  updatedLabel?: string;
  /**
   * Optional per-paragraph renderer. When supplied, intro and every section
   * paragraph pass through it (used by /learn to turn inline entity tokens into
   * internal links). Legal/About omit it and render plain text unchanged.
   */
  renderParagraph?: (text: string) => React.ReactNode;
}

// Shared prose layout for the legal pages and the About page. Pure presentation —
// content (title / intro / sections) is supplied by the caller, so the pages stay
// one-liners. Masthead mirrors PageHeader: green-mono eyebrow → display-slab title →
// mono dateline → hairline rule.
export default function ProseDoc({ doc, eyebrow, updated, updatedLabel, renderParagraph }: ProseDocProps) {
  return (
    <article className="max-w-[720px] mx-auto py-8 sm:py-10">
      <header className="border-b border-[var(--tt-border)] pb-6">
        {eyebrow ? (
          <p className="tt-eyebrow">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-balance font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {doc.title}
        </h1>
        {updated && (
          <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
            {updatedLabel} · {updated}
          </p>
        )}
      </header>

      <p className="mt-6 text-sm leading-relaxed text-[var(--tt-muted)]">
        {renderParagraph ? renderParagraph(doc.intro) : doc.intro}
      </p>

      {doc.sections.map((section, i) => (
        <section key={i} className="mt-7">
          <h2 className="text-lg font-semibold text-[var(--tt-text)]">
            {section.heading}
          </h2>
          {section.paragraphs.map((p, j) => (
            <p
              key={j}
              className="mt-2 text-sm leading-relaxed text-[var(--tt-muted)]"
            >
              {renderParagraph ? renderParagraph(p) : p}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
