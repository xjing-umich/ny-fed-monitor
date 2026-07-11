import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { stockPath } from "@/lib/urls";
import type { ProseParagraph } from "@/lib/managers/profileProse";

/**
 * 投资人页的确定性服务端正文(纯 SSR, 零 client JS)。每段由真实 13F 数字派生、彼此独一无二,
 * 是该页的 SEO 正文支柱(SEO_INDEXING_PLAN 任务 1)。stock 段内链到个股页(cusip→ticker 复用页面已算的 map)。
 * paragraphs 空 → null(整块不渲染)。
 */
export function InvestorProfileProse({
  paragraphs,
  lang,
  cusipToTicker,
}: {
  paragraphs: ProseParagraph[];
  lang: Lang;
  cusipToTicker: Map<string, string>;
}): React.ReactElement | null {
  if (paragraphs.length === 0) return null;
  const heading = lang === "zh" ? "组合速览" : "Portfolio overview";
  return (
    <section>
      <div className="pb-3">
        <span className="text-lg font-medium tracking-tight text-[var(--tt-text)]">
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
                  href={stockPath(lang, cusipToTicker.get(seg.cusip) ?? seg.cusip)}
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
