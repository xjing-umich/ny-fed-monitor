import assert from "node:assert/strict";
import { deriveCompanyExample } from "./companyExample";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
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
const snapshot: SnapshotVerdict = {
  ticker: "AAPL",
  reliable: true,
  rangeLo: 90,
  rangeHi: 180,
  price: 150,
  priceDate: "2026-10-30",
  methods: { oeDcf: true, zeroGrowthEpv: true, greenwaldGrowthCeilings: false },
  coverage: "full",
  bucket: "within",
  inStrikeZone: false,
  marginPct: 0,
  computedAt: "2026-10-31T00:00:00Z",
  fundamentalsDate: "2026-06-30",
};
const input = {
  ticker: "AAPL",
  holders: [
    holder("a"),
    holder("b", "2026-09-30"),
    holder("c", "2025-12-31"),
    holder("d", "2026-06-30", "exited"),
  ],
  snapshot,
  quote: { close: 150, date: "2026-10-30", currency: "USD", source: "yahoo" },
  latestSplitDate: null,
  now,
};
const row = deriveCompanyExample(input, "zh");
assert.equal(row.holderCount, 2);
assert.equal(row.totalValue, 200);
assert.deepEqual(row.periods, ["2026-06-30", "2026-09-30"]);
assert.equal(row.summary?.heading, "现价处于价值区间");
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
for (const v of [
  { ...snapshot, reliable: false },
  { ...snapshot, rangeHi: Infinity },
  { ...snapshot, methods: undefined },
  { ...snapshot, fundamentalsDate: null },
  { ...snapshot, fundamentalsDate: "nonsense" },
  { ...snapshot, fundamentalsDate: "2020-01-01" },
])
  assert.equal(
    deriveCompanyExample({ ...input, snapshot: v }, "zh").summary,
    null,
  );
assert.equal(
  deriveCompanyExample({ ...input, latestSplitDate: "2026-08-01" }, "zh")
    .summary,
  null,
);
const sotp = {
  ...snapshot,
  ticker: "BRK.B",
  coverage: "single_lamp" as const,
  methods: {
    oeDcf: false,
    zeroGrowthEpv: false,
    greenwaldGrowthCeilings: false,
  },
};
assert.equal(
  deriveCompanyExample({ ...input, ticker: "BRK.B", snapshot: sotp }, "en")
    .summary?.kind,
  "sotp",
);
assert.equal(
  deriveCompanyExample(
    {
      ...input,
      snapshot: {
        ...snapshot,
        methods: {
          zeroGrowthEpv: true,
          oeDcf: false,
          greenwaldGrowthCeilings: false,
        },
      },
    },
    "en",
  ).summary?.kind,
  "zero-growth",
);
assert.equal(
  deriveCompanyExample({ ...input, snapshot: null }, "zh").summary,
  null,
);
assert.equal(
  deriveCompanyExample({ ...input, snapshot: sotp }, "zh").summary,
  null,
  "Unrecognized no-method snapshot must not become SOTP",
);
console.log(
  "snapshotExample.check OK: snapshot gates, dates, splits, currency, SOTP and zero growth",
);
