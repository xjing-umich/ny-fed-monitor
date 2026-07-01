import { FreshnessDot } from "./FreshnessDot";
import type { FreshnessStatus } from "@/lib/freshness/derive";

type Lang = "zh" | "en";

// asOf = 数据截止日(13F 为报告期季末);filed = 递交 SEC 的日期。两者语义不同,勿混。
export type Source = { name: string; asOf: string; filed?: string; status?: FreshnessStatus };

export type SourceFooterProps = {
  lang: Lang;
  sources: Source[];
};

export function SourceFooter({ lang, sources }: SourceFooterProps) {
  if (!sources.length) return null;

  const heading = lang === "zh" ? "数据来源" : "Sources";
  const asOfLabel = lang === "zh" ? "截至" : "as of";
  const filedLabel = lang === "zh" ? "提交" : "filed";

  return (
    <div className="border-t border-[var(--tt-border)] pt-3">
      <p className="text-xs italic text-[var(--tt-muted)]">
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
            <span className="not-italic font-medium text-[var(--tt-text)]">
              {src.name}
            </span>{" "}
            {asOfLabel} {src.asOf}
            {src.filed ? (
              <span className="text-[var(--tt-faint)]">
                {" "}
                · {lang === "zh" ? `${src.filed} ${filedLabel}` : `${filedLabel} ${src.filed}`}
              </span>
            ) : null}
          </span>
        ))}
      </p>
    </div>
  );
}
