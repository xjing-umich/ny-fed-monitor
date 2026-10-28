import React from "react";

/** 解读条: 凹陷底色,不用彩色左边框。text 为 null 时不渲染。 */
export function AggregateBlurb({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="mb-6 rounded-md bg-[var(--tt-panel-2)] px-4 py-3 text-sm leading-relaxed text-[var(--tt-text)]">
      {text}
    </p>
  );
}
