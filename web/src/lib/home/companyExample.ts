import type { Lang } from "@/lib/nav";
import type { StockHolderApp } from "@/lib/managers/consensusRead";
import type { LatestPrice } from "@/lib/managers/priceRead";
import type { ValuationRun } from "@/lib/valuation/runValuation";
import { countsAsCurrentHolder } from "@/lib/freshness/derive";
import { cleanIssuer } from "@/lib/format";
import { managerLabel } from "@/lib/managers/displayName";
import { stockDisplayName } from "@/lib/stocks/zhNames";
import {
  stockValueSummary,
  type StockValueSummary,
} from "@/lib/stocks/stockFirstScreen";
import { conclusionLeftState } from "@/lib/stocks/stockConclusion";
import { snapshotTime } from "@/lib/datasetTime";

export type CompanyExample = {
  ticker: string;
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
};
export function deriveCompanyExample(
  input: {
    ticker: string;
    holders: StockHolderApp[] | null;
    run: ValuationRun | null;
    quote: LatestPrice | null;
    fundamentalsDate: string | null;
    now: Date;
    splitCoverageStale?: boolean;
    fundamentalsCorrupt?: boolean;
  },
  lang: Lang,
): CompanyExample {
  const { ticker, run, quote } = input;
  const rows =
    input.holders?.filter(
      (r) => r.kind !== "exited" && countsAsCurrentHolder(r.period, input.now),
    ) ?? [];
  const floor = run?.floor?.kind === "floor" ? run.floor : undefined;
  const sotp = floor?.holdco_sotp;
  const state = conclusionLeftState({
    hasFloor: !!run?.floor,
    splitCoverageStale: !!input.splitCoverageStale,
    holdcoNotAssessable: !!floor?.holdco_not_assessable,
    hasHoldcoSotp: !!sotp,
    capitalStructureDistorted:
      !!floor?.moat_reading?.capital_structure_distorted,
    fundamentalsCorrupt: !!input.fundamentalsCorrupt,
    growthEvidenceMissing: !!run?.oeDcf?.growth_coverage_gap,
  });
  const eligible =
    state === "holdcoSotp" ||
    (state === "card" &&
      !!run?.strikeZone?.epv &&
      !run.strikeZone.currencyMismatch);
  const kind =
    state === "holdcoSotp"
      ? "sotp"
      : run?.methods.oeDcf || run?.methods.greenwaldGrowthCeilings
        ? "earnings"
        : "zero-growth";
  const summary = eligible
    ? stockValueSummary(
        {
          verdict: run?.verdict,
          quote,
          kind,
          reference:
            kind === "sotp"
              ? sotp?.per_share.base
              : run?.oeDcf?.assessable
                ? run.oeDcf.tiers?.neutral.per_share
                : undefined,
        },
        lang,
      )
    : null;
  const reasons: Record<string, [string, string]> = {
    no_price: [
      "缺少可用报价，暂不比较价格与价值。",
      "A usable quote is unavailable, so price and value are not compared.",
    ],
    price_stale: [
      "报价已过期，暂不比较价格与价值。",
      "The quote is out of date, so price and value are not compared.",
    ],
    fundamentals_stale: [
      "财报数据已过期，估值暂不可用。",
      "Financial data is out of date; valuation is unavailable.",
    ],
    growth_evidence_incomplete: [
      "增长证据不足，估值待确认。",
      "Growth evidence is incomplete; valuation is pending.",
    ],
    split_coverage_stale: [
      "拆股口径尚待核对，估值暂停。",
      "Split coverage needs verification; valuation is paused.",
    ],
    currency_mismatch: [
      "币种口径不同，暂不比较价格与价值。",
      "Currencies differ, so price and value are not compared.",
    ],
    fundamentals_corrupt: [
      "财报数据待核实，估值暂不可用。",
      "Financial data needs verification; valuation is unavailable.",
    ],
  };
  const reason = run?.suppressedReason;
  const unavailable =
    reason && reasons[reason]
      ? reasons[reason][lang === "zh" ? 0 : 1]
      : lang === "zh"
        ? "当前证据尚不足以展示确定估值。打开完整资料查看原因与方法。"
        : "Current evidence does not support a confirmed valuation. Open the full profile for reasons and methods.";
  return {
    ticker,
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
    fundamentalsDate: input.fundamentalsDate,
  };
}
