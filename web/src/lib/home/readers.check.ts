import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
function stub(p: string, exports: unknown) {
  const id = require.resolve(p);
  require.cache[id] = {
    id,
    filename: id,
    loaded: true,
    exports,
  } as NodeJS.Module;
}
let reads = 0;
stub("../managers/db", {
  hasSupabaseEnv: () => true,
  getDb: () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          order: () => ({
            limit: async () => {
              reads++;
              return { data: [], error: null };
            },
          }),
        }),
      }),
    }),
  }),
});
stub("../managers/consensusRead", {
  readStockHolders: async () => {
    reads++;
    return [];
  },
  readConsensusHeld: async () => {
    throw Error("stock index down");
  },
});
stub("../managers/priceRead", {
  getLatestPrice: async () => {
    reads++;
    return null;
  },
  getLatestSplit: async () => {
    reads++;
    return null;
  },
});
stub("../valuation/valuationSnapshot", {
  readValuationVerdicts: async () => {
    reads++;
    return new Map();
  },
});
stub("../managers/source", {
  getManagerIndex: async () => ({
    managers: [
      {
        slug: "berkshire-hathaway",
        person: "Warren Buffett",
        name: "Berkshire",
      },
    ],
  }),
});
stub("../valuation/runValuation", {
  runValuation: () => {
    throw Error("Homepage must not run valuation engine");
  },
});
stub("../aggregations", {
  mostHeld: () => {
    throw Error("Homepage must not scan all managers");
  },
});
async function main() {
  const rows = await require("./readCompanyExamples").readCompanyExamples("en");
  assert.equal(rows.length, 3);
  assert.equal(reads, 8, "Three examples need at most 8 fixed reader calls");
  const index = await require("./searchIndex").readSearchIndex("en");
  assert.equal(index.stockAvailable, false);
  assert.equal(index.investorAvailable, true);
  assert.equal(index.items.length, 1);
  console.log(
    "readers.check OK: 8 bounded reads, no engine/scanning, partial search failure survives",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
