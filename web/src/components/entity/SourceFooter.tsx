import { FreshnessDot } from "./FreshnessDot";
import type { FreshnessStatus } from "@/lib/freshness/derive";

type Lang = "zh" | "en";

export type Source = { name: string; asOf: string; status?: FreshnessStatus };

export type SourceFooterProps = {
  lang: Lang;
  sources: Source[];
};

export function SourceFooter({ lang, sources }: SourceFooterProps) {
  if (!sources.length) return null;

  const heading = lang === "zh" ? "数据来源" : "Sources";
  const asOfLabel = lang === "zh" ? "截至" : "as of";

  return (
    <div className="border-t border-border pt-3">
      <p className="text-xs italic text-muted-foreground">
        <span className="not-italic font-medium uppercase tracking-[0.08em] text-[11px] text-[var(--tt-faint)]">
          {heading}
        </span>
        <span className="mx-1.5 text-[var(--tt-faint)]">·</span>
        {sources.map((src, i) => (
          <span key={src.name}>
            {i > 0 && <span className="mx-1.5 text-[var(--tt-faint)]">·</span>}
            {src.status && (
              <>
                <FreshnessDot status={src.status} lang={lang} />{" "}
              </>
            )}
            <span className="not-italic font-medium text-card-foreground">
              {src.name}
            </span>{" "}
            {asOfLabel} {src.asOf}
          </span>
        ))}
      </p>
    </div>
  );
}
