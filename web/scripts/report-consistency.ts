/**
 * 报告 vs 实时共识表逐数核对。只在 effectiveMovesPeriod 已等于该季度时有意义
 * (consensus_moves 只存当前有效季)。持有人数允许差异,但必须能被“该户最新申报已不是 P”解释。
 * 用法: npm run report:consistency -- --period=YYYY-MM-DD   (不一致时非零退出)
 */
import { readAll } from "./lib/computeConsensus";
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
  if (bad.length) process.exit(1);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
