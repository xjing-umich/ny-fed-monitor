/**
 * auction.ts — Pure compute for Auction Calendar and Auction Risk section.
 * Ported from backend/app/analyzers/auction.py compute_auction_section.
 * NO network calls.
 */

import type { Section } from "@/lib/types";

export type AuctionRow = {
  auction_date?: string | null;
  announcement_date?: string | null;
  issue_date?: string | null;
  security_type?: string | null;
  security_term?: string | null;
  offering_amount?: number | null;
  cusip?: string | null;
  maturity_date?: string | null;
  high_yield?: number | null;
  high_rate?: number | null;
  bid_to_cover_ratio?: number | null;
  primary_dealer_accepted?: number | null;
  direct_bidder_accepted?: number | null;
  indirect_bidder_accepted?: number | null;
  total_accepted?: number | null;
};

function formatDollars(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)} trillion`;
  if (abs >= 1_000_000_000) return `${sign}$${Math.round(abs / 1_000_000_000)} billion`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)} million`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatPercentShare(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  return `${(value * 100).toFixed(1)}%`;
}

function share(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator === null || numerator === undefined || !denominator) return null;
  return numerator / denominator;
}

function btcLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  if (value < 2.3) return "Weak";
  if (value > 2.7) return "Strong";
  return "Normal";
}

function dealerLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  if (value > 0.40) return "High";
  if (value >= 0.25) return "Moderate";
  return "Low";
}

function indirectLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  if (value > 0.65) return "Strong";
  if (value >= 0.50) return "Normal";
  return "Weak";
}

function upcomingSupplyLabel(amount14d: number): string {
  if (amount14d >= 300_000_000_000) return "Large";
  if (amount14d >= 150_000_000_000) return "Moderate";
  return "Normal";
}

function liquidityWatch(
  transactionsSection: { key_metrics?: Array<{ label: string; value: string }> },
  failsSection: { key_metrics?: Array<{ label: string; value: string }> }
): boolean {
  const txnMetric = (transactionsSection.key_metrics ?? []).find((m) => m.label === "Activity Direction");
  const failsMetric = (failsSection.key_metrics ?? []).find((m) => m.label === "Fails Direction");
  return (
    (txnMetric?.value === "Watch / Mild" || txnMetric?.value === "Unavailable") ||
    failsMetric?.value === "rising"
  );
}

function dealerInventoryExtreme(
  section: { key_metrics?: Array<{ label: string; value: string }> }
): [boolean, boolean] {
  const metric = (section.key_metrics ?? []).find((m) => m.label === "Pressure Label");
  const value = metric?.value ?? "";
  return [value === "Extreme", value === "Elevated" || value === "Extreme"];
}

function freshnessStatusAuction(dataDate: string | null): string {
  if (!dataDate) return "Missing";
  const asOf = new Date(dataDate + "T00:00:00Z");
  if (isNaN(asOf.getTime())) return "Missing";
  // Count business days
  const today = new Date();
  let businessDays = 0;
  const cursor = new Date(asOf);
  while (cursor < today) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) {
      businessDays++;
    }
  }
  return businessDays <= 2 ? "Fresh" : "Stale";
}

export function computeAuction(
  upcomingRows: AuctionRow[],
  recentRows: AuctionRow[],
  dealerInventorySection: { key_metrics?: Array<{ label: string; value: string }> },
  transactionsSection: { key_metrics?: Array<{ label: string; value: string }> },
  failsSection: { key_metrics?: Array<{ label: string; value: string }> }
): Section {
  const warnings: string[] = [];
  let upcomingAmount7d = 0;
  let upcomingAmount14d = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const upcomingTable: Record<string, unknown>[] = [];

  for (const row of [...upcomingRows].sort((a, b) =>
    (a.auction_date ?? "").localeCompare(b.auction_date ?? "")
  )) {
    const auctionDate = row.auction_date;
    let auctionDt: Date | null = null;
    if (auctionDate) {
      auctionDt = new Date(auctionDate + "T00:00:00Z");
      if (isNaN(auctionDt.getTime())) auctionDt = null;
    }
    const amount = row.offering_amount ?? 0;
    if (auctionDt) {
      const days7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const days14 = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
      if (auctionDt <= days7) upcomingAmount7d += amount;
      if (auctionDt <= days14) upcomingAmount14d += amount;
    }
    upcomingTable.push({
      "Auction date": auctionDate ?? "Unavailable",
      "Security type": row.security_type ?? "Unavailable",
      "Term": row.security_term ?? "Unavailable",
      "Offering amount": formatDollars(amount),
      "Issue date": row.issue_date ?? "Unavailable",
    });
  }

  const completedTable: Record<string, unknown>[] = [];
  const pendingTable: Record<string, unknown>[] = [];
  let weakBtc = false;
  let highDealer = false;
  let weakIndirect = false;
  let latestCompletedDate: string | null = null;

  for (const row of [...recentRows].sort((a, b) =>
    (b.auction_date ?? "").localeCompare(a.auction_date ?? "")
  )) {
    const primaryShare = share(row.primary_dealer_accepted, row.total_accepted);
    const directShare = share(row.direct_bidder_accepted, row.total_accepted);
    const indirectShare = share(row.indirect_bidder_accepted, row.total_accepted);
    const btc = btcLabel(row.bid_to_cover_ratio);
    const dealer = dealerLabel(primaryShare);
    const indirect = indirectLabel(indirectShare);
    const demandSummary = `BTC: ${btc} | Dealer: ${dealer} | Indirect: ${indirect}`;

    const hasResults =
      row.bid_to_cover_ratio !== null ||
      [primaryShare, directShare, indirectShare].some((s) => s !== null);

    if (hasResults) {
      completedTable.push({
        "Auction date": row.auction_date ?? "Unavailable",
        "Security type": row.security_type ?? "Unavailable",
        "Term": row.security_term ?? "Unavailable",
        "Offering amount": formatDollars(row.offering_amount),
        "Bid-to-cover": row.bid_to_cover_ratio == null ? "Unavailable" : row.bid_to_cover_ratio.toFixed(2),
        "Primary dealer share": formatPercentShare(primaryShare),
        "Indirect bidder share": formatPercentShare(indirectShare),
        "Demand summary": demandSummary,
      });
      weakBtc = weakBtc || btc === "Weak";
      highDealer = highDealer || dealer === "High";
      weakIndirect = weakIndirect || indirect === "Weak";
      if (!latestCompletedDate) latestCompletedDate = row.auction_date ?? null;
    } else {
      pendingTable.push({
        "Auction date": row.auction_date ?? "Unavailable",
        "Security type": row.security_type ?? "Unavailable",
        "Term": row.security_term ?? "Unavailable",
        "Offering amount": formatDollars(row.offering_amount),
        "Status": "Results not yet available",
      });
    }
  }

  const upcomingLabel = upcomingSupplyLabel(upcomingAmount14d);
  const [dealerExtreme, dealerElevated] = dealerInventoryExtreme(dealerInventorySection);
  const liqWatch = liquidityWatch(transactionsSection, failsSection);
  const longEndElevated = false;
  const largeUpcoming = upcomingLabel === "Large";

  const highConditions = [
    dealerExtreme ? 1 : 0,
    longEndElevated ? 1 : 0,
    weakBtc ? 1 : 0,
    highDealer ? 1 : 0,
    weakIndirect ? 1 : 0,
    largeUpcoming ? 1 : 0,
    liqWatch ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  let auctionRisk: string;
  if (highConditions >= 2) {
    auctionRisk = "High";
  } else if (dealerElevated || largeUpcoming || weakBtc || highDealer || weakIndirect) {
    auctionRisk = "Medium";
  } else {
    auctionRisk = "Low";
  }

  const summary =
    "Auction risk is higher when new Treasury supply is coming while dealer inventory is elevated or recent auction demand has weakened.";

  const dataDate =
    latestCompletedDate ??
    (upcomingRows.length > 0 ? upcomingRows[0].auction_date ?? null : null);

  return {
    title: "Auction Calendar and Auction Risk",
    title_zh: "拍卖风险 Auction Risk",
    mode: "live",
    freshness_status: freshnessStatusAuction(dataDate),
    data_date: dataDate,
    summary,
    summary_zh:
      "当即将发行的 Treasury supply 较大，同时 Dealer Inventory 偏高或近期 auction demand 走弱时，Auction Risk 会更高。",
    key_metrics: [
      { label: "Auction Risk", label_zh: "拍卖风险 Auction Risk", value: auctionRisk, unit: "" },
      { label: "Upcoming 7-day Supply", label_zh: "未来7天供给 Upcoming 7-day Supply", value: formatDollars(upcomingAmount7d), unit: "" },
      { label: "Upcoming 14-day Supply", label_zh: "未来14天供给 Upcoming 14-day Supply", value: formatDollars(upcomingAmount14d), unit: "" },
      { label: "Upcoming Supply Label", label_zh: "未来供给标签 Upcoming Supply Label", value: upcomingLabel, unit: "" },
    ],
    tables: [
      { title: "Upcoming Auctions", title_zh: "即将进行的拍卖 Upcoming Auctions", rows: upcomingTable.slice(0, 12) },
      { title: "Completed Recent Auction Results", title_zh: "已完成拍卖结果 Completed Recent Auction Results", rows: completedTable.slice(0, 12) },
      { title: "Pending / Results Not Yet Available", title_zh: "待公布结果 Pending / Results Not Yet Available", rows: pendingTable.slice(0, 12) },
    ],
    warnings,
  };
}
