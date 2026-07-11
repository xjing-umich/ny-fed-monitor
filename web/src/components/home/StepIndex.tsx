import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { ManagerSummary } from "@/lib/managers/types";
import type { HeldRow } from "@/lib/aggregations";
import type { StrikeLeader } from "@/lib/valuation/valuationSnapshot";
import { EntityName } from "@/components/common/EntityName";
import { formatUSD } from "@/lib/format";
import { investorPath, localePath, stockPath } from "@/lib/urls";
import StrikeLeadersCard from "@/components/home/StrikeLeadersCard";
import ValueBandCard from "@/components/home/ValueBandCard";

const COPY = {
  zh: {
    step1: {
      eyebrow: "超级投资者",
      title: "读他们的持仓，不读他们的推文",
      body: "每季度末，13F 逼这些经理公开手里的每一股。我们逐季存档，让你看长期的仓位，而不是当天的噪音。",
      cta: "浏览全部投资者",
    },
    step2: {
      eyebrow: "跨基金共识",
      title: "多少只重仓落在同一张桌子上",
      body: "",
      cta: "查看共识持仓",
    },
    step3: {
      eyebrow: "估值",
      title: "只为已被证明的盈利和资产付钱",
      body: "我们用可查的盈利和资产给每一只标的定价。不押注任何你必须相信的成长故事。",
      cta: "看最多机构持有的个股",
    },
    held: { holders: "持有基金" },
  },
  en: {
    step1: {
      eyebrow: "Super investors",
      title: "Read their holdings, not their tweets",
      body: "Every quarter-end, a 13F forces these managers to disclose each share they own. We archive it quarter by quarter, so you watch the long position instead of the day's noise.",
      cta: "Browse all investors",
    },
    step2: {
      eyebrow: "Cross-fund consensus",
      title: "How many managers sit at the same table",
      body: "",
      cta: "See consensus holdings",
    },
    step3: {
      eyebrow: "Valuation",
      title: "Pay only for earnings and assets already proven",
      body: "We value every holding on proven earnings and assets. No growth story you have to believe.",
      cta: "See the most-held stocks",
    },
    held: { holders: "Funds holding" },
  },
} as const;

function StepRow({
  serial,
  eyebrow,
  title,
  body,
  ctaLabel,
  href,
  children,
}: {
  serial: string;
  eyebrow: string;
  title: string;
  body?: string;
  ctaLabel: string;
  href: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-6 border-t border-[var(--tt-border)] pt-10 first:border-0 first:pt-0 md:grid-cols-[0.38fr_0.62fr] md:gap-10">
      <div>
        <span className="block font-mono text-4xl leading-none text-[var(--tt-faint)]">{serial}</span>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {title}
        </h2>
        {body ? <p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-[var(--tt-muted)]">{body}</p> : null}
        <Link
          href={href}
          className="mt-5 inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
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

  return (
    <section className="space-y-10">
      {/* 01 — Super investors: investor name grid inline (absorbs the wall). */}
      <StepRow
        serial="01"
        eyebrow={c.step1.eyebrow}
        title={c.step1.title}
        body={c.step1.body}
        ctaLabel={c.step1.cta}
        href={localePath(lang, "/investors")}
      >
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {investors.map((m) => (
            <Link
              key={m.cik}
              href={investorPath(lang, m.slug)}
              className="group flex items-baseline justify-between gap-3 border-b border-[var(--tt-border)] py-2 no-underline"
            >
              <span className="truncate text-sm text-[var(--tt-text)] transition-colors group-hover:text-[var(--tt-accent)]">
                {m.person}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--tt-faint)]">
                {formatUSD(m.totalValue)}
              </span>
            </Link>
          ))}
        </div>
      </StepRow>

      {/* 02 — Cross-fund consensus: bare held table. */}
      <StepRow
        serial="02"
        eyebrow={c.step2.eyebrow}
        title={c.step2.title}
        ctaLabel={c.step2.cta}
        href={localePath(lang, "/investors/consensus")}
      >
        <table className="w-full border-collapse text-sm">
          <tbody>
            {held.map((row) => (
              <tr key={row.cusip} className="border-b border-[var(--tt-border)] last:border-0">
                <td className="py-2.5 pr-3">
                  <Link
                    href={stockPath(lang, row.cusip)}
                    className="text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
                  >
                    <EntityName issuer={row.issuer} ticker={row.cusip} />
                  </Link>
                </td>
                <td className="py-2.5 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
                  {row.holderCount}
                  <span className="ml-2 text-[10px] uppercase tracking-[0.06em] text-[var(--tt-faint)]">
                    {c.held.holders}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </StepRow>

      {/* 03 — Valuation: real strike leaders, else the value-band explainer. */}
      <StepRow
        serial="03"
        eyebrow={c.step3.eyebrow}
        title={c.step3.title}
        body={c.step3.body}
        ctaLabel={c.step3.cta}
        href={localePath(lang, "/stocks")}
      >
        {strike.leaders.length > 0 ? (
          <StrikeLeadersCard lang={lang} leaders={strike.leaders} total={strike.total} />
        ) : (
          <ValueBandCard lang={lang} />
        )}
      </StepRow>
    </section>
  );
}
