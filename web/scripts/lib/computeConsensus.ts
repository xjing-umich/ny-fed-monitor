import { computeConsensus, computeStockHolders, computeStockTrend, type ScanInput, type StockHolderScan, type TrendScan, type CusipInfo } from "../../src/lib/consensus/compute";
import { freshness13F, globalLatestPeriod } from "../../src/lib/freshness/derive";

async function readAll(db: any, table: string, cols: string, filter?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table} read: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

function diff(latest: any[], prior: any[]): ScanInput["changes"] {
  const keyOfHolding = (h: any) => `${h.cusip}|${h.put_call ?? ""}`;
  const lm = new Map(latest.map((h) => [keyOfHolding(h), h]));
  const pm = new Map(prior.map((h) => [keyOfHolding(h), h]));
  const out: ScanInput["changes"] = [];
  for (const [k, lh] of lm) {
    const ph = pm.get(k);
    if (!ph) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "new", value: Number(lh.value), putCall: lh.put_call ?? undefined });
    else if (Number(lh.shares) > Number(ph.shares)) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "increased", value: Number(lh.value), putCall: lh.put_call ?? undefined });
    else if (Number(lh.shares) < Number(ph.shares)) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "decreased", value: Number(lh.value), putCall: lh.put_call ?? undefined });
  }
  for (const [k, ph] of pm) if (!lm.has(k)) out.push({ cusip: ph.cusip, issuer: ph.issuer, kind: "exited", value: Number(ph.value), putCall: ph.put_call ?? undefined });
  return out;
}

export async function computeAndStoreConsensus(db: any): Promise<{ holdings: number; moves: number; stockHolders: number; trend: number }> {
  const cmap = new Map<string, CusipInfo>();
  for (const r of await readAll(db, "security_cusips", "cusip,ticker,issuer"))
    cmap.set(r.cusip, { ticker: r.ticker, name: r.issuer });

  const managers = await readAll(db, "managers", "cik,slug,person");
  type Raw = { cik: string; slug: string; person: string; period: string; filedAt: string | null; latestH: any[]; priorH: any[] };
  const raws: Raw[] = [];
  for (const m of managers) {
    const filings = await readAll(db, "filings", "id,period,filed_at", (q) => q.eq("cik", m.cik).order("period", { ascending: false }).limit(2));
    if (!filings.length) continue;
    const latestH = await readAll(db, "holdings", "cusip,issuer,value,shares,weight,put_call", (q) => q.eq("filing_id", filings[0].id));
    const priorH = filings[1] ? await readAll(db, "holdings", "cusip,issuer,value,shares,weight,put_call", (q) => q.eq("filing_id", filings[1].id)) : [];
    raws.push({ cik: m.cik, slug: m.slug, person: m.person, period: filings[0].period, filedAt: filings[0].filed_at ?? null, latestH, priorH });
  }

  // 新鲜度口径(与 src/lib/aggregations.ts 一致): inactive 全剔除; 非当季者 holdings 计入但 changes 清空。
  const gl = globalLatestPeriod(raws.map((r) => r.period));
  const active = raws.filter((r) => freshness13F(r.period, gl) !== "inactive");
  const changesOf = (r: Raw) => (r.period === gl ? diff(r.latestH, r.priorH) : []);

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

  const { holdings, moves } = computeConsensus(scan, cmap);
  const stockHolders = computeStockHolders(holderScan, cmap);

  await db.from("consensus_holdings").delete().neq("ticker", "");
  await db.from("consensus_moves").delete().neq("ticker", "");
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
    return { holdings: holdings.length, moves: moves.length, stockHolders: 0, trend: 0 };
  }
  for (let i = 0; i < stockHolders.length; i += 500) {
    const { error } = await db.from("consensus_stock_holders").upsert(stockHolders.slice(i, i + 500), { onConflict: "ticker,cik" });
    if (error) console.warn(`consensus_stock_holders upsert err: ${error.message}`);
  }

  // 持有人数趋势:每户读最近 8 季 filings + 各季 holdings 的 cusip,统计每 (ticker,period) 人数。
  // 与个股页旧逻辑口径一致(全部 manager、不做 inactive 过滤、最近 8 季)。
  const trendScan: TrendScan[] = [];
  for (const m of managers) {
    const tf = await readAll(db, "filings", "id,period", (q) => q.eq("cik", m.cik).order("period", { ascending: false }).limit(8));
    if (!tf.length) continue;
    const filings: TrendScan["filings"] = [];
    for (const f of tf) {
      const hs = await readAll(db, "holdings", "cusip,put_call", (q) => q.eq("filing_id", f.id));
      filings.push({ period: f.period, cusips: hs.filter((h) => !h.put_call).map((h) => h.cusip) });
    }
    trendScan.push({ slug: m.slug, filings });
  }
  const trend = computeStockTrend(trendScan, cmap);

  const { error: trDelErr } = await db.from("consensus_stock_trend").delete().neq("ticker", "");
  if (trDelErr && trDelErr.code === "42P01") {
    console.warn("consensus_stock_trend 表不存在 — 跳过(先跑 migration)。");
    return { holdings: holdings.length, moves: moves.length, stockHolders: stockHolders.length, trend: 0 };
  }
  for (let i = 0; i < trend.length; i += 500) {
    const { error } = await db.from("consensus_stock_trend").upsert(trend.slice(i, i + 500), { onConflict: "ticker,period" });
    if (error) console.warn(`consensus_stock_trend upsert err: ${error.message}`);
  }

  return { holdings: holdings.length, moves: moves.length, stockHolders: stockHolders.length, trend: trend.length };
}
