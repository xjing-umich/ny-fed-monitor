/**
 * 一次性清理:删除 security_cusips 里损坏的 CUSIP 残留行。
 *
 * 背景:ingest-13f.ts 早期版本未关 fast-xml-parser 的 parseTagValue,
 * 把 CUSIP 当数字解析,产生 "37833100"(丢前导零)、"9.2343e+106"(科学计数法)等脏键。
 * 代码已修复 + 重新 ingest 后 holdings.cusip 已正确,但 security_cusips 里旧脏行仍残留,
 * 会让 /stocks/37833100 之类误命中。这里按"是否为合法 9 位字母数字 CUSIP"精确删除脏行,
 * 不动合法缓存。
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  console.error("缺少 Supabase 凭据 (SUPABASE_URL / SUPABASE_SERVICE_KEY)。");
  process.exit(1);
}

const VALID_CUSIP = /^[A-Za-z0-9]{9}$/;

async function main() {
  const db = createClient(sbUrl, sbKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  // 拉全量 cusip
  const all: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("security_cusips").select("cusip").range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) all.push(r.cusip);
    if (data.length < 1000) break;
  }

  const corrupt = all.filter((c) => !VALID_CUSIP.test(c));
  console.log(`security_cusips 总行数: ${all.length}, 损坏脏键: ${corrupt.length}`);
  if (corrupt.length) {
    console.log("待删除:", corrupt);
    const { error } = await db.from("security_cusips").delete().in("cusip", corrupt);
    if (error) throw new Error(`删除失败: ${error.message}`);
    console.log(`已删除 ${corrupt.length} 行脏键。`);
  } else {
    console.log("无脏键,无需清理。");
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
