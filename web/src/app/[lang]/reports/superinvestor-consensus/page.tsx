import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { consensusHeld, notableMoves, type HeldRow, type MoveRow, type MoveKind } from "@/lib/aggregations";
import { getManagerIndex } from "@/lib/managers/source";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";
import { globalLatestPeriod, quarterLabel } from "@/lib/freshness/derive";
import { stockPath, absoluteUrl, SITE_ORIGIN } from "@/lib/urls";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { isLikelyTicker } from "@/lib/externalLinks";
import { DataTable, type Column } from "@/components/common/DataTable";
import { DataStrip } from "@/components/common/DataStrip";
import { EntityName } from "@/components/common/EntityName";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import PageHeader from "@/components/common/PageHeader";
import SubNav from "@/components/shell/SubNav";
import { DataAsOfBadge } from "@/components/aggregate/DataAsOfBadge";
import { ShareButton } from "@/components/share/ShareButton";
import { buildShareText, shareLabels } from "@/lib/share/shareText";

// 季度级数据 → 每日 ISR(随整库按季刷新)。无构建期实时外部抓取(共识/异动读 Supabase,
// DGS10 走 treasuryRead 的硬超时 + 熔断 + DB last-good 回退),不阻塞静态导出。
export const revalidate = 86400;

export function generateStaticParams() {
  return [{ lang: "zh" }, { lang: "en" }];
}

const PATH = "/reports/superinvestor-consensus";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const isZh = rawLang === "zh";
  const lang = isZh ? "zh" : "en";
  const idx = await getManagerIndex();
  const ql = quarterLabel(globalLatestPeriod((idx.managers ?? []).map((m) => m.period)));
  const alternates = {
    canonical: `/${lang}${PATH}`,
    languages: { en: `/en${PATH}`, "zh-CN": `/zh${PATH}`, "x-default": `/en${PATH}` },
  };
  return isZh
    ? {
        title: `超级投资者共识报告${ql ? ` · ${ql}` : ""} — Compounder · 复利`,
        description: `${ql ? `${ql} ` : ""}顶级价值投资者 SEC 13F 季度报告:被最多机构同时持有的股票、本季最多人买入与卖出的标的。纯数据陈述,不含投资建议。`,
        alternates,
      }
    : {
        title: `Superinvestor Consensus Report${ql ? ` · ${ql}` : ""} — Compounder`,
        description: `${ql ? `${ql} ` : ""}quarterly report on top value investors' SEC 13F filings: the most widely held stocks and the securities most bought and sold this quarter. Descriptive data only — not investment advice.`,
        alternates,
      };
}

const KIND_META: Record<MoveKind, { tone: BadgeTone; zh: string; en: string }> = {
  new: { tone: "positive", zh: "新建仓", en: "New" },
  increased: { tone: "positive", zh: "加仓", en: "Added" },
  exited: { tone: "negative", zh: "清仓", en: "Exited" },
  decreased: { tone: "warn", zh: "减仓", en: "Trimmed" },
};

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="mb-4 mt-12">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{eyebrow}</span>
      <h2 className="mt-1 font-display text-xl font-medium text-[var(--tt-text)]">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--tt-muted)]">{sub}</p>
    </div>
  );
}

export default async function ConsensusReportPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const isZh = lang === "zh";

  const [held, moves, idx, dgs10] = await Promise.all([
    consensusHeld(),
    notableMoves(8),
    getManagerIndex(),
    getLatestDgs10(),
  ]);

  const managerCount = (idx.managers ?? []).length;
  const period = globalLatestPeriod((idx.managers ?? []).map((m) => m.period));
  const ql = quarterLabel(period);

  const topHeld = held.slice(0, 15);
  const topBuy = moves.mostBought[0] ?? null;
  const topSell = moves.mostSold[0] ?? null;
  const lead = topHeld[0] ?? null;

  // ── 编辑导语:纯数据陈述,零推荐措辞(守美国投顾法红线) ──────────────────────
  const lede = isZh
    ? `截至 ${period ?? "—"}(${ql ?? "最新季度"}),Compounder 追踪 ${managerCount} 位顶级价值投资者的 SEC 13F 申报。` +
      (lead ? `本季被最多机构同时持有的是 ${cleanIssuer(lead.issuer)}(${lead.holderCount} 家)。` : "") +
      (topBuy ? `最多人增持的是 ${cleanIssuer(topBuy.issuer)}(${topBuy.count} 家),` : "") +
      (topSell ? `最多人减持的是 ${cleanIssuer(topSell.issuer)}(${topSell.count} 家)。` : "") +
      `以下为完整榜单,数据源自 SEC EDGAR,仅作客观披露。`
    : `As of ${period ?? "—"} (${ql ?? "latest quarter"}), Compounder tracks the SEC 13F filings of ${managerCount} leading value investors. ` +
      (lead ? `${cleanIssuer(lead.issuer)} is the most widely held position this quarter (${lead.holderCount} funds). ` : "") +
      (topBuy ? `${cleanIssuer(topBuy.issuer)} drew the most buying (${topBuy.count} funds), ` : "") +
      (topSell ? `while ${cleanIssuer(topSell.issuer)} saw the most selling (${topSell.count} funds). ` : "") +
      `The full tables follow — sourced from SEC EDGAR, presented as objective disclosure.`;

  const shareUrl = absoluteUrl(`/${lang}${PATH}`);
  const shareText = buildShareText(
    { kind: "consensus", topName: lead ? cleanIssuer(lead.issuer) : null, holderCount: lead?.holderCount ?? null, managerCount },
    lang,
    isZh ? "超级投资者共识报告" : "Superinvestor Consensus Report",
  );

  // ── 表格列定义 ─────────────────────────────────────────────────────────────
  const heldCols: Column<HeldRow>[] = [
    {
      key: "name",
      role: "primary",
      header: isZh ? "公司" : "Company",
      cell: (r) => <EntityName issuer={r.issuer} ticker={isLikelyTicker(r.cusip) ? r.cusip : null} />,
    },
    {
      key: "holders",
      align: "right",
      header: isZh ? "持有机构" : "Holders",
      mobileLabel: isZh ? "持有机构" : "Holders",
      cell: (r) => r.holderCount,
    },
    {
      key: "value",
      align: "right",
      header: isZh ? "合计市值" : "Total value",
      mobileLabel: isZh ? "合计市值" : "Total value",
      cell: (r) => formatUSD(r.totalValue),
    },
  ];

  const moveCols = (label: string): Column<MoveRow>[] => [
    {
      key: "name",
      role: "primary",
      header: isZh ? "公司" : "Company",
      cell: (r) => <EntityName issuer={r.issuer} ticker={isLikelyTicker(r.cusip) ? r.cusip : null} />,
    },
    {
      key: "kind",
      role: "trail",
      header: "",
      cell: (r) => {
        const k = KIND_META[r.dominantKind];
        return <Badge tone={k.tone}>{isZh ? k.zh : k.en}</Badge>;
      },
    },
    {
      key: "funds",
      align: "right",
      header: label,
      mobileLabel: label,
      cell: (r) => r.count,
    },
    {
      key: "value",
      align: "right",
      header: isZh ? "申报市值" : "Reported value",
      mobileLabel: isZh ? "申报市值" : "Reported value",
      cell: (r) => formatUSD(r.value),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: isZh
              ? `超级投资者共识报告${ql ? ` ${ql}` : ""}`
              : `Superinvestor Consensus Report${ql ? ` ${ql}` : ""}`,
            description: isZh
              ? "顶级价值投资者 SEC 13F 季度报告:最多机构同时持有的股票、本季最多人买入与卖出的标的。"
              : "Quarterly report on top value investors' SEC 13F filings: most widely held stocks and the securities most bought and sold this quarter.",
            url: shareUrl,
            ...(period ? { temporalCoverage: period, dateModified: period } : {}),
            isAccessibleForFree: true,
            creator: { "@type": "Organization", name: "Compounder", url: SITE_ORIGIN },
            license: "https://www.sec.gov/about/privacy-information",
            keywords: ["13F", "superinvestors", "consensus holdings", "value investing", "SEC EDGAR"],
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/${lang}` },
              { "@type": "ListItem", position: 2, name: isZh ? "超级投资者" : "Superinvestors", item: `${SITE_ORIGIN}/${lang}/investors` },
              { "@type": "ListItem", position: 3, name: isZh ? "共识报告" : "Consensus Report", item: shareUrl },
            ],
          }),
        }}
      />

      <SubNav lang={lang} section="investors" active="report" />

      <div className="pb-8 sm:pb-10">
        <PageHeader
          eyebrow={isZh ? `季度报告 · SEC 13F${ql ? ` · ${ql}` : ""}` : `Quarterly report · SEC 13F${ql ? ` · ${ql}` : ""}`}
          title={isZh ? "超级投资者共识报告" : "Superinvestor Consensus Report"}
          dateline={<DataAsOfBadge lang={lang} asOf={period ?? undefined} />}
          action={
            <ShareButton
              url={shareUrl}
              text={shareText}
              labels={shareLabels(lang)}
              meta={{ entity: "consensus-report", entityType: "report", lang }}
            />
          }
        />

        <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--tt-muted)]">{lede}</p>

        <DataStrip
          lang={lang}
          period={period ?? ""}
          investorCount={managerCount}
          consensusCount={held.length}
          dgs10={dgs10}
        />

        {/* ── 最多机构持有 ── */}
        <SectionHead
          eyebrow={isZh ? "共识持仓 · 前 15" : "Consensus holdings · Top 15"}
          title={isZh ? "最多机构同时持有的股票" : "Most widely held stocks"}
          sub={
            isZh
              ? "按持有该股的顶级投资者数量排列。点击进入个股详情与估值。"
              : "Ranked by the number of tracked superinvestors holding the security. Tap through for per-stock detail and valuation."
          }
        />
        <DataTable
          columns={heldCols}
          rows={topHeld}
          getKey={(r) => r.cusip}
          rowHref={(r) => stockPath(lang, r.cusip)}
          showRank
          emptyText={isZh ? "暂无数据" : "No data available"}
        />

        {/* ── 本季最多人买入 ── */}
        <SectionHead
          eyebrow={isZh ? "季度异动 · 买入" : "Quarterly moves · Buys"}
          title={isZh ? "本季最多人买入" : "Most bought this quarter"}
          sub={
            isZh
              ? "本季新建仓或加仓该标的的顶级投资者数量(全局最新季口径)。"
              : "Number of superinvestors who opened or increased a position this quarter (latest-quarter filers only)."
          }
        />
        <DataTable
          columns={moveCols(isZh ? "买入机构" : "Buyers")}
          rows={moves.mostBought}
          getKey={(r) => r.cusip}
          rowHref={(r) => stockPath(lang, r.cusip)}
          showRank
          emptyText={isZh ? "暂无数据" : "No data available"}
        />

        {/* ── 本季最多人卖出 ── */}
        <SectionHead
          eyebrow={isZh ? "季度异动 · 卖出" : "Quarterly moves · Sells"}
          title={isZh ? "本季最多人卖出" : "Most sold this quarter"}
          sub={
            isZh
              ? "本季清仓或减仓该标的的顶级投资者数量(全局最新季口径)。"
              : "Number of superinvestors who exited or trimmed a position this quarter (latest-quarter filers only)."
          }
        />
        <DataTable
          columns={moveCols(isZh ? "卖出机构" : "Sellers")}
          rows={moves.mostSold}
          getKey={(r) => r.cusip}
          rowHref={(r) => stockPath(lang, r.cusip)}
          showRank
          emptyText={isZh ? "暂无数据" : "No data available"}
        />

        {/* ── 方法论 / 合规脚注 ── */}
        <p className="mt-12 max-w-2xl text-xs leading-relaxed text-[var(--tt-faint)]">
          {isZh
            ? "数据来源:SEC EDGAR 13F 季度报告(机构持仓披露,最多滞后 45 天)。共识口径为被 ≥2 位被追踪投资者同时持有。本页为客观数据披露,不构成任何买卖建议或个性化投资意见。"
            : "Source: SEC EDGAR 13F quarterly filings (institutional holdings disclosure, up to a 45-day lag). “Consensus” means held by ≥2 tracked investors. This page is objective data disclosure and does not constitute a recommendation or personalized investment advice."}
        </p>
      </div>
    </>
  );
}
