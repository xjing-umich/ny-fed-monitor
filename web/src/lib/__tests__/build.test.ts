/**
 * build.test.ts — tests for buildAllSections() with mocked source/analyzer modules.
 * No live network. Verifies safe() wrapping and summary fields.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock source modules ──────────────────────────────────────────────────────

vi.mock("@/lib/sources/nyfed", () => ({
  fetchPdHistory: vi.fn().mockResolvedValue([
    { date: "2026-01-01", value: 100000.0 },
    { date: "2026-01-08", value: 110000.0 },
  ]),
  fetchReferenceRates: vi.fn().mockResolvedValue([
    { date: "2026-01-10", rate_name: "SOFR", rate_percent: 4.32, volume: 1000 },
    { date: "2026-01-10", rate_name: "EFFR", rate_percent: 4.33, volume: null },
    { date: "2026-01-10", rate_name: "OBFR", rate_percent: 4.33, volume: null },
    { date: "2026-01-10", rate_name: "TGCR", rate_percent: 4.31, volume: null },
    { date: "2026-01-10", rate_name: "BGCR", rate_percent: 4.30, volume: null },
  ]),
  fetchSomaSummary: vi.fn().mockResolvedValue([
    { date: "2026-01-10", category: "Treasury", par_value: 4_500_000_000_000 },
    { date: "2026-01-10", category: "MBS", par_value: 2_000_000_000_000 },
    { date: "2026-01-10", category: "Total", par_value: 6_500_000_000_000 },
    { date: "2026-01-03", category: "Treasury", par_value: 4_480_000_000_000 },
    { date: "2026-01-03", category: "MBS", par_value: 2_010_000_000_000 },
    { date: "2026-01-03", category: "Total", par_value: 6_490_000_000_000 },
  ]),
  fetchFacilityUsage: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/sources/treasury", () => ({
  fetchUpcomingAuctions: vi.fn().mockResolvedValue([]),
  fetchRecentAuctionResults: vi.fn().mockResolvedValue([]),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildAllSections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a DataPayload with summary and sections", async () => {
    const { buildAllSections } = await import("@/lib/build");
    const payload = await buildAllSections();

    expect(payload.summary).toBeDefined();
    expect(payload.sections).toBeDefined();
    expect(payload.as_of).toBeDefined();
    expect(typeof payload.as_of).toBe("string");
  });

  it("section_order contains all expected keys", async () => {
    const { buildAllSections } = await import("@/lib/build");
    const payload = await buildAllSections();
    const order = payload.summary.section_order;

    expect(order).toContain("dealer-inventory");
    expect(order).toContain("transactions");
    expect(order).toContain("repo-financing");
    expect(order).toContain("fails");
    expect(order).toContain("reference-rates");
    expect(order).toContain("soma");
    expect(order).toContain("facility-usage");
    expect(order).toContain("auction-risk");
    expect(order).toContain("market-share");
  });

  it("sections object has all keys from section_order", async () => {
    const { buildAllSections } = await import("@/lib/build");
    const payload = await buildAllSections();
    for (const key of payload.summary.section_order) {
      expect(payload.sections[key], `section ${key} should exist`).toBeDefined();
    }
  });

  it("when one source throws, that section becomes unavailable and others stay live", async () => {
    // Make fetchPdHistory throw for the first call only (dealer-inventory)
    const { fetchPdHistory } = await import("@/lib/sources/nyfed");
    vi.mocked(fetchPdHistory).mockRejectedValueOnce(new Error("network error"));

    const { buildAllSections } = await import("@/lib/build");
    const payload = await buildAllSections();

    // dealer-inventory should be unavailable
    expect(payload.sections["dealer-inventory"].mode).toBe("unavailable");
    expect(payload.sections["dealer-inventory"].warnings?.length).toBeGreaterThan(0);
    expect(payload.sections["dealer-inventory"].warnings?.[0]).toContain("network error");

    // at least soma should still be live
    expect(payload.sections["soma"].mode).toBe("live");
  });

  it("data_mode is partial-live when some sections fail", async () => {
    const { fetchPdHistory } = await import("@/lib/sources/nyfed");
    vi.mocked(fetchPdHistory).mockRejectedValue(new Error("all pd down"));

    const { buildAllSections } = await import("@/lib/build");
    const payload = await buildAllSections();

    expect(["partial-live", "mock"]).toContain(payload.summary.data_mode);
    expect(payload.summary.unavailable_sections.length).toBeGreaterThan(0);
  });

  it("summary live_sections + unavailable_sections covers all sections", async () => {
    const { buildAllSections } = await import("@/lib/build");
    const payload = await buildAllSections();
    const all = [
      ...payload.summary.live_sections,
      ...payload.summary.unavailable_sections,
    ].sort();
    const order = [...payload.summary.section_order].sort();
    expect(all).toEqual(order);
  });
});
