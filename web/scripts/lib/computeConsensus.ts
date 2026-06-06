import { computeConsensus, type ScanInput, type CusipInfo } from "../../src/lib/consensus/compute";

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
  const lm = new Map(latest.map((h) => [h.cusip, h]));
  const pm = new Map(prior.map((h) => [h.cusip, h]));
  const out: ScanInput["changes"] = [];
  for (const [k, lh] of lm) {
    const ph = pm.get(k);
    if (!ph) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "new", value: Number(lh.value) });
    else if (Number(lh.shares) > Number(ph.shares)) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "increased", value: Number(lh.value) });
    else if (Number(lh.shares) < Number(ph.shares)) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "decreased", value: Number(lh.value) });
  }
  for (const [k, ph] of pm) if (!lm.has(k)) out.push({ cusip: ph.cusip, issuer: ph.issuer, kind: "exited", value: 0 });
  return out;
}

export async function computeAndStoreConsensus(db: any): Promise<{ holdings: number; moves: number }> {
  const cmap = new Map<string, CusipInfo>();
  for (const r of await readAll(db, "security_cusips", "cusip,ticker,issuer"))
    cmap.set(r.cusip, { ticker: r.ticker, name: r.issuer });

  const managers = await readAll(db, "managers", "cik,slug");
  const scan: ScanInput[] = [];
  for (const m of managers) {
    const filings = await readAll(db, "filings", "id,period", (q) => q.eq("cik", m.cik).order("period", { ascending: false }).limit(2));
    if (!filings.length) continue;
    const latestH = await readAll(db, "holdings", "cusip,issuer,value,shares", (q) => q.eq("filing_id", filings[0].id));
    const priorH = filings[1] ? await readAll(db, "holdings", "cusip,issuer,value,shares", (q) => q.eq("filing_id", filings[1].id)) : [];
    scan.push({
      slug: m.slug,
      holdings: latestH.map((h) => ({ cusip: h.cusip, issuer: h.issuer, value: Number(h.value) })),
      changes: diff(latestH, priorH),
    });
  }

  const { holdings, moves } = computeConsensus(scan, cmap);
  await db.from("consensus_holdings").delete().neq("ticker", "");
  await db.from("consensus_moves").delete().neq("ticker", "");
  for (let i = 0; i < holdings.length; i += 500) {
    const { error } = await db.from("consensus_holdings").upsert(holdings.slice(i, i + 500), { onConflict: "ticker" });
    if (error) console.warn(`consensus_holdings upsert err: ${error.message}`);
  }
  for (let i = 0; i < moves.length; i += 500) {
    const { error } = await db.from("consensus_moves").upsert(moves.slice(i, i + 500), { onConflict: "ticker,direction" });
    if (error) console.warn(`consensus_moves upsert err: ${error.message}`);
  }
  return { holdings: holdings.length, moves: moves.length };
}
