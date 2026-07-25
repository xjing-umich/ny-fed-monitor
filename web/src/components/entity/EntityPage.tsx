import React from "react";
import { VerdictChip } from "./VerdictChip";
import { KeyFacts, type KeyFact } from "./KeyFacts";
import { SourceFooter } from "./SourceFooter";
import type { Source } from "./SourceFooter";
import { RelatedLinks, type RelatedItem } from "./RelatedLinks";

// Re-export shared types so consumers can import from one place
export type { KeyFact } from "./KeyFacts";
export type { RelatedItem } from "./RelatedLinks";
export type { Source } from "./SourceFooter";
export type { Tone } from "./types";

import type { Tone } from "./types";

export type EntityPageProps = {
  lang: "zh" | "en";
  title: string;
  /** Optional green mono eyebrow above the title (e.g. "SUPERINVESTOR · SEC 13F"). */
  eyebrow?: string;
  /** Mono label beside the H1 (e.g. stock ticker) — same baseline, not the display face. */
  titleMeta?: string;
  subtitle: string;
  verdict?: { label: string; tone: Tone };
  /** 可选：紧跟主 verdict 徽章之后并列渲染的第二枚徽章(如反向 DCF 隐含预期档位)。不替换主徽章。 */
  verdictExtra?: { label: string; tone: Tone };
  keyFacts: KeyFact[];
  /** 顶部醒目提示(如数据陈旧告示), 紧跟标题之下渲染 */
  notice?: React.ReactNode;
  /** Optional page-level action rendered above the title, e.g. a back link. */
  topAction?: React.ReactNode;
  children: React.ReactNode;
  sources: Source[];
  related?: RelatedItem[];
  /** Optional compliance/disclaimer line shown under Sources (not in the masthead). */
  disclaimer?: string;
  /** 可选：标题行右侧操作（如分享按钮）。 */
  headerAction?: React.ReactNode;
  /** 可选：页面正文最底部的行动号召（如文末订阅卡片）。 */
  footerCta?: React.ReactNode;
};

export function EntityPage({
  lang,
  title,
  eyebrow,
  titleMeta,
  subtitle,
  verdict,
  verdictExtra,
  keyFacts,
  notice,
  topAction,
  children,
  sources,
  related,
  disclaimer,
  headerAction,
  footerCta,
}: EntityPageProps): React.ReactElement {
  return (
    <div className="space-y-7">
      {topAction}

      {/* ① Masthead — eyebrow, serif headline, verdict, standfirst, hairline rule */}
      <header className="space-y-3 pb-1">
        {eyebrow && (
          <p className="tt-eyebrow">{eyebrow}</p>
        )}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="text-balance font-display text-3xl sm:text-4xl font-medium leading-[1.1] tracking-tight text-[var(--tt-text)]">
            {title}
          </h1>
          {titleMeta && (
            <span className="font-mono text-lg uppercase tracking-[0.06em] text-[var(--tt-muted)] sm:text-xl">
              {titleMeta}
            </span>
          )}
          {verdict && <VerdictChip label={verdict.label} tone={verdict.tone} />}
          {verdictExtra && <VerdictChip label={verdictExtra.label} tone={verdictExtra.tone} />}
          {headerAction && <div className="ml-auto self-center">{headerAction}</div>}
        </div>
        <p className="max-w-3xl text-[15px] leading-relaxed text-[var(--tt-muted)]">
          {subtitle}
        </p>
      </header>

      {/* 数据陈旧告示(若有) */}
      {notice}

      {/* ② Key facts — 仅底边一条 hairline，避免与下一节 SectionHeading 叠成双线 */}
      {keyFacts.length > 0 && (
        <div className="border-b border-[var(--tt-border)] py-4">
          <KeyFacts facts={keyFacts} />
        </div>
      )}

      {/* ④ Data body (tables / charts passed as children) */}
      <div className="space-y-6 sm:space-y-7">{children}</div>

      {/* ⑤ Source footer + optional compliance line (kept out of masthead to free the standfirst) */}
      <SourceFooter lang={lang} sources={sources} />
      {disclaimer && (
        <p className="-mt-4 max-w-3xl text-xs leading-relaxed text-[var(--tt-muted)]">
          {disclaimer}
        </p>
      )}

      {/* ⑥ Related links */}
      <RelatedLinks lang={lang} items={related} />

      {/* ⑦ 文末行动号召(可选,如文末订阅卡片) */}
      {footerCta}
    </div>
  );
}
