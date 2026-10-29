/** check:facts 首批门禁:不拉生产数据,不固定历史实时数字。
 * 验证首页/筛选器已确认与待确认计数链路、相对区间与相对内在价值的区别。
 * 投资人分母、股票全集、增速来源等仍由各自的数据检查负责;这不是完整线上审计。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const checks = [
  "src/app/[lang]/stocks/screener/screenerCounts.check.tsx",
  "src/lib/valuation/bandPosition.check.ts",
  "src/lib/valuation/rangeGauge.check.tsx",
  "src/lib/valuation/valuationLabel.check.ts",
  "src/lib/valuation/asOf.check.ts",
];
for (const check of checks) {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "--tsconfig", "scripts/tsconfig.json", check], { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(`FAIL facts: ${check}`, result.error ?? "");
    process.exit(1);
  }
}
console.log(`facts.check OK (${checks.length} checks; local fixtures, no live-data audit)`);
