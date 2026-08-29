/**
 * 校验 company_fundamentals_periods 的显式列白名单没有相对线上表漂移。
 * 跑法: npx tsx src/lib/sec/columns.check.ts
 *
 * 白名单最大的风险是「表加了列，白名单没跟」—— 读取侧会静默缺字段，不报错、不崩，
 * 只是数据凭空少一块。这里对着线上表把列集比死。
 */
import { readFileSync } from "node:fs";
import { CFP_SELECT, CFP_COLUMNS, CFP_OMITTED_COLUMNS } from "./columns";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) return console.log(`  ✓ ${name}`);
  failed++;
  console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
}

console.log("CFP 列白名单一致性");

// 1) 两种形态必须同源 —— CFP_SELECT 是字面量(供 supabase-js 推导),
//    CFP_COLUMNS 是数组(供校验),手改一个忘了另一个就会静默分叉。
check(
  "CFP_SELECT 与 CFP_COLUMNS 同源",
  CFP_COLUMNS.join(",") === CFP_SELECT,
  `join=${CFP_COLUMNS.join(",").slice(0, 80)}…\n      lit =${CFP_SELECT.slice(0, 80)}…`,
);

// 2) 白名单与刻意省略的列之间不得重叠。
const omitted = new Set<string>(CFP_OMITTED_COLUMNS);
check(
  "白名单与省略列无交集",
  CFP_COLUMNS.every((c) => !omitted.has(c)),
  CFP_COLUMNS.filter((c) => omitted.has(c)).join(", "),
);

// 3) 对着线上表比列集。没有 env 就跳过(本地无凭据时不阻塞 tsc 门)。
function readEnv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const m = readFileSync(".env.local", "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return m?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

async function main() {
  const url = readEnv("SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_KEY");

  if (!url || !key) {
    console.log("  – 线上列集比对: 无 SUPABASE_URL/SERVICE_KEY，跳过");
  } else {
    const res = await fetch(
      `${url}/rest/v1/company_fundamentals_periods?select=*&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const rows = (await res.json()) as Record<string, unknown>[];
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log("  – 线上列集比对: 表空或查询失败，跳过");
    } else {
      const live = new Set(Object.keys(rows[0]));
      const declared = new Set<string>([...CFP_COLUMNS, ...CFP_OMITTED_COLUMNS]);
      const missing = [...live].filter((c) => !declared.has(c));
      const extra = [...declared].filter((c) => !live.has(c));
      check("线上新增列已进白名单", missing.length === 0, `线上有而本地未声明: ${missing.join(", ")}`);
      check("白名单无已不存在的列", extra.length === 0, `本地声明但线上没有: ${extra.join(", ")}`);
      check("raw_facts 确实被省略", live.has("raw_facts") && omitted.has("raw_facts"));
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} 项失败`);
    process.exit(1);
  }
  console.log("\n全部通过");
}

void main();
