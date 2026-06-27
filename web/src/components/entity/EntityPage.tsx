import React from "react";
import { VerdictChip } from "./VerdictChip";
import { KeyFacts, type KeyFact } from "./KeyFacts";
import { AINarrative } from "./AINarrative";
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
  subtitle: string;
  verdict?: { label: string; tone: Tone };
  keyFacts: KeyFact[];
  /** 顶部醒目提示(如数据陈旧告示), 紧跟标题之下渲染 */
  notice?: React.ReactNode;
  /** Optional page-level action rendered above the title, e.g. a back link. */
  topAction?: React.ReactNode;
  aiPageKey?: string;
  /** 若提供, 用服务端渲染的叙述节点替代客户端 AINarrative(SEO/GEO 可见) */
  aiNarrative?: React.ReactNode;
  children: React.ReactNode;
  sources: Source[];
  related?: RelatedItem[];
  /** Optional compliance/disclaimer line shown under the subtitle. */
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
  subtitle,
  verdict,
  keyFacts,
  notice,
  topAction,
  aiPageKey,
  aiNarrative,
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
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{eyebrow}</p>
        )}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="font-display text-3xl sm:text-4xl font-medium leading-[1.1] tracking-tight text-[var(--tt-text)]">
            {title}
          </h1>
          {verdict && <VerdictChip label={verdict.label} tone={verdict.tone} />}
          {headerAction && <div className="ml-auto self-center">{headerAction}</div>}
        </div>
        <p className="max-w-3xl text-[15px] leading-relaxed text-[var(--tt-muted)]">
          {subtitle}
        </p>
        {disclaimer && (
          <p className="max-w-3xl text-xs leading-relaxed text-[var(--tt-faint)]">
            {disclaimer}
          </p>
        )}
      </header>

      {/* 数据陈旧告示(若有) */}
      {notice}

      {/* ② Key facts — editorial stat row separated by hairlines (no card) */}
      {keyFacts.length > 0 && (
        <div className="border-y border-[var(--tt-border)] py-4">
          <KeyFacts facts={keyFacts} />
        </div>
      )}

      {/* ③ AI narrative — 服务端节点优先(SEO可见), 否则回退客户端 AINarrative(仅当 aiPageKey 显式启用) */}
      {aiNarrative ?? (aiPageKey ? <AINarrative lang={lang} pageKey={aiPageKey} /> : null)}

      {/* ④ Data body (tables / charts passed as children) */}
      <div className="space-y-4">{children}</div>

      {/* ⑤ Source footer */}
      <SourceFooter lang={lang} sources={sources} />

      {/* ⑥ Related links */}
      <RelatedLinks lang={lang} items={related} />

      {/* ⑦ 文末行动号召(可选,如订阅卡片) */}
      {footerCta}
    </div>
  );
}
