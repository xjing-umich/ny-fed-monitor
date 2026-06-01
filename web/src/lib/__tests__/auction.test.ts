/**
 * auction.test.ts — Structural tests for computeAuction (no fixture, uses synthetic data).
 */

import { describe, it, expect } from "vitest";
import { computeAuction } from "@/lib/analyzers/auction";
import type { AuctionRow } from "@/lib/analyzers/auction";

const VALID_RISK_LABELS = ["Low", "Medium", "High"];

// Minimal section stubs
const dealerLow = {
  key_metrics: [{ label: "Pressure Label", value: "Low / Normal" }],
};
const dealerExtreme = {
  key_metrics: [{ label: "Pressure Label", value: "Extreme" }],
};
const txnOk = {
  key_metrics: [{ label: "Activity Direction", value: "Stable / improving" }],
};
const txnWatch = {
  key_metrics: [{ label: "Activity Direction", value: "Watch / Mild" }],
};
const failsStable = {
  key_metrics: [{ label: "Fails Direction", value: "stable / falling" }],
};
const failsRising = {
  key_metrics: [{ label: "Fails Direction", value: "rising" }],
};

const upcomingRow: AuctionRow = {
  auction_date: "2099-01-10",
  security_type: "Note",
  security_term: "2-Year",
  offering_amount: 50_000_000_000,
  issue_date: "2099-01-15",
};

const recentCompleted: AuctionRow = {
  auction_date: "2025-01-02",
  security_type: "Note",
  security_term: "10-Year",
  offering_amount: 40_000_000_000,
  bid_to_cover_ratio: 2.5,
  primary_dealer_accepted: 8_000_000_000,
  direct_bidder_accepted: 5_000_000_000,
  indirect_bidder_accepted: 27_000_000_000,
  total_accepted: 40_000_000_000,
};

describe("auction structural tests", () => {
  it("returns a section with all required fields", () => {
    const section = computeAuction([], [], dealerLow, txnOk, failsStable);
    expect(section.title).toBe("Auction Calendar and Auction Risk");
    expect(section.mode).toBe("live");
    expect(section.key_metrics).toBeDefined();
    expect(section.tables).toBeDefined();
    expect(section.tables!.length).toBeGreaterThan(0);
  });

  it("auction risk label is one of Low / Medium / High", () => {
    const section = computeAuction(
      [upcomingRow],
      [recentCompleted],
      dealerLow,
      txnOk,
      failsStable
    );
    const riskMetric = section.key_metrics!.find((m) => m.label === "Auction Risk");
    expect(riskMetric).toBeDefined();
    expect(VALID_RISK_LABELS).toContain(riskMetric!.value);
  });

  it("elevated dealer + failing txn/fails pushes risk to High", () => {
    const section = computeAuction(
      [upcomingRow],
      [recentCompleted],
      dealerExtreme,
      txnWatch,
      failsRising
    );
    const riskMetric = section.key_metrics!.find((m) => m.label === "Auction Risk");
    expect(riskMetric!.value).toBe("High");
  });

  it("upcoming supply label is in expected set", () => {
    const section = computeAuction([upcomingRow], [], dealerLow, txnOk, failsStable);
    const supplyLabel = section.key_metrics!.find((m) => m.label === "Upcoming Supply Label");
    expect(["Normal", "Moderate", "Large"]).toContain(supplyLabel!.value);
  });

  it("empty input still returns valid structure", () => {
    const section = computeAuction([], [], dealerLow, txnOk, failsStable);
    const risk = section.key_metrics!.find((m) => m.label === "Auction Risk");
    expect(VALID_RISK_LABELS).toContain(risk!.value);
    expect(section.data_date).toBeNull();
  });
});
