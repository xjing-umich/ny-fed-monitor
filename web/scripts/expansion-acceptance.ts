/**
 * 13F 扩容验收：采 consensus/valuation 指标，判 M1–M5。
 * 用法:
 *   npx tsx scripts/expansion-acceptance.ts snapshot --out config/expansion-baseline-b0.json
 *   npx tsx scripts/expansion-acceptance.ts check --b0 config/expansion-baseline-b0.json [--bw config/expansion-baseline-bw.json]
 * snapshot 无 --out 时打印 JSON 到 stdout。
 * check 若传 --write-bw <path> 会把当前指标写作 Bw。
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Metrics = {
  capturedAt: string;
  managers_json: number;
  managers_db: number;
  consensus_n: number;
  ge2_n: number;
  lonely_n: number;
  valued_n: number;
  valued_ratio: number;
};

function loadEnv(): Record<string, string> {
  const fileEnv: Record<string, string> = {};
  const envPath = path.join(__dirname, "../../.env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) fileEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return { ...fileEnv, ...process.env } as Record<string, string>;
}

function dbClient() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺 Supabase env");
  return createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });
}

async function countAll(db: ReturnType<typeof dbClient>, table: string, filter?: string): Promise<number> {
  let q = db.from(table).select("*", { count: "exact", head: true });
  if (filter === "ge2") q = q.gte("holder_count", 2);
  if (filter === "lonely") q = q.eq("holder_count", 1);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function capture(): Promise<Metrics> {
  const db = dbClient();
  const managersPath = path.join(__dirname, "../config/managers.json");
  const managers_json = (JSON.parse(fs.readFileSync(managersPath, "utf8")) as unknown[]).length;
  const managers_db = await countAll(db, "managers");
  const consensus_n = await countAll(db, "consensus_holdings");
  const ge2_n = await countAll(db, "consensus_holdings", "ge2");
  const lonely_n = await countAll(db, "consensus_holdings", "lonely");
  const valued_n = await countAll(db, "valuation_snapshot");
  const valued_ratio = consensus_n > 0 ? valued_n / consensus_n : 0;
  return {
    capturedAt: new Date().toISOString(),
    managers_json,
    managers_db,
    consensus_n,
    ge2_n,
    lonely_n,
    valued_n,
    valued_ratio,
  };
}

function pp(ratio: number): string {
  return (ratio * 100).toFixed(2) + "%";
}

function check(b0: Metrics, cur: Metrics, bw: Metrics | null): number {
  let failed = 0;
  const gate = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} ${name} | ${detail}`);
    if (!ok) failed++;
  };

  gate("M1", cur.managers_json === cur.managers_db, `json=${cur.managers_json} db=${cur.managers_db}`);
  console.log("SKIP M2 | 由本波 INGEST_ONLY 进程成功比 ≥90% 判定（看 ingest 日志）");

  const base = bw ?? b0;
  gate("M3", cur.consensus_n >= base.consensus_n && cur.ge2_n >= base.ge2_n,
    `consensus ${base.consensus_n}→${cur.consensus_n}; ge2 ${base.ge2_n}→${cur.ge2_n}`);

  const dCons = cur.consensus_n - base.consensus_n;
  const dLonely = cur.lonely_n - base.lonely_n;
  let m4 = true;
  let m4detail = "";
  if (dCons === 0) {
    m4 = dLonely === 0;
    m4detail = dLonely === 0 ? "Δconsensus=0 Δlonely=0 → N/A pass" : `Δconsensus=0 but Δlonely=${dLonely}`;
  } else {
    const ratio = dLonely / dCons;
    m4 = ratio <= 0.6;
    m4detail = `Δlonely/Δconsensus=${ratio.toFixed(3)} (≤0.6)`;
  }
  gate("M4", m4, m4detail);

  const dropPp = (b0.valued_ratio - cur.valued_ratio) * 100;
  const m5 = dropPp <= 3 || cur.valued_n >= b0.valued_n;
  gate("M5", m5,
    `ratio ${pp(b0.valued_ratio)}→${pp(cur.valued_ratio)} (Δ=${dropPp.toFixed(2)}pp); valued_n ${b0.valued_n}→${cur.valued_n}`);

  console.log("SKIP M6 | 手工页面抽查（每波：Task 2/3 Step M6；最终回归：Task 4）");
  return failed;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const arg = (name: string) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  if (cmd === "snapshot") {
    const m = await capture();
    const out = arg("--out");
    const json = JSON.stringify(m, null, 2) + "\n";
    if (out) {
      fs.writeFileSync(path.resolve(out), json);
      console.log(`wrote ${out}`);
    }
    console.log(json);
    return;
  }

  if (cmd === "check") {
    const b0path = arg("--b0");
    if (!b0path) throw new Error("check 需要 --b0 <path>");
    const b0 = JSON.parse(fs.readFileSync(path.resolve(b0path), "utf8")) as Metrics;
    const cur = await capture();
    const writeBw = arg("--write-bw");
    if (writeBw) fs.writeFileSync(path.resolve(writeBw), JSON.stringify(cur, null, 2) + "\n");
    const bwPath = arg("--bw");
    const bw = bwPath
      ? (JSON.parse(fs.readFileSync(path.resolve(bwPath), "utf8")) as Metrics)
      : null;
    console.log("current:", cur);
    const failed = check(b0, cur, bw);
    process.exitCode = failed > 0 ? 1 : 0;
    return;
  }

  console.error("用法: snapshot [--out path] | check --b0 path [--bw path] [--write-bw path]");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
