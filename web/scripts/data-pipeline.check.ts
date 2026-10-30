import { spawnSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(__dirname, "..");
const checks = [
  "src/lib/securities/identity.check.ts",
  "scripts/lib/writeFailures.check.ts",
  "src/lib/sec/read-boundaries.check.ts",
  "src/app/api/sec/fundamentals/latest/route.check.ts",
  "src/lib/sec/normalize-facts.check.ts",
  "src/lib/stocks/financialDates.check.ts",
  "src/lib/revalidate/targets.check.ts",
  "scripts/lib/fundamentalQueue.check.ts",
  "src/lib/sec/publicationFingerprint.check.ts",
  "scripts/lib/valuationPublication.check.ts",
  "src/lib/valuation/modelVersion.check.ts",
];
for (const check of checks) {
  const r = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      "--tsconfig",
      "scripts/tsconfig.json",
      check,
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (r.error || r.status !== 0) process.exit(1);
}
console.log(`data-pipeline.check OK (${checks.length} behavior checks)`);
