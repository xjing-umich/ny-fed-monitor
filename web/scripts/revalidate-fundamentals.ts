import fs from "node:fs";
import { getDb } from "../src/lib/managers/db";
import { refreshFundamentalQueue } from "../src/lib/sec/fundamentalPublication";
async function main() {
  const secret = process.env.INGEST_SECRET;
  if (!secret) throw new Error("Missing ingest credentials");
  const count = await refreshFundamentalQueue(getDb(), async (tickers) => {
    if (process.env.GITHUB_OUTPUT)
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `changed_tickers=${JSON.stringify(tickers)}\n`,
      );
    for (let from = 0; from < tickers.length; from += 100) {
      const r = await fetch(
        "https://thecompounder.fyi/api/revalidate?source=fundamentals",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tickers: tickers.slice(from, from + 100) }),
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!r.ok || (await r.json()).ok !== true)
        throw new Error(
          `Financial cache publication failed (HTTP ${r.status})`,
        );
    }
  });
  console.log(`Acknowledged ${count} refreshed financial page generations`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Fundamental refresh failed");
  process.exitCode = 1;
});
