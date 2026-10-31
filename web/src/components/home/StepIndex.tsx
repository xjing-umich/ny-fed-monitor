import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { ManagerSummary } from "@/lib/managers/types";
import { managerLabel } from "@/lib/managers/displayName";
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
      title: "先看盈利和资产，再检查增长假设",
      body: "财报资料足够时，我们用盈利能力、资产和现金流估算价值区间，并列明假设与缺失数据。把这些条件与持仓一起读，看价格要求你相信什么。",
      cta: (n: number) => (n > 0 ? `查看所示数据中 ${n} 只击球区个股` : "打开价值筛选器"),
    },
    consensus: {
      eyebrow: "跨基金共识",
      title: "哪些股票被多位投资人共同持有",
      body: "按本站追踪的持有人数排序，作为进一步研究的起点。",
      cta: "查看共识持仓",
      holders: "持有人数",
      seeAll: "全部",
    },
    investors: {
      eyebrow: "超级投资者",
      title: "读他们的持仓，不读他们的推文",
      body: "13F 记录的是季末时点、纳入申报范围的证券持仓。我们逐季存档，方便比较持仓数量的变化。",
      cta: "浏览全部投资者",
    },
  },
  en: {
    valuation: {
      eyebrow: "Valuation",
      title: "Start with earnings and assets. Check the growth assumptions.",
      body: "Where the filings support an estimate, we show a value range based on earnings, assets, and cash flow, alongside assumptions and missing data. Read those conditions alongside the holdings to see what a price asks you to believe.",
      cta: (n: number) => (n > 0 ? `See ${n} in the strike zone at shown prices` : "Open the value screener"),
    },
    consensus: {
      eyebrow: "Cross-fund consensus",
      title: "Which stocks are widely held?",
      body: "Ranked by the number of tracked investors holding each stock, as a starting point for further research.",
      cta: "See consensus holdings",
      holders: "Holders",
      seeAll: "All",
    },
    investors: {
      eyebrow: "Super investors",
      title: "Read their holdings, not their tweets",
      body: "13F filings show reportable securities held at quarter-end. We archive each filing so you can compare reported holdings over time.",
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
        {body ? <p className="mt-4 max-w-[44ch] text-sm leading-relaxed text-[var(--ink-2)]">{body}</p> : null}
        <Link
          href={href}
          className="mt-5 inline-flex min-h-11 items-center text-sm text-[var(--tt-text)] underline decoration-[var(--tt-faint)] underline-offset-4 transition-colors hover:text-[var(--tt-accent)]"
        >
          {ctaLabel} →
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
  strike: { total: number; pending?: number; leaders: StrikeLeader[] };
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
        ctaLabel={c.valuation.cta(strike.total)}
        href={localePath(lang, strike.total > 0 ? "/stocks/screener?view=strike_zone" : "/stocks/screener")}
      >
        {strike.leaders.length > 0 ? (
          <StrikeLeadersCard lang={lang} leaders={strike.leaders} total={strike.total} pending={strike.pending} />
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
        <div className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-4 sm:p-5">
          <div className="flex items-baseline justify-between border-b border-[var(--tt-border-strong)] pb-2">
            <span className="text-sm font-medium text-[var(--tt-text)]">{c.consensus.holders}</span>
            <Link
              href={consensusHref}
              className="font-data text-xs text-[var(--tt-faint)] no-underline transition-colors hover:text-[var(--tt-accent)]"
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
                      <EntityName issuer={row.issuer} ticker={row.cusip} lang={lang} />
                    </Link>
                  </td>
                  <td className="py-2 text-right font-data text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
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
        <div>
          <p className="mb-2 text-xs text-[var(--tt-muted)]">{lang === "zh" ? "13F持仓市值（美元）" : "13F portfolio value (USD)"}</p>
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
                    {managerLabel(lang, m.slug, m.person)}
                  </span>
                </span>
                <span className="shrink-0 font-data text-xs tabular-nums text-[var(--tt-faint)] whitespace-nowrap">
                  {formatUSD(m.totalValue, lang)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </Row>
    </div>
  );
}
