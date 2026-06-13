import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { ProseParagraph } from "@/lib/stocks/stockProse";

/**
 * 个股页确定性服务端正文(纯 SSR, 零 client JS)。每段由真实 13F 持有人数据派生、彼此独一无二,
 * 是该页相对通用财经站的差异化 + SEO 正文支柱(SEO_INDEXING_PLAN 任务 2)。内链指向投资人页(href 已在 builder 解析好)。
 * paragraphs 空 → null。
 */
export function StockProse({
  paragraphs,
  lang,
}: {
  paragraphs: ProseParagraph[];
  lang: Lang;
}): React.ReactElement | null {
  if (paragraphs.length === 0) return null;
  const heading = lang === "zh" ? "持有概览" : "Ownership overview";
  return (
    <section>
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {heading}
        </span>
      </div>
      <div className="max-w-3xl space-y-3">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-[15px] leading-relaxed text-[var(--tt-muted)]">
            {p.map((seg, j) =>
              typeof seg === "string" ? (
                <React.Fragment key={j}>{seg}</React.Fragment>
              ) : (
                <Link
                  key={j}
                  href={seg.href}
                  className="text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]"
                >
                  {seg.label}
                </Link>
              ),
            )}
          </p>
        ))}
      </div>
    </section>
  );
}
