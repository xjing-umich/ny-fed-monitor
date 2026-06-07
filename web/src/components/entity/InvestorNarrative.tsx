import React from "react";
import type { InvestorNarrativeData } from "@/lib/ai/investorNarrative";

type Lang = "zh" | "en";

const COPY = {
  zh: {
    heading: "本季动作 · AI 解读",
    disclosure: "本段由 AI 依据 SEC 13F 申报自动生成，可能存在错误，不构成投资建议。",
  },
  en: {
    heading: "This Quarter · AI Read",
    disclosure:
      "This section is AI-generated from the SEC 13F filing, may contain errors, and is not investment advice.",
  },
} as const;

export function InvestorNarrative({
  data,
  lang,
}: {
  data: InvestorNarrativeData;
  lang: Lang;
}): React.ReactElement {
  const t = COPY[lang];
  return (
    <section className="rounded-sm border-l-2 border-[var(--tt-accent)] bg-[var(--tt-surface)] px-4 py-4">
      <div className="pb-2">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.heading}
        </span>
      </div>

      <p className="text-[15px] leading-relaxed text-[var(--tt-text)]">{data.judgment_line}</p>

      {data.moves.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {data.moves.map((m, i) => (
            <li key={i} className="text-sm leading-relaxed text-[var(--tt-text)]">
              <span className="font-medium">{m.issuer}</span>
              <span className="ml-1 text-[var(--tt-muted)]">· {m.action}</span>
              {m.why && <span className="text-[var(--tt-muted)]"> — {m.why}</span>}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--tt-faint)]">{t.disclosure}</p>
    </section>
  );
}
