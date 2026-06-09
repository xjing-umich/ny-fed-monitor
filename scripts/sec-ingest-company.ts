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
  const ticker = process.argv[2];

  if (!ticker) {
    console.error("Usage: npm run sec:ingest -- AAPL");
    process.exit(1);
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
