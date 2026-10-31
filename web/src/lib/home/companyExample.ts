import type { Lang } from "@/lib/nav";
import type { StockHolderApp } from "@/lib/managers/consensusRead";
import type { LatestPrice } from "@/lib/managers/priceRead";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import { countsAsCurrentHolder } from "@/lib/freshness/derive";
import { cleanIssuer } from "@/lib/format";
import { managerLabel } from "@/lib/managers/displayName";
import { stockDisplayName } from "@/lib/stocks/zhNames";
import {
  stockValueSummary,
  type StockValueSummary,
  type StockSummaryKind,
} from "@/lib/stocks/stockFirstScreen";
import { isFundamentalsStale } from "@/lib/valuation/fundamentalsStale";
import { isSplitCoverageStale } from "@/lib/valuation/splitCoverage";
import { snapshotTime } from "@/lib/datasetTime";

export type CompanyExample = {
  ticker: string;
  publication: SnapshotVerdict["publication"] | null;
  name: string;
  available: boolean;
  holderCount: number | null;
  totalValue: number | null;
  periods: string[];
  holdingsNote: string;
  leaders: { name: string; slug: string }[];
  summary: StockValueSummary | null;
  unavailable: string;
  fundamentalsDate: string | null;
  valuationDate: string | null;
};

function summaryKind(
  ticker: string,
  v: SnapshotVerdict,
): StockSummaryKind | null {
  const m = v.methods;
  if (!m) return null;
  if (m.oeDcf || m.greenwaldGrowthCeilings) return "earnings";
  if (m.zeroGrowthEpv) return "zero-growth";
  // Current-version deriveValuationVerdict only publishes a no-operating-method
  // verdict through its SOTP branch. Restrict that contract to the curated BRK
  // example and single-lamp coverage; unknown method identities stay unavailable.
  return ticker === "BRK.B" &&
    v.ticker === ticker &&
    v.coverage === "single_lamp"
    ? "sotp"
    : null;
}
export function deriveCompanyExample(
  input: {
    ticker: string;
    holders: StockHolderApp[] | null;
    snapshot: SnapshotVerdict | null;
    quote: LatestPrice | null;
    latestSplitDate: string | null;
    now: Date;
  },
  lang: Lang,
): CompanyExample {
  const { ticker, snapshot: v, quote, now } = input;
  const rows =
    input.holders?.filter(
      (r) => r.kind !== "exited" && countsAsCurrentHolder(r.period, now),
    ) ?? [];
  const fundamentalsDate = v?.fundamentalsDate ?? null;
  const validDate =
    !!fundamentalsDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(fundamentalsDate) &&
    Number.isFinite(Date.parse(fundamentalsDate)) &&
    Date.parse(fundamentalsDate) <= now.getTime();
  const fresh =
    validDate && !isFundamentalsStale(fundamentalsDate, now.toISOString());
  const splitStale = isSplitCoverageStale({
    fundamentalsAsOf: fundamentalsDate,
    latestSplitDate: input.latestSplitDate,
  });
  const kind = v ? summaryKind(ticker, v) : null;
  const summary =
    v &&
    v.reliable &&
    !v.referenceOnly &&
    v.ticker === ticker &&
    v.methods &&
    quote && !quote.stale && quote.currency === "USD" && quote.date === v.priceDate &&
    Number.isFinite(quote.close) && quote.close > 0 && Math.abs(quote.close-v.price) <= Math.max(1,quote.close)*1e-9 &&
    v.securityUnit !== "unknown" &&
    kind &&
    fresh &&
    !splitStale
      ? stockValueSummary(
          { verdict: { ...v, methods: v.methods, referenceValue:v.referenceValue!,referenceKind:v.referenceKind! },
            quote: quote ? {...quote,close:v.price,date:v.priceDate,source:v.priceSource ?? quote.source} : null,
            reference:v.intrinsicValue ?? v.referenceValue ?? undefined,kind,
            securityUnit:v.securityUnit === "ADS" ? "ADS" : "share" },
          lang,
        )
      : null;
  const unavailable =
    lang === "zh"
      ? !quote
        ? "缺少可用报价，暂不比较价格与价值。"
        : quote.stale
          ? "报价已过期，暂不比较价格与价值。"
          : splitStale
            ? "拆股口径尚待核对，估值暂停。"
            : v && !fresh
              ? "估值快照的财报日期缺失或过期，暂不展示确认区间。"
              : "当前估值快照尚未确认，或与最新报价不能对齐。打开完整资料查看当前证据与方法。"
      : !quote
        ? "A usable quote is unavailable, so price and value are not compared."
        : quote.stale
          ? "The quote is out of date, so price and value are not compared."
          : splitStale
            ? "Split coverage needs verification; valuation is paused."
            : v && !fresh
              ? "The valuation snapshot’s financial date is missing or out of date. A confirmed range is unavailable."
              : "The valuation snapshot is unconfirmed or does not align with the latest quote. Open the full profile for current evidence and methods.";
  return {
    ticker,
    publication: rows.length && summary ? v?.publication ?? null : null,
    name: stockDisplayName(
      lang,
      ticker,
      cleanIssuer(rows[0]?.issuer || ticker),
    ),
    available: rows.length > 0,
    holderCount: input.holders === null ? null : rows.length,
    totalValue:
      input.holders === null ? null : rows.reduce((n, r) => n + r.value, 0),
    periods: [
      ...new Set(rows.flatMap((r) => (r.period ? [r.period] : []))),
    ].sort(),
    holdingsNote: snapshotTime(
      lang,
      rows.map((r) => r.period),
    ).note,
    leaders: [...rows]
      .sort((a, b) => b.value - a.value)
      .slice(0, 2)
      .map((r) => ({
        name: managerLabel(lang, r.slug, r.person),
        slug: r.slug,
      })),
    summary: rows.length ? summary : null,
    unavailable,
    fundamentalsDate: validDate ? fundamentalsDate : null,
    valuationDate: v?.computedAt?.slice(0, 10) ?? null,
  };
}
