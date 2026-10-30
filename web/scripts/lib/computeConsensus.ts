import { computeConsensus, computeStockHolders, computeStockTrend, computeCoOwnership, type ScanInput, type StockHolderScan, type TrendScan, type CusipInfo } from "../../src/lib/consensus/compute";
import { deriveSplitFactorsWithRejections, factorLookup, NO_SPLITS, rescaleToLatestBasis, type ManagerHistory, type SplitEvent } from "../../src/lib/managers/splitAdjust";
import { summarizeQuarter } from "../../src/lib/managers/quarterSummary";
import { computeChanges, tickerCanon } from "../../src/lib/managers/assemble";
import { consensusChangesFor, publishManagerDerived, splitRow, summaryRow, toHolding, type DbHolding } from "./splitStore";
import { countsAsCurrentHolder, effectiveMovesPeriod } from "../../src/lib/freshness/derive";

export async function readAll(db: any, table: string, cols: string, filter?: (q: any) => any): Promise<any[]> {
  // PostgREST OFFSET 分页要求排序以唯一列结尾,否则页边界并列行会整行跳过。
  // 调用方须在 filter 里带 .order(...唯一键);本函数先 filter 再 range。
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols);
    if (filter) q = filter(q);
    q = q.range(from, from + 999);
    const { data, error } = await q;
    if (error) throw new Error(`${table} read: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

type FilingRow = { id: number; period: string; filed_at: string | null };

/**
 * filings 仅 accession unique:同 cik+period 可并存 13F-HR 与 13F-HR/A。
 * 按 period 去重,同 period 保留 filed_at 最新(修正件;并列时取更大 id),再取最近 n 个不同 period。
 */
export function latestDistinctPeriodFilings(rows: FilingRow[], n: number): FilingRow[] {
  const best = new Map<string, FilingRow>();
  for (const r of rows) {
    const prev = best.get(r.period);
    if (!prev) {
      best.set(r.period, r);
      continue;
    }
    const a = r.filed_at ?? "";
    const b = prev.filed_at ?? "";
    if (a > b || (a === b && r.id > prev.id)) best.set(r.period, r);
  }
  return [...best.values()]
    .sort((x, y) => (x.period < y.period ? 1 : x.period > y.period ? -1 : 0))
    .slice(0, n);
}

export async function computeAndStoreConsensus(db: any): Promise<{ holdings: number; moves: number; stockHolders: number; trend: number; coOwnership: number; splitFactors: number; summaries: number; derivedChanged: boolean }> {
  const cmap = new Map<string, CusipInfo>();
  for (const r of await readAll(db, "security_cusips", "cusip,ticker,issuer", (q) => q.order("cusip", { ascending: true })))
    cmap.set(r.cusip, { ticker: r.ticker, name: r.issuer });

  const managers = await readAll(db, "managers", "cik,slug,person", (q) => q.order("cik", { ascending: true }));
  type Raw = { cik: string; slug: string; person: string; period: string; priorPeriod: string | null; latestId: number; priorId: number | null; filedAt: string | null; latestH: any[]; priorH: any[] };
  const raws: Raw[] = [];
  const trendScan: TrendScan[] = [];
  const histories: ManagerHistory[] = [];
  for (const m of managers) {
    // 一次读最近 8 个不同 period(同 period 取最新 filed_at):本季动作、持有人数趋势、拆股交叉验证共用,
    // 取代原来"最近 2 季全列 + 8 季只读 cusip"两遍扫描。前 2 季读全列,更早的只读算系数要用的列(egress 护栏)。
    // 多取几行再按 period 去重:同季原件+修正件并存时,limit 太小会把名额耗在同一 period 上。
    // order 以 id 结尾,保证 OFFSET 分页稳定。
    const tfRows = await readAll(db, "filings", "id,period,filed_at", (q) =>
      q.eq("cik", m.cik).order("period", { ascending: false }).order("id", { ascending: false }).limit(32)
    );
    const tf = latestDistinctPeriodFilings(tfRows, 8);
    if (!tf.length) continue;
    const hs: DbHolding[][] = [];
    for (let i = 0; i < tf.length; i++) {
      const cols = i < 2 ? "cusip,issuer,value,shares,weight,put_call" : "cusip,value,shares,put_call";
      hs.push(await readAll(db, "holdings", cols, (q) => q.eq("filing_id", tf[i].id).order("id", { ascending: true })));
    }
    raws.push({ cik: m.cik, slug: m.slug, person: m.person, period: tf[0].period, priorPeriod: tf[1]?.period ?? null, latestId: tf[0].id, priorId: tf[1]?.id ?? null, filedAt: tf[0].filed_at ?? null, latestH: hs[0], priorH: hs[1] ?? [] });
    trendScan.push({ slug: m.slug, filings: tf.map((f, i) => ({ period: f.period, cusips: hs[i].filter((h) => !h.put_call).map((h) => h.cusip) })) });
    histories.push({ slug: m.slug, filings: tf.map((f, i) => ({ period: f.period, holdings: hs[i].map((h) => ({ cusip: h.cusip, putCall: h.put_call ?? null, shares: Number(h.shares), value: Number(h.value) })) })) });
  }

  // 拆股系数:全部经理、全部季度对重算(第一次运行即完成历史回填)。
  const computedAt = new Date().toISOString();
  const splitEvents: SplitEvent[] = (await readAll(db, "stock_splits", "ticker,split_date,ratio", (q) => q.order("ticker", { ascending: true }).order("split_date", { ascending: true })))
    .map((r) => ({ ticker: r.ticker, date: r.split_date, ratio: Number(r.ratio) }));
  const { factors: splitFactors, rejected } = deriveSplitFactorsWithRejections(histories, (c) => cmap.get(c)?.ticker ?? null, splitEvents);
  const splits = splitFactors.length ? factorLookup(splitFactors) : NO_SPLITS;
  // 表里有真拆股却没通过价格校验(又推断不出)的季度对:假买卖会原样保留,至少在日志里留痕,便于人工复核。
  if (rejected.length) {
    console.warn(`拆股被价格校验拒绝 ${rejected.length} 条(假买卖未修正,需人工复核):`);
    for (const x of rejected) console.warn(`  ${x.ticker ?? "?"} ${x.cusip} ${x.fromPeriod}→${x.toPeriod} q=${x.q.toFixed(3)} r=${x.r}`);
  }

  // 新鲜度口径(与 src/lib/aggregations.ts 一致): 最近到期季的截止日过后仍没交的 manager 不计入
  // 当前持有人(countsAsCurrentHolder);非有效变动季者 holdings 计入但 changes 清空。
  const periods = raws.map((r) => r.period);
  const now = new Date();
  const effective = effectiveMovesPeriod(periods, now);
  const active = raws.filter((r) => countsAsCurrentHolder(r.period, now));
  // 零持仓申报(latestH 为空):不把上季全部仓位记成清仓动作,口径同 assembleManagerDetail。
  // 换 CUSIP 归并(XOM/HON/DD):两季按 ticker 比对,与投资人详情页同一口径。
  const canon = tickerCanon((c) => cmap.get(c)?.ticker);
  const changesOf = (r: Raw) =>
    (effective.period && r.period === effective.period && r.latestH.length > 0 && r.priorPeriod
      ? consensusChangesFor(r.latestH, r.priorH, r.period, r.priorPeriod, splits, canon)
      : []);

  const scan: ScanInput[] = active.map((r) => ({
    slug: r.slug,
    holdings: r.latestH.map((h) => ({ cusip: h.cusip, issuer: h.issuer, value: Number(h.value), putCall: h.put_call ?? undefined })),
    changes: changesOf(r),
  }));

  // 持有人快照用更宽的输入(含 shares/weight/person/filedAt),复用同一遍扫描,零额外 IO。
  const holderScan: StockHolderScan[] = active.map((r) => ({
    cik: r.cik,
    slug: r.slug,
    person: r.person,
    period: r.period,
    filedAt: r.filedAt,
    holdings: r.latestH.map((h) => ({ cusip: h.cusip, issuer: h.issuer, value: Number(h.value), shares: Number(h.shares), weight: Number(h.weight), putCall: h.put_call ?? undefined })),
    priorHoldings: r.priorH.map((h) => ({ cusip: h.cusip, weight: Number(h.weight), putCall: h.put_call ?? undefined })),
    changes: changesOf(r),
  }));

  // 列表页季度汇总(所有有上季、本季非零持仓的经理;不受"有效变动季"过滤,与详情页口径一致)。
  const summaries = raws
    .filter((r) => r.priorPeriod && r.latestH.some((h) => !h.put_call))
    .map((r) => {
      const [latest, prior] = rescaleToLatestBasis(
        [{ period: r.period, holdings: r.latestH.map(toHolding) }, { period: r.priorPeriod!, holdings: r.priorH.map(toHolding) }],
        splits,
      );
      const s = summarizeQuarter({ period: r.period, priorPeriod: r.priorPeriod!, latest: latest.holdings, prior: prior.holdings, changes: computeChanges(latest.holdings, prior.holdings, canon) });
      return summaryRow(r.cik, s, computedAt, { latestId: r.latestId, priorId: r.priorId! });
    });

  // 所有出口都经 finish:两张派生表在单事务内发布,失败向上传播,不能带着部分结果刷新站点。
  const finish = async (counts: { holdings: number; moves: number; stockHolders: number; trend: number; coOwnership: number }) => {
    const derivedChanged = await publishManagerDerived(db, splitFactors.map((f) => splitRow(f, computedAt)), summaries, computedAt);
    return { ...counts, splitFactors: splitFactors.length, summaries: summaries.length, derivedChanged };
  };

  const { holdings, moves } = computeConsensus(scan, cmap);
  const stockHolders = computeStockHolders(holderScan, cmap);
  const coOwnership = computeCoOwnership(holderScan, cmap);

  for (const table of ["consensus_holdings", "consensus_moves"]) {
    const { error } = await db.from(table).delete().neq("ticker", "");
    if (error) throw new Error(`${table} delete failed: ${error.message}`);
  }
  // Write failures must throw, not warn: a swallowed moves-upsert error (e.g. a
  // missing column / stale PostgREST cache) previously left consensus_moves
  // silently empty while the run still reported success.
  for (let i = 0; i < holdings.length; i += 500) {
    const { error } = await db.from("consensus_holdings").upsert(holdings.slice(i, i + 500), { onConflict: "ticker" });
    if (error) throw new Error(`consensus_holdings upsert failed: ${error.message}`);
  }
  for (let i = 0; i < moves.length; i += 500) {
    const { error } = await db.from("consensus_moves").upsert(moves.slice(i, i + 500), { onConflict: "ticker,direction" });
    if (error) throw new Error(`consensus_moves upsert failed: ${error.message}`);
  }

  // 持有人快照:表缺失(未迁移)→ 静默跳过(42P01),不阻断既有两表写入。
  const { error: shDelErr } = await db.from("consensus_stock_holders").delete().neq("ticker", "");
  if (shDelErr && shDelErr.code === "42P01") {
    console.warn("consensus_stock_holders 表不存在 — 跳过(先跑 migration)。");
    return finish({ holdings: holdings.length, moves: moves.length, stockHolders: 0, trend: 0, coOwnership: 0 });
  }
  if (shDelErr) throw new Error(`consensus_stock_holders delete failed: ${shDelErr.message}`);
  for (let i = 0; i < stockHolders.length; i += 500) {
    const { error } = await db.from("consensus_stock_holders").upsert(stockHolders.slice(i, i + 500), { onConflict: "ticker,cik" });
    if (error) throw new Error(`consensus_stock_holders upsert failed: ${error.message}`);
  }

  // 持有人数趋势:trendScan 已在上面的合并循环里构造(最近 8 季、全部经理、不做 inactive 过滤)。
  const trend = computeStockTrend(trendScan, cmap);

  const { error: trDelErr } = await db.from("consensus_stock_trend").delete().neq("ticker", "");
  if (trDelErr && trDelErr.code === "42P01") {
    console.warn("consensus_stock_trend 表不存在 — 跳过(先跑 migration)。");
    return finish({ holdings: holdings.length, moves: moves.length, stockHolders: stockHolders.length, trend: 0, coOwnership: 0 });
  }
  if (trDelErr) throw new Error(`consensus_stock_trend delete failed: ${trDelErr.message}`);
  for (let i = 0; i < trend.length; i += 500) {
    const { error } = await db.from("consensus_stock_trend").upsert(trend.slice(i, i + 500), { onConflict: "ticker,period" });
    if (error) throw new Error(`consensus_stock_trend upsert failed: ${error.message}`);
  }

  // consensus_coownership: 表缺失 → warn 跳过(与 stock_holders/trend 一致的优雅降级)。
  const { error: coDelErr } = await db.from("consensus_coownership").delete().neq("ticker", "");
  if (coDelErr && coDelErr.code === "42P01") {
    console.warn("consensus_coownership 表不存在 — 跳过(先跑 migration)。");
    return finish({ holdings: holdings.length, moves: moves.length, stockHolders: stockHolders.length, trend: trend.length, coOwnership: 0 });
  }
  if (coDelErr) throw new Error(`consensus_coownership delete failed: ${coDelErr.message}`);
  for (let i = 0; i < coOwnership.length; i += 500) {
    const { error } = await db.from("consensus_coownership").upsert(coOwnership.slice(i, i + 500), { onConflict: "ticker,co_ticker" });
    if (error) throw new Error(`consensus_coownership upsert failed: ${error.message}`);
  }

  return finish({ holdings: holdings.length, moves: moves.length, stockHolders: stockHolders.length, trend: trend.length, coOwnership: coOwnership.length });
}
