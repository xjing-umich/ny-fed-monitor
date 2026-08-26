import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { ManagerSummary } from "@/lib/managers/types";
import type { HeldRow } from "@/lib/aggregations";
import type { StrikeLeader } from "@/lib/valuation/valuationSnapshot";
import { EntityName } from "@/components/common/EntityName";
import { FreshnessDot } from "@/components/entity/FreshnessDot";
import { filingFreshness } from "@/lib/freshness/derive";
import { formatUSD } from "@/lib/format";
import { investorPath, localePath, stockPath } from "@/lib/urls";
import StrikeLeadersCard from "@/components/home/StrikeLeadersCard";
import ValueBandCard from "@/components/home/ValueBandCard";

const COPY = {
  zh: {
    valuation: {
      eyebrow: "估值",
      title: "只为已被证明的盈利和资产付钱",
      body: "我们用可查的盈利和资产给每一只标的定价，不押注任何你必须相信的成长故事。这是竞品的持仓榜给不了的第二只眼。",
      cta: "看最多机构持有的个股",
    },
    consensus: {
      eyebrow: "跨基金共识",
      title: "多少只重仓落在同一张桌子上",
      body: "同一只票被越多独立经理人重仓，越值得先看一眼。按持有基金数排序。",
      cta: "查看共识持仓",
      holders: "持有基金",
      seeAll: "全部",
    },
    investors: {
      eyebrow: "超级投资者",
      title: "读他们的持仓，不读他们的推文",
      body: "每季度末，13F 逼这些经理公开手里的每一股。我们逐季存档，让你看长期的仓位，而不是当天的噪音。",
      cta: "浏览全部投资者",
    },
  },
  en: {
    valuation: {
      eyebrow: "Valuation",
      title: "Pay only for earnings and assets already proven",
      body: "We value every holding on proven earnings and assets — no growth story you have to believe. It's the second eye a holdings tracker alone can't give you.",
      cta: "See the most-held stocks",
    },
    consensus: {
      eyebrow: "Cross-fund consensus",
      title: "How many managers sit at the same table",
      body: "The more independent managers that hold the same name, the more it's worth a first look. Ranked by funds holding.",
      cta: "See consensus holdings",
      holders: "Funds holding",
      seeAll: "All",
    },
    investors: {
      eyebrow: "Super investors",
      title: "Read their holdings, not their tweets",
      body: "Every quarter-end, a 13F forces these managers to disclose each share they own. We archive it quarter by quarter, so you watch the long position instead of the day's noise.",
      cta: "Browse all investors",
    },
  },
} as const;

/** 一节的文/据两栏布局 — 文案在左,数据在右。不再带序号脚手架(01/02/03)。 */
function Row({
  eyebrow,
  title,
  body,
  ctaLabel,
  href,
  children,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  ctaLabel: string;
  href: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-6 border-t border-[var(--tt-border)] pt-10 first:border-0 first:pt-0 md:grid-cols-[0.4fr_0.6fr] md:gap-10">
      <div>
        <p className="tt-eyebrow">{eyebrow}</p>
        <h2 className="mt-3 text-balance text-2xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-3xl">
          {title}
        </h2>
        {body ? <p className="mt-4 max-w-[44ch] text-sm leading-relaxed text-[var(--tt-muted)]">{body}</p> : null}
        <Link
          href={href}
          className="mt-5 inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
        >
          {ctaLabel}
        </Link>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function StepIndex({
  lang,
  investors,
  held,
  strike,
}: {
  lang: Lang;
  investors: ManagerSummary[];
  held: HeldRow[];
  strike: { total: number; leaders: StrikeLeader[] };
}): React.ReactElement {
  const c = COPY[lang];
  const now = new Date();
  const consensusHref = localePath(lang, "/investors/consensus");

  return (
    <div className="space-y-10">
      {/* 估值上提为第一节 — 我们独有、竞品持仓榜没有的第二只眼。 */}
      <Row
        eyebrow={c.valuation.eyebrow}
        title={c.valuation.title}
        body={c.valuation.body}
        ctaLabel={c.valuation.cta}
        href={localePath(lang, "/stocks")}
      >
        {strike.leaders.length > 0 ? (
          <StrikeLeadersCard lang={lang} leaders={strike.leaders} total={strike.total} />
        ) : (
          <ValueBandCard lang={lang} />
        )}
      </Row>

      {/* 跨基金共识 — 表包进刻度面板,与估值面板同一套仪表盘语言。 */}
      <Row
        eyebrow={c.consensus.eyebrow}
        title={c.consensus.title}
        body={c.consensus.body}
        ctaLabel={c.consensus.cta}
        href={consensusHref}
      >
        <div className="ticks rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-4 sm:p-5">
          <div className="flex items-baseline justify-between border-b border-[var(--tt-border-strong)] pb-2">
            <span className="text-sm font-medium text-[var(--tt-text)]">{c.consensus.holders}</span>
            <Link
              href={consensusHref}
              className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--tt-faint)] no-underline transition-colors hover:text-[var(--tt-accent)]"
            >
              {c.consensus.seeAll} →
            </Link>
          </div>
          <table className="mt-2 w-full border-collapse text-sm">
            <tbody>
              {held.map((row) => (
                <tr key={row.cusip} className="border-b border-[var(--tt-border)] last:border-0">
                  <td className="py-2 pr-3">
                    <Link
                      href={stockPath(lang, row.cusip)}
                      className="text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
                    >
                      <EntityName issuer={row.issuer} ticker={row.cusip} />
                    </Link>
                  </td>
                  <td className="py-2 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
                    {row.holderCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Row>

      {/* 超级投资者榜 — 加新鲜度点(谁刚申报)+ 持仓数,比原来的裸名字列表更密。 */}
      <Row
        eyebrow={c.investors.eyebrow}
        title={c.investors.title}
        body={c.investors.body}
        ctaLabel={c.investors.cta}
        href={localePath(lang, "/investors")}
      >
        <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
          {investors.map((m) => (
            <Link
              key={m.cik}
              href={investorPath(lang, m.slug)}
              className="group flex min-h-11 items-center justify-between gap-3 border-b border-[var(--tt-border)] py-2 no-underline"
            >
              <span className="flex min-w-0 items-center gap-2">
                <FreshnessDot status={filingFreshness(m.period || null, now)} lang={lang} />
                <span className="truncate text-sm text-[var(--tt-text)] transition-colors group-hover:text-[var(--tt-accent)]">
                  {m.person}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--tt-faint)] whitespace-nowrap">
                {formatUSD(m.totalValue)}
              </span>
            </Link>
          ))}
        </div>
      </Row>
    </div>
  );
}
