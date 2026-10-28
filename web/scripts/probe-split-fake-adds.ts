/**
 * probe-split-fake-adds.ts — 量化拆股造成的 13F 假增持/假减持。只读。
 *
 * computeChanges 用原始股数相减(不调拆股)。两季之间若发生拆股,股数按拆股比例跳变,
 * 会被记成"加仓 +900%"(10 拆 1)或把真实减仓掩盖成加仓。本脚本对每位经理的 8 季相邻两季逐对扫描:
 *   A 类:stock_splits 表里该 ticker 在 (上季末, 本季末] 有拆股 → 已知被拆股污染的变动
 *   B 类:表里没有拆股,但股数比 ≈ 常见拆股比且市值几乎不变 → 疑似漏记拆股
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

const COMMON_RATIOS = [2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 40, 50];
// Yahoo 把分拆上市/股票股息也记成小数"拆股"(CMCSA 1.067、FDX 1.241),那是价格复权,股数不变。
// 真拆股 = 比例是小分母有理数(3:2、2:1、1:10…)且偏离 1 足够大。
function isRealSplit(r: number): boolean {
  if (r > 0.8 && r < 1.25) return false;
  return [1, 2, 3, 4].some((den) => Math.abs(r * den - Math.round(r * den)) < 1e-6 || Math.abs(den / r - Math.round(den / r)) < 1e-6);
}

async function main() {
  loadEnv();
  const { getDb, selectAllPages, hasSupabaseEnv } = await import("@/lib/managers/db");
  if (!hasSupabaseEnv()) { console.error("BLOCKED: 缺少 SUPABASE 凭据。"); process.exit(1); }
  const { getManagerDetail } = await import("@/lib/managers/supabase");
  const { getCusipMap } = await import("@/lib/managers/securities");
  const { computeChanges, holdingKey } = await import("@/lib/managers/assemble");
  const db = getDb();

  const { data: splitRows, error: sErr } = await selectAllPages(() => db.from("stock_splits").select("ticker,split_date,ratio").order("ticker"));
  if (sErr) throw new Error(sErr.message);
  const splits = new Map<string, { date: string; ratio: number }[]>();
  for (const s of (splitRows ?? []) as { ticker: string; split_date: string; ratio: number }[]) {
    const a = splits.get(s.ticker) ?? [];
    a.push({ date: s.split_date, ratio: Number(s.ratio) });
    splits.set(s.ticker, a);
  }
  console.log(`stock_splits: ${splitRows?.length ?? 0} 行, ${splits.size} 只 ticker`);

  const cusipMap = await getCusipMap();
  const { data: mgrs, error: mErr } = await db.from("managers").select("cik,slug,name");
  if (mErr) throw new Error(mErr.message);

  type Hit = { slug: string; pair: string; latestPair: boolean; ticker: string; kind: string; prev: number; cur: number; obs: number; split?: number; valRatio: number; value: number; verdict: string };
  const hits: Hit[] = [];
  const pseudo: string[] = [];
  let pairs = 0, changesTotal = 0, latestChanges = 0;
  const latestBadge: { slug: string; byCount: string; byCountAdj: string; byDollar: string }[] = [];

  for (const m of (mgrs ?? []) as { cik: string; slug: string; name: string }[]) {
    const d = await getManagerDetail(m.slug ?? m.cik);
    if (!d) continue;
    for (let i = 0; i + 1 < d.filings.length; i++) {
      const L = d.filings[i], P = d.filings[i + 1];
      if (!L.holdings.length || !P.holdings.length) continue;
      pairs++;
      const pm = new Map(P.holdings.map((h) => [holdingKey(h), h]));
      const changes = computeChanges(L.holdings, P.holdings);
      changesTotal += changes.length;
      if (i === 0) latestChanges += changes.length;
      const fakeKeys = new Set<string>();
      for (const c of changes) {
        if (c.kind !== "increased" && c.kind !== "decreased") continue;
        const ticker = cusipMap.get(c.cusip)?.ticker ?? null;
        const ph = pm.get(holdingKey(c))!;
        const obs = c.shares / c.prevShares;
        const valRatio = ph.value > 0 ? c.value / ph.value : NaN;
        const all = ticker ? (splits.get(ticker) ?? []).filter((s) => s.date > P.period && s.date <= L.period) : [];
        const inWindow = all.filter((s) => isRealSplit(s.ratio));
        if (all.length && !inWindow.length) pseudo.push(`${P.period}→${L.period} ${m.slug} ${ticker} 股数×${obs.toFixed(3)} 表内比例×${all.map((x) => x.ratio).join("×")}`);
        const split = inWindow.reduce((acc, s) => acc * s.ratio, 1);
        let verdict = "";
        if (inWindow.length) {
          const adj = obs / split; // 拆股调整后的真实股数比
          verdict = Math.abs(adj - 1) < 0.005 ? "纯拆股(实际未动)" : (adj > 1) === (obs > 1) ? "方向对、幅度错" : "方向反了";
        } else {
          const near = COMMON_RATIOS.flatMap((r) => [r, 1 / r]).find((r) => Math.abs(obs / r - 1) < 0.005);
          if (near && valRatio > 0.6 && valRatio < 1.6) verdict = `疑似漏记拆股(≈${near >= 1 ? near : `1/${Math.round(1 / near)}`})`;
        }
        if (!verdict) continue;
        fakeKeys.add(holdingKey(c));
        hits.push({ slug: m.slug, pair: `${P.period}→${L.period}`, latestPair: i === 0, ticker: ticker ?? c.cusip, kind: c.kind, prev: c.prevShares, cur: c.shares, obs, split: inWindow.length ? split : undefined, valRatio, value: c.value, verdict });
      }
      if (i === 0) {
        // 页面"整体加仓/减仓"现按只数判定;对比:剔除拆股污染后按只数、以及按估算美元(Δ股 × 本季末单价)判定。
        const buys = (cs: typeof changes) => cs.filter((c) => c.kind === "new" || c.kind === "increased").length;
        const sells = (cs: typeof changes) => cs.filter((c) => c.kind === "exited" || c.kind === "decreased").length;
        const tag = (b: number, s: number) => (b > s ? "加" : s > b ? "减" : "平");
        const clean = changes.filter((c) => !fakeKeys.has(holdingKey(c)));
        let net = 0;
        for (const c of clean) {
          const ph = pm.get(holdingKey(c));
          const px = c.shares > 0 ? c.value / c.shares : ph && ph.shares > 0 ? ph.value / ph.shares : 0;
          net += (c.shares - c.prevShares) * px;
        }
        latestBadge.push({ slug: m.slug, byCount: tag(buys(changes), sells(changes)), byCountAdj: tag(buys(clean), sells(clean)), byDollar: net > 0 ? "加" : net < 0 ? "减" : "平" });
      }
    }
  }

  const fmt = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${(n / 1e6).toFixed(0)}M`);
  console.log(`\n扫描 ${mgrs?.length} 位经理、${pairs} 个相邻季度对、${changesTotal} 条增减变动(最新一季 ${latestChanges} 条)`);
  const latest = hits.filter((h) => h.latestPair);
  for (const [label, rows] of [["全部 8 季", hits], ["最新一季(页面当前展示)", latest]] as const) {
    const by = new Map<string, number>();
    for (const h of rows) by.set(h.verdict.replace(/\(≈.*\)/, ""), (by.get(h.verdict.replace(/\(≈.*\)/, "")) ?? 0) + 1);
    console.log(`\n[${label}] 受拆股影响 ${rows.length} 条:`, Object.fromEntries(by));
  }
  console.log("\n最新一季明细(按持仓市值降序):");
  for (const h of latest.sort((a, b) => b.value - a.value)) {
    console.log(`  ${h.slug.padEnd(28)} ${h.ticker.padEnd(8)} ${h.kind.padEnd(9)} 股数×${h.obs.toFixed(3)}${h.split ? ` 拆股×${h.split}` : ""} 市值×${h.valRatio.toFixed(2)} ${fmt(h.value)}  → ${h.verdict}`);
  }
  console.log("\n历史季度明细(前 40 条,按市值降序):");
  for (const h of hits.filter((x) => !x.latestPair).sort((a, b) => b.value - a.value).slice(0, 40)) {
    console.log(`  ${h.pair} ${h.slug.padEnd(28)} ${h.ticker.padEnd(8)} ${h.kind.padEnd(9)} 股数×${h.obs.toFixed(3)}${h.split ? ` 拆股×${h.split}` : ""} 市值×${h.valRatio.toFixed(2)} ${fmt(h.value)} → ${h.verdict}`);
  }
  console.log(`\n表内"伪拆股"(分拆/股息复权,股数实际不变)命中 ${pseudo.length} 条,已不计入上面。样例:`);
  for (const x of pseudo.slice(0, 8)) console.log("  " + x);
  const tick = new Map<string, number>();
  for (const [t, a] of splits) for (const x of a) if (!isRealSplit(x.ratio)) tick.set(t, x.ratio);
  console.log(`stock_splits 中伪拆股事件涉及 ${tick.size} 只 ticker(也会误触发估值的拆股护栏):`, [...tick].slice(0, 15).map(([t, r]) => `${t}×${r}`).join(" "));
  const flipAdj = latestBadge.filter((b) => b.byCount !== b.byCountAdj);
  const flipDollar = latestBadge.filter((b) => b.byCount !== b.byDollar);
  console.log(`\n最新一季"整体加/减仓"徽章(${latestBadge.length} 位):剔除拆股后按只数会变的 ${flipAdj.length} 位;按美元判定与现在(按只数)不同的 ${flipDollar.length} 位`);
  for (const b of flipDollar) console.log(`  ${b.slug.padEnd(28)} 现在(只数)=${b.byCount} 剔拆股只数=${b.byCountAdj} 美元=${b.byDollar}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
