import fs from "node:fs";

function loadEnvLocal() {
  if (!fs.existsSync(".env.local")) return;
  const lines = fs.readFileSync(".env.local", "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^"(.*)"$/, "$1");
    process.env[key] = process.env[key] ?? value;
  }
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const ticker = args.find((a) => !a.startsWith("--"));

  if (!ticker) {
    console.error("Usage: npm run sec:ingest -- AAPL [--dry-run]");
    process.exit(1);
  }

  // --dry-run:只走 SEC 取数 + 归一,打印将写入的期数,不碰数据库。
  if (dryRun) {
    const { prepareCompanyFundamentals } = await import("../src/lib/sec/ingest");
    const { resolveTickerCik } = await import("../src/lib/sec/ticker-cik");
    const symbol = ticker.trim().toUpperCase();
    const match = await resolveTickerCik(symbol);
    if (!match) throw new Error(`${symbol}: ticker 无法解析到 SEC CIK`);
    const { normalized, backfill, predecessor } = await prepareCompanyFundamentals(symbol, match);
    console.log(`${symbol} cik=${match.cik} 前身=${predecessor?.cik ?? "无"} 回填=${backfill.filled.length} 失败=${backfill.failed.length}`);
    for (const r of [...normalized.annual, ...normalized.quarterly]) {
      console.log(`  ${r.fiscal_period?.padEnd(2)} ${r.period_end} ${r.form} ${r.accession_number} filed=${r.filing_date} revenue=${r.revenue} net_income=${r.net_income} ${r.data_quality}`);
    }
    return;
  }

  const { ingestCompany } = await import("../src/lib/sec/ingest");
  const result = await ingestCompany(ticker);
  console.log(JSON.stringify(result, null, 2));

  if (result.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
