/**
 * 数据审计入口(全程只读):拉生产快照 → 六组检查 → 中文摘要 → 与上次结果对比。
 *
 * 用法: npm run audit:data [-- --reuse-snapshot] [-- --env-file <path>]
 *
 * 环境变量优先取进程环境里的 SUPABASE_URL / SUPABASE_SERVICE_KEY;都没有时临时执行
 *   vercel env pull <临时文件> --environment=production --cwd <web 目录>
 * 读完即删,不碰 web/.env.local。web 目录没有 .vercel/ 链接(如 git worktree)时,用 AUDIT_VERCEL_CWD 指向已链接的目录。
 *
 * 结果写到 web/.audit/(已 gitignore):snapshot/ 只留最近一次快照,runs/<时间>/ 保存每次的 result.json 与 summary.md。
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { readOnlyClient, takeSnapshot, type SnapshotMeta } from "./snapshot";
import { runChecks, type AuditResult } from "./checks";
import { renderSummary } from "./report";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(WEB, ".audit");
const SNAP = path.join(OUT, "snapshot");
const RUNS = path.join(OUT, "runs");

function parseEnvFile(p: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function pullProductionEnv(): Record<string, string> {
  const cwd = process.env.AUDIT_VERCEL_CWD || WEB;
  if (!fs.existsSync(path.join(cwd, ".vercel/project.json")))
    throw new Error(`${cwd} 没有 .vercel/project.json;请设 AUDIT_VERCEL_CWD 指向已 vercel link 的 web 目录,或用 --env-file`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "audit-env-"));
  const file = path.join(tmp, ".env.production");
  try {
    const r = spawnSync("vercel", ["env", "pull", file, "--environment=production", "--cwd", cwd, "--yes"], { stdio: ["ignore", "ignore", "inherit"] });
    if (r.status !== 0) throw new Error(`vercel env pull 失败(exit ${r.status})`);
    return parseEnvFile(file);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function credentials(args: string[]): { url: string; key: string } {
  const i = args.indexOf("--env-file");
  let env: Record<string, string | undefined> = process.env;
  if (i >= 0) env = { ...parseEnvFile(args[i + 1]), ...process.env };
  else if (!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)) env = { ...pullProductionEnv(), ...process.env };
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  return { url, key };
}

function previousResult(): AuditResult | null {
  if (!fs.existsSync(RUNS)) return null;
  for (const d of fs.readdirSync(RUNS).sort().reverse()) {
    const p = path.join(RUNS, d, "result.json");
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  let meta: SnapshotMeta;
  if (args.includes("--reuse-snapshot")) {
    meta = JSON.parse(fs.readFileSync(path.join(SNAP, "_meta.json"), "utf8"));
    console.log(`复用快照(拉取于 ${meta.fetchedAt})`);
  } else {
    const { url, key } = credentials(args);
    console.log("拉取生产只读快照…");
    fs.rmSync(SNAP, { recursive: true, force: true });
    meta = await takeSnapshot(readOnlyClient(url, key), SNAP, new URL(url).host, console.log);
  }
  const result = runChecks(SNAP, path.join(WEB, "config/managers.json"), meta);
  const prev = previousResult();
  const summary = renderSummary(result, prev);
  const runDir = path.join(RUNS, result.runAt.replace(/[-:]/g, "").replace("T", "-").slice(0, 15));
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "result.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(runDir, "summary.md"), summary);
  fs.writeFileSync(path.join(OUT, "latest.md"), summary);
  console.log("\n" + summary);
  console.log(`摘要已写入 ${path.relative(process.cwd(), path.join(runDir, "summary.md"))}`);
}
main().catch((e) => {
  console.error("审计失败:", e);
  process.exit(1);
});
