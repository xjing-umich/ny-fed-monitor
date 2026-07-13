import { computeConsensus, computeStockHolders, computeStockTrend, computeCoOwnership, type ScanInput, type StockHolderScan, type TrendScan, type CusipInfo } from "../../src/lib/consensus/compute";
import { effectiveMovesPeriod, freshness13F, globalLatestPeriod } from "../../src/lib/freshness/derive";

async function readAll(db: any, table: string, cols: string, filter?: (q: any) => any): Promise<any[]> {
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

export async function computeAndStoreConsensus(db: any): Promise<{ holdings: number; moves: number; stockHolders: number; trend: number; coOwnership: number }> {
  const cmap = new Map<string, CusipInfo>();
  for (const r of await readAll(db, "security_cusips", "cusip,ticker,issuer", (q) => q.order("cusip", { ascending: true })))
    cmap.set(r.cusip, { ticker: r.ticker, name: r.issuer });

  const managers = await readAll(db, "managers", "cik,slug,person", (q) => q.order("cik", { ascending: true }));
  type Raw = { cik: string; slug: string; person: string; period: string; filedAt: string | null; latestH: any[]; priorH: any[] };
  const raws: Raw[] = [];
  for (const m of managers) {
    // 多取几行再按 period 去重:limit(2) 会在同季原件+修正件并存时把两期都耗在同一 period 上。
    // order 以 id 结尾,保证 OFFSET 分页稳定。
    const filingRows = await readAll(
      db,
      "filings",
      "id,period,filed_at",
      (q) => q.eq("cik", m.cik).order("period", { ascending: false }).order("id", { ascending: false }).limit(16)
    );
    const filings = latestDistinctPeriodFilings(filingRows, 2);
    if (!filings.length) continue;
    const latestH = await readAll(db, "holdings", "cusip,issuer,value,shares,weight,put_call", (q) =>
      q.eq("filing_id", filings[0].id).order("id", { ascending: true })
    );
    const priorH = filings[1]
      ? await readAll(db, "holdings", "cusip,issuer,value,shares,weight,put_call", (q) =>
          q.eq("filing_id", filings[1].id).order("id", { ascending: true })
        )
      : [];
    raws.push({ cik: m.cik, slug: m.slug, person: m.person, period: filings[0].period, filedAt: filings[0].filed_at ?? null, latestH, priorH });
  }

  // 新鲜度口径(与 src/lib/aggregations.ts 一致): inactive 全剔除; 非有效变动季者 holdings 计入但 changes 清空。
  const periods = raws.map((r) => r.period);
  const gl = globalLatestPeriod(periods);
  const effective = effectiveMovesPeriod(periods, new Date());
  const active = raws.filter((r) => freshness13F(r.period, gl) !== "inactive");
  const changesOf = (r: Raw) =>
    (effective.period && r.period === effective.period ? diff(r.latestH, r.priorH) : []);

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
  const coOwnership = computeCoOwnership(holderScan, cmap);

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
    return { holdings: holdings.length, moves: moves.length, stockHolders: 0, trend: 0, coOwnership: 0 };
  }
  for (let i = 0; i < stockHolders.length; i += 500) {
    const { error } = await db.from("consensus_stock_holders").upsert(stockHolders.slice(i, i + 500), { onConflict: "ticker,cik" });
    if (error) console.warn(`consensus_stock_holders upsert err: ${error.message}`);
  }

  // 持有人数趋势:每户读最近 8 个不同 period 的 filings(同 period 取最新 filed_at)+各季 holdings 的 cusip。
  // 与个股页旧逻辑口径一致(全部 manager、不做 inactive 过滤、最近 8 季)。
  const trendScan: TrendScan[] = [];
  for (const m of managers) {
    const tfRows = await readAll(
      db,
      "filings",
      "id,period,filed_at",
      (q) => q.eq("cik", m.cik).order("period", { ascending: false }).order("id", { ascending: false }).limit(32)
    );
    const tf = latestDistinctPeriodFilings(tfRows, 8);
    if (!tf.length) continue;
    const filings: TrendScan["filings"] = [];
    for (const f of tf) {
      const hs = await readAll(db, "holdings", "cusip,put_call", (q) =>
        q.eq("filing_id", f.id).order("id", { ascending: true })
      );
      filings.push({ period: f.period, cusips: hs.filter((h) => !h.put_call).map((h) => h.cusip) });
    }
    trendScan.push({ slug: m.slug, filings });
  }
  const trend = computeStockTrend(trendScan, cmap);

  const { error: trDelErr } = await db.from("consensus_stock_trend").delete().neq("ticker", "");
  if (trDelErr && trDelErr.code === "42P01") {
    console.warn("consensus_stock_trend 表不存在 — 跳过(先跑 migration)。");
    return { holdings: holdings.length, moves: moves.length, stockHolders: stockHolders.length, trend: 0, coOwnership: 0 };
  }
  for (let i = 0; i < trend.length; i += 500) {
    const { error } = await db.from("consensus_stock_trend").upsert(trend.slice(i, i + 500), { onConflict: "ticker,period" });
    if (error) console.warn(`consensus_stock_trend upsert err: ${error.message}`);
  }

  // consensus_coownership: 表缺失 → warn 跳过(与 stock_holders/trend 一致的优雅降级)。
  const { error: coDelErr } = await db.from("consensus_coownership").delete().neq("ticker", "");
  if (coDelErr && coDelErr.code === "42P01") {
    console.warn("consensus_coownership 表不存在 — 跳过(先跑 migration)。");
    return { holdings: holdings.length, moves: moves.length, stockHolders: stockHolders.length, trend: trend.length, coOwnership: 0 };
  }
  for (let i = 0; i < coOwnership.length; i += 500) {
    const { error } = await db.from("consensus_coownership").upsert(coOwnership.slice(i, i + 500), { onConflict: "ticker,co_ticker" });
    if (error) console.warn(`consensus_coownership upsert err: ${error.message}`);
  }

  return { holdings: holdings.length, moves: moves.length, stockHolders: stockHolders.length, trend: trend.length, coOwnership: coOwnership.length };
}
