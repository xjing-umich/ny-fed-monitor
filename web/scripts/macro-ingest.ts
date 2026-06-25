/**
 * 宏观快照摄取入口: 实时抓 NY Fed/FRED/Treasury → 分析 → 整段 DataPayload 物化到 macro_snapshot。
 * 用法: npm run macro:ingest(本地读仓库根 .env.local;CI 用 env)。
 *
 * 这是**唯一**做宏观实时抓取的地方 —— /macro 页只读快照,故构建期不再触外部 API,
 * 不会再因外部慢/挂导致静态导出超时(本次部署失败的根因)。
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { buildAllSections } from "../src/lib/build";

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

async function main() {
  const env = loadEnv();
  // 把数据源可能用到的 key(如 FRED_API_KEY)注入 process.env,供 build.ts 的 sources 读取。
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });

  console.log("抓取宏观数据(实时 NY Fed/FRED/Treasury)…");
  const payload = await buildAllSections();
  const sections = Object.keys(payload.sections ?? {}).length;
  const live = payload.summary?.live_sections?.length ?? 0;
  const unavailable = payload.summary?.unavailable_sections?.length ?? 0;

  // 整段覆盖单行快照(id=1)。computed_at 走 DB 默认 now()。
  const { error } = await db
    .from("macro_snapshot")
    .upsert({ id: 1, payload, as_of: payload.as_of ?? "" }, { onConflict: "id" });
  if (error) throw new Error(`macro_snapshot upsert 失败: ${error.message}`);

  console.log(`宏观快照完成: ${sections} sections(${live} live / ${unavailable} unavailable), as_of ${payload.as_of}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
