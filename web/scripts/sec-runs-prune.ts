/** 滚动清理: 删除 sec_ingest_runs 中早于「近 N 天」的旧行, 控制 Supabase DB Size。
 *  用法: npm run sec:runs:prune [-- 天数]
 *  例:   npm run sec:runs:prune        (保留近 30 天)
 *        npm run sec:runs:prune -- 14  (保留近 14 天)
 *
 *  设计要点:
 *  - 这张表是**按 ticker 每次 ingest 写一行**的纯日志(src/lib/sec/ingest.ts 的
 *    startRun/finishRun 只 insert+update),全仓**零读取点**,建表时也没有任何 TTL
 *    → 每周六 sec:ingest 跑一轮就 +1k 行,已积到约 29k 行 / 10 MB 且只增不减。
 *  - 保留 30 天 ≈ 最近 4 轮 ingest,纯粹为了留排障窗口(查某票某轮为什么失败),
 *    没有任何代码依赖它。真数据校准: 2026-08-29 实测全表 29,039 行只跨 81 天
 *    (2026-06-09 起),所以 90 天窗口一行都删不掉 —— 别凭直觉给日志表设宽窗口,
 *    先量一下它的实际跨度。30 天删 70%(约 20.4k 行 / 7 MB),并给这张表设了稳态上限。
 *  - 注意 price_ingest_runs 不在此列: 它每天只写一行(共 58 行),而且 watchdog
 *    要读它最近一次成功记录(lib/health/gather.ts),不该被这个脚本碰。
 *  - 纯 REST DELETE(行级锁); 不做 VACUUM(稳态靠 autovacuum 复用空间)。
 *    首次大删后若要立刻回收磁盘, 需手动在 SQL Editor 跑 VACUUM FULL。
 *  - 按周分批删, 避免单条 DELETE 撞 statement timeout; 每批失败重试一次。 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../../.env.local");
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...out, ...process.env } as Record<string, string>;
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

async function main() {
  const env = loadEnv();
  const days = Number(process.argv[2]) || 30;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });

  const cutoff = addDays(new Date(), -days).toISOString();
  console.log(`保留窗口: 近 ${days} 天 → 删除 started_at < ${cutoff}`);

  const { data: oldestRow, error: oErr } = await db
    .from("sec_ingest_runs").select("started_at").order("started_at", { ascending: true }).limit(1);
  if (oErr) throw new Error(`oldest read: ${oErr.message}`);
  const oldest = oldestRow?.[0]?.started_at as string | undefined;
  if (!oldest) { console.log("sec_ingest_runs 空表, 无需清理。"); return; }
  if (oldest >= cutoff) { console.log(`最老行 ${oldest} 已在窗口内, 无需清理。`); return; }

  let start = new Date(oldest);
  let totalDeleted = 0;
  while (start.toISOString() < cutoff) {
    const next = addDays(start, 7);
    const upper = next.toISOString() > cutoff ? cutoff : next.toISOString();
    const lower = start.toISOString();

    let deleted = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { count, error } = await db
        .from("sec_ingest_runs").delete({ count: "exact" })
        .gte("started_at", lower).lt("started_at", upper);
      if (!error) { deleted = count ?? 0; break; }
      if (attempt === 2) throw new Error(`delete ${lower}..${upper} 失败(重试后): ${error.message}`);
      console.warn(`  ${lower}..${upper} 出错, 重试: ${error.message}`);
      await sleep(1000);
    }
    console.log(`  ${lower.slice(0, 10)} .. ${upper.slice(0, 10)} : 删除 ${deleted}`);
    totalDeleted += deleted;
    start = next;
    await sleep(300);
  }
  console.log(`清理完成: 删除 ${totalDeleted} 行 (cutoff ${cutoff})。`);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
