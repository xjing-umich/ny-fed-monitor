import assert from "node:assert/strict";
import { deriveCompanyExample } from "./companyExample";
import type { ValuationRun } from "@/lib/valuation/runValuation";
import type { StockHolderApp } from "@/lib/managers/consensusRead";
const now = new Date("2026-10-31T03:00:00Z");
const holder = (
  slug: string,
  period = "2026-06-30",
  kind: StockHolderApp["kind"] = null,
): StockHolderApp => ({
  slug,
  period,
  kind,
  cik: slug,
  person: slug,
  issuer: "Apple Inc",
  value: 100,
  shares: 1,
  weight: 0.1,
  priorWeight: undefined,
  filedAt: period,
});
const run = {
  verdict: {
    reliable: true,
    rangeLo: 90,
    rangeHi: 180,
    price: 150,
    priceDate: "2026-10-30",
    methods: { oeDcf: true },
  },
  floor: { kind: "floor" },
  strikeZone: { epv: {} },
  oeDcf: undefined,
  methods: { oeDcf: true },
} as unknown as ValuationRun;
const input = {
  ticker: "AAPL",
  holders: [
    holder("a"),
    holder("b", "2026-09-30"),
    holder("c", "2025-12-31"),
    holder("d", "2026-06-30", "exited"),
  ],
  run,
  quote: { close: 150, date: "2026-10-30", currency: "USD", source: "yahoo" },
  fundamentalsDate: "2026-09-30",
  now,
};
const result = deriveCompanyExample(input, "zh");
assert.equal(result.holderCount, 2);
assert.equal(result.totalValue, 200);
assert.deepEqual(result.periods, ["2026-06-30", "2026-09-30"]);
assert.equal(result.summary?.heading, "现价处于价值区间");
assert.equal(
  deriveCompanyExample({ ...input, holders: null }, "zh").holderCount,
  null,
);
assert.equal(
  deriveCompanyExample({ ...input, holders: [] }, "zh").available,
  false,
);
for (const quote of [
  null,
  { ...input.quote, stale: true },
  { ...input.quote, currency: "HKD" },
  { ...input.quote, date: "2026-10-29" },
  { ...input.quote, close: -1 },
])
  assert.equal(deriveCompanyExample({ ...input, quote }, "en").summary, null);
assert.equal(
  deriveCompanyExample(
    {
      ...input,
      run: { ...run, verdict: { ...run.verdict!, reliable: false } },
    },
    "zh",
  ).summary,
  null,
);
assert.equal(
  deriveCompanyExample(
    {
      ...input,
      run: { ...run, verdict: { ...run.verdict!, rangeHi: Infinity } },
    },
    "zh",
  ).summary,
  null,
);
const sotp = {
  ...run,
  floor: {
    kind: "floor",
    holdco_not_assessable: true,
    holdco_sotp: { per_share: { base: 125 } },
  },
} as ValuationRun;
assert.equal(
  deriveCompanyExample({ ...input, ticker: "BRK.B", run: sotp }, "en").summary
    ?.kind,
  "sotp",
);
const zero = {
  ...run,
  methods: {
    zeroGrowthEpv: true,
    oeDcf: false,
    greenwaldGrowthCeilings: false,
  },
};
assert.equal(
  deriveCompanyExample({ ...input, run: zero }, "en").summary?.kind,
  "zero-growth",
);
assert.equal(deriveCompanyExample({ ...input, run: null }, "zh").summary, null);
console.log(
  "companyExample.check OK: current holders, mixed dates, unavailable, SOTP, zero growth and safe quote guards",
);
