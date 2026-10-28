/**
 * probe-split-fake-adds.ts — 拆股修正验收(只读)。
 * 对每位经理,比较最新季变动的原始口径(不换算)与调整后口径(split_adjustments),列出所有变了的条目,
 * 并汇总 split_adjustments 的来源分布与共识榜受影响的票。基线(修正前)见 spec §一:最新季 24 条被真拆股污染。
 *
 * 用法: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-split-fake-adds.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): void {
  const candidates = [
    path.join(__dirname, "../.env.local"),
    "/Users/junlinzhu/Desktop/TheCompounder/ny-fed-monitor/web/.env.local",
    "/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web/.env.local",
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return;
  }
}

async function main() {
  loadEnv();
  const { getDb, hasSupabaseEnv } = await import("@/lib/managers/db");
  if (!hasSupabaseEnv()) { console.error("BLOCKED: 缺少 SUPABASE 凭据。"); process.exit(1); }
  const { getManagerDetail } = await import("@/lib/managers/supabase");
  const { holdingKey } = await import("@/lib/managers/assemble");
  const db = getDb();

  const { data: sa, error: saErr } = await db.from("split_adjustments").select("cusip,ticker,from_period,to_period,factor,source");
  if (saErr) throw new Error(`split_adjustments: ${saErr.message}(先执行 migration 并跑一次 npm run consensus)`);
  const bySource = (sa ?? []).reduce((m: Record<string, number>, r: { source: string }) => ((m[r.source] = (m[r.source] ?? 0) + 1), m), {});
  console.log(`split_adjustments: ${sa?.length ?? 0} 行`, bySource);

  const { data: mgrs } = await db.from("managers").select("slug,cik");
  let changed = 0, flipped = 0, vanished = 0;
  for (const m of (mgrs ?? []) as { slug: string; cik: string }[]) {
    const raw = await getManagerDetail(m.slug, { adjustSplits: false });
    const adj = await getManagerDetail(m.slug);
    if (!raw || !adj) continue;
    const am = new Map(adj.changes.map((c) => [holdingKey(c), c]));
    for (const rc of raw.changes) {
      const ac = am.get(holdingKey(rc));
      if (ac && ac.kind === rc.kind && ac.deltaPct === rc.deltaPct) continue;
      changed++;
      if (!ac) vanished++;
      else if ((rc.kind === "increased") !== (ac.kind === "increased")) flipped++;
      const pct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
      console.log(`  ${m.slug.padEnd(28)} ${rc.issuer.slice(0, 24).padEnd(24)} 原:${rc.kind} ${pct(rc.deltaPct)} → 调:${ac ? `${ac.kind} ${pct(ac.deltaPct)} ×${ac.splitFactor}` : "未变(纯拆股)"}`);
    }
  }
  console.log(`\n最新季被改正 ${changed} 条:方向翻转 ${flipped}、变为未变 ${vanished}、其余为幅度修正。基线:24 条(反向 11、纯拆股 3、幅度 10)。`);

  const { data: mv } = await db.from("consensus_moves").select("ticker,direction,manager_count").in("ticker", ["CVNA", "BKNG", "KLAC"]);
  console.log("共识榜(修正后):", (mv ?? []).map((r: { ticker: string; direction: string; manager_count: number }) => `${r.ticker} ${r.direction} ${r.manager_count}位`).join(" | "), "  基线:CVNA bought 8位、BKNG bought 7位、KLAC bought 3位");
}

main().catch((e) => { console.error(e); process.exit(1); });
