import React from "react";

/** 解读条: 纸白底 + 钞票绿左边框。text 为 null 时不渲染。 */
export function AggregateBlurb({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="mb-6 border-l-[3px] border-[var(--tt-accent)] bg-[var(--tt-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--tt-text)]">
      {text}
    </p>
  );
}
