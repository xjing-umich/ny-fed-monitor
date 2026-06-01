import { describe, it, expect } from "vitest";
import { buildUpsertPayload } from "../supabaseUpsert";

it("buildUpsertPayload shapes manager/filing/holding rows", () => {
  const detail = {
    manager: { cik: "1", slug: "a", name: "A", person: "P" },
    latest: { period: "2026-03-31", filedAt: "2026-05-15", accession: "x-1", totalValue: 1000, holdings: [{ cusip: "C1", issuer: "ISS", value: 1000, shares: 100, weight: 1 }] },
    prior: { period: "2025-12-31", filedAt: "2026-02-14", accession: "x-0", totalValue: 800, holdings: [{ cusip: "C1", issuer: "ISS", value: 800, shares: 80, weight: 1 }] },
    changes: [],
  } as any;
  const p = buildUpsertPayload(detail);
  expect(p.manager).toEqual({ cik: "1", slug: "a", name: "A", person: "P" });
  expect(p.filings.map((f) => f.accession)).toEqual(["x-1", "x-0"]);
  expect(p.filings[0]).toMatchObject({ cik: "1", period: "2026-03-31", total_value: 1000, holding_count: 1 });
  // holdings grouped by accession
  expect(p.holdingsByAccession["x-1"][0]).toMatchObject({ cusip: "C1", value: 1000, shares: 100 });
});
