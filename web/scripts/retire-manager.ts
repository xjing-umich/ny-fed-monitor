/**
 * 退役 manager 的 DB 清理：按 cik 或 slug 删除 holdings → filings → managers（顺序删，无级联依赖）。
 * 用法: npx tsx scripts/retire-manager.ts <cik-or-slug> [<cik-or-slug> ...]
 * 也用于换继任 CIK 前清理旧 CIK 行（managers.slug 唯一，旧行不删会撞 upsert）。
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 凭据优先 process.env，本地回退仓库根 .env.local（与 ingest-13f.ts 同款）。
const fileEnv: Record<string, string> = {};
const envPath = path.join(__dirname, "../../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) fileEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
const env = { ...fileEnv, ...process.env } as Record<string, string>;
const sbUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!sbUrl || !sbKey) {
  console.error("缺 Supabase env（SUPABASE_URL / SUPABASE_SERVICE_KEY）。");
  process.exit(1);
}
const db = createClient(sbUrl, sbKey, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket as unknown as never },
});

async function retire(cikOrSlug: string): Promise<void> {
  const { data: mgrs, error } = await db
    .from("managers").select("cik,slug,name")
    .or(`cik.eq.${cikOrSlug},slug.eq.${cikOrSlug}`).limit(1);
  if (error) throw new Error(`managers 查询失败: ${error.message}`);
  const m = mgrs?.[0];
  if (!m) { console.warn(`[${cikOrSlug}] DB 里不存在，跳过。`); return; }

  const { data: filings, error: fe } = await db.from("filings").select("id").eq("cik", m.cik);
  if (fe) throw new Error(`filings 查询失败: ${fe.message}`);
  const ids = (filings ?? []).map((f) => f.id);

  if (ids.length) {
    const { error: he } = await db.from("holdings").delete().in("filing_id", ids);
    if (he) throw new Error(`holdings 删除失败: ${he.message}`);
  }
  const { error: fde } = await db.from("filings").delete().eq("cik", m.cik);
  if (fde) throw new Error(`filings 删除失败: ${fde.message}`);
  const { error: me } = await db.from("managers").delete().eq("cik", m.cik);
  if (me) throw new Error(`managers 删除失败: ${me.message}`);
  console.log(`[${m.slug}] 已退役（cik ${m.cik}，${ids.length} 期 filings 及其 holdings 已删）。`);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error("用法: npx tsx scripts/retire-manager.ts <cik-or-slug> ..."); process.exit(1); }
  for (const a of args) await retire(a);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
