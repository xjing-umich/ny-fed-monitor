/** 滚动清理: 删除 prices 中早于「近 N 个月」窗口的旧行, 控制 Supabase DB Size。
 *  用法: npm run prices:prune [-- 月数]
 *  例:   npm run prices:prune        (保留近 24 个月, 删更早)
 *        npm run prices:prune -- 18  (保留近 18 个月)
 *
 *  设计要点:
 *  - 页面只读「每个 ticker 最新一行」(getLatestPrice); getPriceHistory(默认365天)
 *    当前零调用。保留 24 个月给未来走势图/估值带留足缓冲, 已远超所需。
 *  - 每日 cron(prices)只写当天一行、不回填 → 删掉的旧行不会被写回。
 *  - 纯 REST DELETE(行级锁, 不阻塞 22:00 写入); **不做 VACUUM**(REST 跑不了)。
 *    稳态下每周删的量很小, autovacuum 标记的空洞会被后续 insert 自然复用, 表体积平衡。
 *    唯有一次性大删(如首次砍掉数年历史)才需手动在 SQL Editor 跑 VACUUM FULL 回收磁盘。
 *  - 按月分批删, 避免单条 DELETE 撞 statement timeout; 每批失败重试一次。 */
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
const iso = (d: Date) => d.toISOString().slice(0, 10);
function addMonths(d: Date, n: number): Date {
  const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x;
}

async function main() {
  const env = loadEnv();
  const months = Number(process.argv[2]) || 24;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });

  // 滚动 cutoff: 今天往前推 months 个月; 删 date < cutoff。
  const cutoff = iso(addMonths(new Date(), -months));
  console.log(`保留窗口: 近 ${months} 个月 → 删除 date < ${cutoff}`);

  // 找最老一行, 没有则空表直接返回。
  const { data: oldestRow, error: oErr } = await db
    .from("prices").select("date").order("date", { ascending: true }).limit(1);
  if (oErr) throw new Error(`oldest read: ${oErr.message}`);
  const oldest = oldestRow?.[0]?.date as string | undefined;
  if (!oldest) { console.log("prices 空表, 无需清理。"); return; }
  if (oldest >= cutoff) { console.log(`最老行 ${oldest} 已在窗口内, 无需清理。`); return; }

  // 从最老月份按月批删到 cutoff。
  let start = new Date(`${oldest.slice(0, 7)}-01T00:00:00Z`);
  let totalDeleted = 0;
  while (iso(start) < cutoff) {
    const next = addMonths(start, 1);
    const upper = iso(next) > cutoff ? cutoff : iso(next);
    const lower = iso(start);

    let deleted = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { count, error } = await db
        .from("prices").delete({ count: "exact" })
        .gte("date", lower).lt("date", upper);
      if (!error) { deleted = count ?? 0; break; }
      if (attempt === 2) throw new Error(`delete ${lower}..${upper} 失败(重试后): ${error.message}`);
      console.warn(`  ${lower}..${upper} 出错, 重试: ${error.message}`);
      await sleep(1000);
    }
    console.log(`  ${lower} .. ${upper} : 删除 ${deleted}`);
    totalDeleted += deleted;
    start = next;
    await sleep(300);
  }
  console.log(`清理完成: 删除 ${totalDeleted} 行 (cutoff ${cutoff})。`);
  console.log("提示: 日常滚动删依赖 autovacuum 复用空间, 无需 VACUUM; 仅一次性大删后才手动 VACUUM FULL。");
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
