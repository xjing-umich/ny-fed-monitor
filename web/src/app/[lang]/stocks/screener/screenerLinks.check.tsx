// Actual screener rendering + paged link lookup; fixture data only.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import type { ScreenerRow } from "@/lib/valuation/valuationSnapshot";

const require = createRequire(import.meta.url);
const rows: ScreenerRow[] = Array.from({ length: 64 }, (_, i) => ({
  ticker: i === 0 ? "LIVE" : i === 1 ? "TYL" : i === 60 ? "TAIL" : i === 61 ? "EXIT" : i === 62 ? "STALE" : i === 63 ? "UNK" : `F${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + i % 26)}`,
  fundamentalsDate:"2026-10-31",requiredMargin:1/3,strikePrice:40,priceSource:"fixture",
  intrinsicValue:100,referenceValue:100,referenceKind:"oe_dcf_neutral",
  publication:{identityKey:`fixture:${i}`,revisionId:"fixture",ticker:`F${i}`,priceDate:"2026-10-30",computedAt:"2026-10-31",attributes:{}},
  issuer: `Fixture issuer ${i}`, bucket: "below", inStrikeZone: true,
  rangeLo: 80, rangeHi: 150, price: 50, priceDate: "2026-10-30",
  marginPct: 0.5 - i / 1000, coverage: "full", reliable: true,
  holderCount: 100 - i, securityUnit: "share", computedAt: "2026-10-31T01:00:00Z",
}));
const id = require.resolve("../../../../lib/valuation/valuationSnapshot");
require.cache[id] = { id, filename: id, loaded: true, exports: {
  readScreenInputs: async () => ({values:rows,holdings:new Map(rows.map(row=>[row.ticker,{issuer:row.issuer,holderCount:row.holderCount}]))}),
} } as NodeJS.Module;
const { ScreenerPage } = require("./_screenerPage");

async function main() {
  const saved = { fetch: globalThis.fetch, Date: globalThis.Date, error: console.error, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  class FixtureDate extends saved.Date {
    constructor(value?: string | number) { super(value ?? "2026-10-31T00:00:00Z"); }
    static now() { return new saved.Date("2026-10-31T00:00:00Z").getTime(); }
  }
  globalThis.Date = FixtureDate as typeof Date;
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_KEY = "local-test-only";
  let unavailable = false;
  let lookups = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, "http://127.0.0.1:54321", "never access external services");
    assert.equal(url.pathname, "/rest/v1/consensus_stock_holders");
    assert.equal(url.searchParams.get("select"), "ticker,kind,period");
    lookups++;
    if (unavailable) return Response.json({ message: "fixture lookup failure" }, { status: 500 });
    return Response.json([
      { ticker: "LIVE", kind: "new", period: "2026-09-30" },
      { ticker: "TAIL", kind: "unchanged", period: "2026-06-30" },
      { ticker: "TYL", kind: "exited", period: "2026-09-30" },
      { ticker: "EXIT", kind: "exited", period: "2026-06-30" },
      { ticker: "STALE", kind: "unchanged", period: "2025-12-31" },
    ]);
  };
  try {
    for (const lang of ["en", "zh"] as const) for (const view of ["all", "below", "strike_zone", "conviction"] as const) for (const sort of ["margin", "holders"] as const) {
      const html = renderToStaticMarkup(await ScreenerPage({ lang, view, sort }));
      const prefix = lang === "zh" ? "/zh" : "";
      for (const ticker of ["LIVE", "TAIL"]) assert.ok(html.includes(`href="${prefix}/stocks/${ticker}"`), `${ticker}: keep available head/tail links`);
      for (const ticker of ["TYL", "EXIT", "STALE", "UNK"]) {
        assert.ok(html.includes(ticker), `${ticker}: keep valuation labels`);
        assert.ok(!html.includes(`/stocks/${ticker}`), `${ticker}: no broken DOM or JSON-LD destination`);
      }
      const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
      const list = ld.find((o: { "@type": string }) => o["@type"] === "CollectionPage").mainEntity;
      assert.equal(list.numberOfItems, rows.length, "keep visible total");
      assert.equal(list.itemListElement.length, rows.length, "keep all structured rows");
      for (const [i, row] of rows.entries()) {
        const item = list.itemListElement[i];
        assert.equal(item.position, i + 1, "keep original ranking");
        assert.ok(item.name.includes(row.ticker));
        assert.equal(item.url, ["LIVE", "TAIL"].includes(row.ticker) ? `https://thecompounder.fyi${prefix}/stocks/${row.ticker}` : undefined);
      }
    }
    assert.ok(lookups > 0, "eligibility comes from real holder evidence");
    unavailable = true;
    console.error = () => {};
    for (const lang of ["en", "zh"] as const) {
      const html = renderToStaticMarkup(await ScreenerPage({ lang, view: "all", sort: "margin" }));
      assert.ok(html.includes("LIVE") && html.includes("TYL") && html.includes("TAIL"), "lookup failure retains valuation rows");
      assert.ok(!/\/stocks\/(?:LIVE|TYL|TAIL|EXIT|STALE|UNK)/.test(html), "lookup failure cannot advertise unverified destinations");
    }
  } finally {
    globalThis.fetch = saved.fetch;
    globalThis.Date = saved.Date;
    console.error = saved.error;
    for (const [key, value] of [["SUPABASE_URL", saved.url], ["SUPABASE_SERVICE_KEY", saved.key]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  console.log("screenerLinks.check OK (en/zh, 4 views, 2 sorts, head/tail, lookup failure)");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
