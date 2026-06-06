import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import type { Lang } from "@/lib/nav";
import { investorPath } from "@/lib/urls";
import { EntityPage } from "@/components/entity/EntityPage";
import { formatUSD } from "@/lib/format";

// NOTE: No generateStaticParams — this route renders on-demand per request.
// The union of CUSIPs across all managers is ~1000+; prerendering them all at
// build time would be prohibitively slow. Dynamic rendering is acceptable for
// Phase 0 (6 managers, fast JSON reads).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}): Promise<Metadata> {
  const { lang: rawLang, id } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";

  // Quick scan for issuer name without full aggregation
  const idx = await getManagerIndex();
  let issuer = id;
  for (const m of idx.managers) {
    const d = await getManagerDetail(m.slug);
    if (!d) continue;
    const h = d.latest.holdings.find((h) => h.cusip === id);
    if (h) {
      issuer = h.issuer;
      break;
    }
  }

  return lang === "zh"
    ? {
        title: `${issuer} — 谁在持有 / 机构持仓 — Compounder · 复利`,
        description: `查看持有 ${issuer}（CUSIP ${id}）的超级投资者，了解机构持仓分布。`,
      }
    : {
        title: `${issuer} — Who's Holding — Compounder · 复利`,
        description: `See which superinvestors hold ${issuer} (CUSIP ${id}) and their position sizes.`,
      };
}

// ── Holders table ─────────────────────────────────────────────────────────────

type HolderRow = {
  person: string;
  slug: string;
  value: number;
  shares: number;
  weight: number | undefined;
};

const TABLE_COPY = {
  zh: {
    title: "持有该证券的超级投资者",
    cols: {
      investor: "投资人",
      value: "市值",
      shares: "持股",
      weight: "组合权重",
    },
    coming: "股票估值（内在价值 / DCF）数据即将上线",
  },
  en: {
    title: "Superinvestors Holding This Security",
    cols: {
      investor: "Investor",
      value: "Value",
      shares: "Shares",
      weight: "Weight",
    },
    coming: "Stock valuation (intrinsic value / DCF) coming soon.",
  },
} as const;

function HoldersTable({
  holders,
  lang,
}: {
  holders: HolderRow[];
  lang: Lang;
}): React.ReactElement {
  const t = TABLE_COPY[lang];
  const sorted = [...holders].sort((a, b) => b.value - a.value);

  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="p-4">
        <div className="mb-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {t.title}
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t.cols.investor}
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t.cols.value}
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t.cols.shares}
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t.cols.weight}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr
                  key={row.slug}
                  className={i < sorted.length - 1 ? "border-b border-border" : ""}
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    <Link
                      href={investorPath(lang, row.slug)}
                      className="hover:text-primary hover:underline"
                    >
                      {row.person}
                    </Link>
                  </td>
                  <td className="tnum px-4 py-2.5 text-right font-mono text-foreground">
                    {formatUSD(row.value)}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right font-mono text-muted-foreground">
                    {row.shares.toLocaleString()}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right font-mono text-muted-foreground">
                    {row.weight != null ? `${(row.weight * 100).toFixed(2)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t.coming}</p>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StockCusipPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}): Promise<React.ReactElement> {
  const { lang: rawLang, id } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  // Aggregate all managers to find holders of this CUSIP
  const idx = await getManagerIndex();
  const holders: HolderRow[] = [];
  let issuer = id; // fallback to raw CUSIP if no match
  const issuerFreq: Record<string, number> = {};
  let latestFiledAt = "";

  for (const summary of idx.managers) {
    const d = await getManagerDetail(summary.slug);
    if (!d) continue;
    const h = d.latest.holdings.find((holding) => holding.cusip === id);
    if (!h) continue;

    // Track most common issuer name
    issuerFreq[h.issuer] = (issuerFreq[h.issuer] ?? 0) + 1;

    // Track latest filing date
    if (!latestFiledAt || d.latest.filedAt > latestFiledAt) {
      latestFiledAt = d.latest.filedAt;
    }

    holders.push({
      person: summary.person,
      slug: summary.slug,
      value: h.value,
      shares: h.shares,
      weight: h.weight,
    });
  }

  if (holders.length === 0) notFound();

  // Pick most-frequent issuer string
  issuer = Object.entries(issuerFreq).sort((a, b) => b[1] - a[1])[0][0];

  const n = holders.length;
  const totalValue = holders.reduce((sum, r) => sum + r.value, 0);
  const topHolder = [...holders].sort((a, b) => b.value - a.value)[0];

  const subtitle =
    lang === "zh"
      ? `${n} 位超级投资者持有该证券（CUSIP ${id}）。股票估值数据即将上线。`
      : `Held by ${n} superinvestor${n === 1 ? "" : "s"} (CUSIP ${id}). Valuation data coming soon.`;

  const keyFacts = [
    {
      label: lang === "zh" ? "持有人数" : "Holder count",
      value: String(n),
    },
    {
      label: lang === "zh" ? "合计市值" : "Total value held",
      value: formatUSD(totalValue),
    },
    {
      label: lang === "zh" ? "最大持有人" : "Largest holder",
      value: topHolder.person,
    },
  ];

  // Related: link back to each holder's investor page (up to 6)
  const related = [...holders]
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((r) => ({ label: r.person, href: investorPath(lang, r.slug) }));

  return (
    <EntityPage
      lang={lang}
      title={issuer}
      subtitle={subtitle}
      keyFacts={keyFacts}
      aiPageKey={`stock:${id}`}
      sources={[{ name: "SEC EDGAR 13F", asOf: latestFiledAt }]}
      related={related}
    >
      <HoldersTable holders={holders} lang={lang} />
    </EntityPage>
  );
}
