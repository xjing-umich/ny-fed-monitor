import assert from "node:assert/strict";
process.env.SUPABASE_URL = "https://identity-fixture.invalid";
process.env.SUPABASE_SERVICE_KEY = "fixture-key";
const requests: string[] = [];
globalThis.fetch = async (input) => {
  const u = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  requests.push(u.pathname);
  let rows: unknown = [];
  if (u.pathname.endsWith("/prices"))
    rows = [
      {
        ticker: u.searchParams.get("ticker")?.slice(3) ?? "SATS",
        close: 95.2,
        date: "2026-10-29",
        currency: "USD",
        source: "yahoo",
      },
    ];
  if (u.pathname.endsWith("/stock_splits"))
    rows = [{ split_date: "2026-06-01", ratio: 10 }];
  return new Response(JSON.stringify(rows), {
    headers: { "content-type": "application/json" },
  });
};
async function main() {
  const { getLatestPrice, getPriceHistory, getLatestSplit } = await import(
    "../managers/priceRead"
  );
  const { resolveDaily, resolveRecent, resolveHistory, YahooChartProvider } =
    await import("../prices/providers");
  let providerCalls = 0;
  const quote = {
    ticker: "SATS",
    close: 95.2,
    date: "2026-10-29",
    currency: "USD",
    source: "yahoo" as const,
  };
  const providers = [
    {
      name: "yahoo" as const,
      fetchDaily: async () => {
        providerCalls++;
        return quote;
      },
      fetchRecent: async () => {
        providerCalls++;
        return [quote];
      },
      fetchHistory: async () => {
        providerCalls++;
        return [quote];
      },
    },
  ];
  const direct = new YahooChartProvider(async () => {
    providerCalls++;
    return Response.json({
      chart: {
        result: [
          {
            timestamp: [1793280600],
            indicators: { quote: [{ close: [95.2] }] },
            events: {
              splits: {
                one: { date: 1793280600, numerator: 10, denominator: 1 },
              },
            },
          },
        ],
      },
    });
  });
  const failures: string[] = [];
  for (const [name, test] of [
    [
      "direct Yahoo history",
      async () => assert.deepEqual(await direct.fetchHistory("SATS", 1), []),
    ],
    [
      "direct Yahoo splits",
      async () => assert.deepEqual(await direct.fetchSplits("SATS"), []),
    ],
    [
      "stored latest quote",
      async () => assert.equal(await getLatestPrice("SATS"), null),
    ],
    [
      "stored price history",
      async () => assert.deepEqual(await getPriceHistory("SATS"), []),
    ],
    [
      "stored splits",
      async () => assert.equal(await getLatestSplit("SATS"), null),
    ],
    [
      "provider daily",
      async () => assert.equal(await resolveDaily("sats", providers), null),
    ],
    [
      "provider recent",
      async () => assert.deepEqual(await resolveRecent("SATS", providers), []),
    ],
    [
      "provider history",
      async () =>
        assert.deepEqual(await resolveHistory("SATS", 1, providers), []),
    ],
  ] as const) {
    try {
      await test();
    } catch {
      failures.push(name);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `Quarantined security leaked through: ${failures.join(", ")}`,
  );
  assert.equal(
    providerCalls,
    0,
    "quarantined prices must not be fetched or stored",
  );
  assert.equal(
    requests.length,
    0,
    "known contaminated price/split rows must not be read",
  );
  assert.equal(
    (await getLatestPrice("MSFT"))?.close,
    95.2,
    "unaffected ticker remains available",
  );
  const { prepareCompanyFundamentals } = await import("../sec/ingest");
  const before = requests.length;
  await assert.rejects(
    () =>
      prepareCompanyFundamentals("SATS", {
        ticker: "SATS",
        normalizedTicker: "SATS",
        cik: "0001920406",
        companyName: "Strive, Inc.",
      }),
    /identity|quarantin/i,
  );
  assert.equal(
    requests.length,
    before,
    "quarantine rejects SEC substitution before fetching/mutating financial data",
  );
  console.log("security identity boundary checks OK");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
