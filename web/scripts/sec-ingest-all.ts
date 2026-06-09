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
  const limitArg = process.argv[2] ? Number(process.argv[2]) : undefined;
  const { ingestAllCompanies } = await import("../src/lib/sec/ingest");
  const summary = await ingestAllCompanies(Number.isFinite(limitArg) ? limitArg : undefined);

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
