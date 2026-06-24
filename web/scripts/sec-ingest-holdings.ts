// Ingest SEC fundamentals for the FULL 13F holdings universe (not just the
// hardcoded COMPANY_UNIVERSE). Tickers are read from consensus_holdings, ranked
// by total held value, then intersected with SEC's official US-company map so we
// only fetch companies that actually have EDGAR filings. Idempotent per ticker.
//
// Usage:
//   SEC_USER_AGENT="Name email@example.com" npx tsx scripts/sec-ingest-holdings.ts --dry
//   SEC_USER_AGENT="Name email@example.com" npx tsx scripts/sec-ingest-holdings.ts [limit]
import fs from "node:fs";

function loadEnvLocal() {
  if (!fs.existsSync(".env.local")) return;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    process.env[key] = process.env[key] ?? line.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
  }
}

async function heldUniverse(getDb: () => any): Promise<string[]> {
  const valueByTicker = new Map<string, number>();
  let from = 0;
  for (;;) {
    const { data, error } = await getDb().from("consensus_holdings").select("ticker,total_value").range(from, from + 999);
    if (error) throw new Error(`consensus_holdings: ${error.message}`);
    if (!data?.length) break;
    for (const r of data as Array<{ ticker: string; total_value: number | null }>) {
      if (r.ticker) valueByTicker.set(r.ticker, (valueByTicker.get(r.ticker) ?? 0) + Number(r.total_value ?? 0));
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return [...valueByTicker.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

async function main() {
  loadEnvLocal();
  if (!process.env.SEC_USER_AGENT) {
    console.error('Set SEC_USER_AGENT, e.g. SEC_USER_AGENT="Compounder Research you@example.com"');
    process.exit(1);
  }
  const dry = process.argv.includes("--dry");
  const limitArg = process.argv.find((a) => /^\d+$/.test(a));
  const limit = limitArg ? Number(limitArg) : undefined;

  const { getDb } = await import("../src/lib/managers/db");
  const { getTickerCikMap } = await import("../src/lib/sec/ticker-cik");
  const { normalizeTicker } = await import("../src/lib/sec/company-universe");
  const { ingestCompany } = await import("../src/lib/sec/ingest");
  const { sleep } = await import("../src/lib/sec/sec-client");

  const held = await heldUniverse(getDb);
  const map = await getTickerCikMap(); // fetches SEC company_tickers.json (validates SEC_USER_AGENT)
  const resolvable = (t: string) => map.has(normalizeTicker(t)) || map.has(t.trim().toUpperCase());
  const target = held.filter(resolvable);
  const unresolvable = held.length - target.length;

  console.log(`held tickers: ${held.length} · resolvable US companies: ${target.length} · unresolvable (CUSIP/foreign/ETF): ${unresolvable}`);
  const run = limit ? target.slice(0, limit) : target;
  console.log(`will ingest: ${run.length}${limit ? ` (limited to ${limit})` : ""}`);
  console.log(`first 20: ${run.slice(0, 20).join(", ")}`);
  if (dry) return;

  const summary = { total: run.length, success: 0, foreign: 0, unresolved: 0, failed: 0 } as Record<string, number>;
  const failures: string[] = [];
  let i = 0;
  for (const ticker of run) {
    i++;
    try {
      const res = await ingestCompany(ticker);
      if (res.status === "success") summary.success++;
      else if (res.status === "unresolved") summary.unresolved++;
      else summary.failed++;
      if (res.foreign_issuer) summary.foreign++;
      if (res.status !== "success") failures.push(`${ticker}:${res.status}`);
    } catch (e) {
      summary.failed++;
      failures.push(`${ticker}:throw`);
      console.error(`  ${ticker} threw: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (i % 25 === 0 || i === run.length) {
      console.log(`[${i}/${run.length}] success=${summary.success} foreign=${summary.foreign} unresolved=${summary.unresolved} failed=${summary.failed}`);
    }
    await sleep(300);
  }

  console.log("\n=== DONE ===");
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length) console.log("non-success:", failures.join(", "));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
