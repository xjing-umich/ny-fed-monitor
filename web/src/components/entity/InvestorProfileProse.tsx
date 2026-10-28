import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { stockPath } from "@/lib/urls";
import type { ProseParagraph } from "@/lib/managers/profileProse";
import { stockDisplayName } from "@/lib/stocks/zhNames";
import { zhJoin } from "@/lib/format";

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
        <h2 className="text-lg font-semibold tracking-tight text-[var(--tt-text)]">
          {heading}
        </h2>
      </div>
      <div className="max-w-3xl space-y-3">
        {paragraphs.map((p, i) => {
          const texts = p.map((seg) =>
            typeof seg === "string" ? seg : stockDisplayName(lang, cusipToTicker.get(seg.cusip) ?? "", seg.label),
          );
          // 中文:股票名两侧的模板空格,遇到中文名时去掉("第一大持仓为苹果 Apple Inc")。
          const shown = lang === "zh" ? zhJoin(texts) : texts;
          return (
            <p key={i} className="text-base leading-relaxed text-[var(--tt-muted)]">
              {p.map((seg, j) =>
                typeof seg === "string" ? (
                  <React.Fragment key={j}>{shown[j]}</React.Fragment>
                ) : (
                  <Link
                    key={j}
                    href={stockPath(lang, cusipToTicker.get(seg.cusip) ?? seg.cusip)}
                    className="text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]"
                  >
                    {shown[j]}
                  </Link>
                ),
              )}
            </p>
          );
        })}
      </div>
    </section>
  );
}
