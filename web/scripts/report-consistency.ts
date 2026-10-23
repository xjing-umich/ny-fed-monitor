/**
 * 报告 vs 实时共识表逐数核对。只在两边是同一批投资人时才判失败:
 * 实时页的买卖只算“最新申报 == 有效变动季”的活跃投资人,报告算所有已申报 P 的活跃投资人;
 * 两边 cohort 不同(有人已申报下一季、截止后才申报、有效季还不是 P、新纳入无上季)时只列差异、退出 0。
 * 持有人数允许差异(实时表按每户最新申报计)。
 * 用法: npm run report:consistency -- --period=YYYY-MM-DD   (cohort 相同且买卖不一致时非零退出)
 */
import { effectiveMovesPeriod } from "../src/lib/freshness/derive";
import { readAll } from "./lib/computeConsensus";
import { compareCohorts } from "./lib/consistency";
import { activeOnly, loadManagerFilings } from "./lib/loadReportInput";
import { readReport } from "./lib/reportDb";
import { makeDb } from "./report";

const PERIOD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 只接受合法的 YYYY-MM-DD(含日历校验,如 2026-02-30 拒绝),在连接数据库之前校验。 */
function parsePeriod(argv: string[]): string {
  const period = argv.find((a) => a.startsWith("--period="))?.slice("--period=".length);
  if (!period || !PERIOD_RE.test(period)) throw new Error("需要 --period=YYYY-MM-DD");
  const d = new Date(`${period}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== period) throw new Error(`非法日期: ${period}`);
  return period;
}

async function main() {
  const period = parsePeriod(process.argv);
  const db = makeDb();
  const row = await readReport(db, period);
  if (!row) throw new Error(`无报告行: ${period}`);
  const p = row.payload;

  // 与 loadReportInput / computeAndStoreConsensus 同一口径:有效季用全部有申报的投资人,cohort 只数活跃户。
  const all = await loadManagerFilings(db);
  const effective = effectiveMovesPeriod(all.map((r) => r.latestPeriod), new Date());
  const cohort = activeOnly(all).filter((r) => r.latestPeriod === period);
  const cohortWithoutPrior = cohort.filter((r) => !r.rows.some((f) => f.period < period)).length;
  const verdict = compareCohorts({
    period, reportFiled: p.coverage.filed, siteCohort: cohort.length, siteEffectivePeriod: effective.period, cohortWithoutPrior,
  });
  console.log(`[consistency] 报告 ${p.coverage.filed} 位已申报 · 实时页按 ${period} 计算的活跃投资人 ${cohort.length} 位 · 有效变动季 ${effective.period ?? "无"}`);
  verdict.notes.forEach((n) => console.log(`[consistency] ${n}`));

  // consensus_moves 主键 (ticker,direction);PostgREST 默认单页 1000 行,必须分页读全,否则会把未读到的票误报为“无”。
  const moves = await readAll(db, "consensus_moves", "ticker,direction,manager_count", (q) =>
    q.order("ticker", { ascending: true }).order("direction", { ascending: true }),
  );
  const live = new Map<string, number>(moves.map((m: { ticker: string; direction: string; manager_count: number | string }) => [`${m.ticker}|${m.direction}`, Number(m.manager_count)]));
  const bad: string[] = [];
  for (const [dir, items] of [["bought", p.bought.items], ["sold", p.sold.items]] as const) {
    for (const i of items) {
      const v = live.get(`${i.key}|${dir}`);
      if (v !== i.managerCount) bad.push(`${dir} ${i.key}: 报告 ${i.managerCount} vs 实时 ${v ?? "无"}`);
    }
  }

  const heldKeys = p.mostHeld.items.map((i) => i.key);
  const heldMap = new Map<string, number>();
  if (heldKeys.length) {
    const { data: held, error: heldErr } = await db.from("consensus_holdings").select("ticker,holder_count").in("ticker", heldKeys);
    if (heldErr) throw new Error(`consensus_holdings read: ${heldErr.message}`);
    for (const h of (held ?? []) as Array<{ ticker: string; holder_count: number | string }>) heldMap.set(h.ticker, Number(h.holder_count));
  }
  const heldDiffs = p.mostHeld.items
    .filter((i) => heldMap.get(i.key) !== i.holderCount)
    .map((i) => `${i.key}: 报告 ${i.holderCount} vs 实时 ${heldMap.get(i.key) ?? "无"}`);

  console.log(`[consistency] 买卖不一致 ${bad.length} 项`);
  bad.forEach((b) => console.log("  ✗", b));
  console.log(`[consistency] 持有人数差异 ${heldDiffs.length} 项(实时表按每户最新申报计,已申报下一季的户会造成差异)`);
  heldDiffs.forEach((b) => console.log("  ·", b));
  if (!verdict.comparable) {
    console.log("[consistency] 两边不是同一批投资人,以上差异不判失败");
    return;
  }
  if (bad.length) process.exit(1);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
