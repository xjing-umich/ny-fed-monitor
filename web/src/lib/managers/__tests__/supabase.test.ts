import { describe, it, expect, vi } from "vitest";
import { mapIndexRows, mapDetailRows } from "@/lib/managers/supabase";

describe("supabase mapping", () => {
  it("mapIndexRows → ManagerIndex summaries sorted by totalValue desc", () => {
    const rows = [
      { cik: "1", slug: "a", name: "A LLC", person: "PA", period: "2026-03-31", total_value: 1000, holding_count: 5, top_holding: "AAA" },
      { cik: "2", slug: "b", name: "B LP", person: "PB", period: "2026-03-31", total_value: 5000, holding_count: 9, top_holding: "BBB" },
    ];
    const idx = mapIndexRows(rows as any, "2026-05-30T00:00:00Z");
    expect(idx.managers[0].cik).toBe("2"); // higher value first
    expect(idx.managers[0].topHolding).toBe("BBB");
    expect(idx.managers).toHaveLength(2);
  });

  it("mapDetailRows builds latest/prior/holdings", () => {
    const manager = { cik: "1", slug: "a", name: "A LLC", person: "PA" };
    const filings = [
      { id: 10, period: "2026-03-31", filed_at: "2026-05-15", accession: "x-1", total_value: 1000, holding_count: 1 },
      { id: 9, period: "2025-12-31", filed_at: "2026-02-14", accession: "x-0", total_value: 800, holding_count: 1 },
    ];
    const holdings = [
      { filing_id: 10, cusip: "C1", issuer: "ISS1", title_of_class: "COM", value: 1000, shares: 100, put_call: null, weight: 1 },
      { filing_id: 9, cusip: "C1", issuer: "ISS1", title_of_class: "COM", value: 800, shares: 80, put_call: null, weight: 1 },
    ];
    const d = mapDetailRows(manager as any, filings as any, holdings as any);
    expect(d.latest.period).toBe("2026-03-31");
    expect(d.latest.holdings[0].cusip).toBe("C1");
    expect(d.prior?.period).toBe("2025-12-31");
    expect(d.changes.find((c) => c.kind === "increased")?.cusip).toBe("C1"); // 80→100
  });
});
