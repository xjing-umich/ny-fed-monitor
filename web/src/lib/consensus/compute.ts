// 共识计算纯逻辑(无 I/O): 把各经理人 latest 持仓/changes 聚合为 ticker-keyed 快照行。
// cusip → ticker 经传入的 map; 未解析 cusip 用 cusip 自身作兜底键(与个股页回退一致)。

export type ScanHolding = { cusip: string; issuer: string; value: number; putCall?: string };
export type ScanChange = { cusip: string; issuer: string; kind: "new" | "exited" | "increased" | "decreased"; value: number; putCall?: string };
export type ScanInput = { slug: string; holdings: ScanHolding[]; changes: ScanChange[] };
export type CusipInfo = { ticker: string | null; name: string | null };

export type ConsensusHoldingRow = { ticker: string; issuer: string; holder_count: number; total_value: number };
export type ConsensusMoveRow = { ticker: string; direction: "bought" | "sold"; issuer: string; manager_count: number; net_value: number; dominant_kind: "new" | "increased" | "exited" | "decreased" };

type MoveKind = "new" | "increased" | "exited" | "decreased";
function dominantKind(kinds: Map<MoveKind, number>, direction: "bought" | "sold"): MoveKind {
  const [strong, weak]: MoveKind[] = direction === "bought" ? ["new", "increased"] : ["exited", "decreased"];
  // Most frequent wins; tie → stronger signal.
  return (kinds.get(weak) ?? 0) > (kinds.get(strong) ?? 0) ? weak : strong;
}

function keyOf(cusip: string, map: Map<string, CusipInfo>): { ticker: string; name: string | null } {
  const info = map.get(cusip);
  return { ticker: info?.ticker ?? cusip, name: info?.name ?? null };
}

export function computeConsensus(
  scan: ScanInput[],
  cusipToTicker: Map<string, CusipInfo>
): { holdings: ConsensusHoldingRow[]; moves: ConsensusMoveRow[] } {
  const held = new Map<string, { issuer: string; holders: Set<string>; total: number }>();
  for (const m of scan) {
    for (const h of m.holdings) {
      if (h.putCall) continue; // 期权(put/call)不是长仓,不算持有人
      const { ticker, name } = keyOf(h.cusip, cusipToTicker);
      const e = held.get(ticker) ?? { issuer: name ?? h.issuer, holders: new Set<string>(), total: 0 };
      e.holders.add(m.slug);
      e.total += h.value ?? 0;
      if (!e.issuer) e.issuer = name ?? h.issuer;
      held.set(ticker, e);
    }
  }
  const holdings: ConsensusHoldingRow[] = [...held.entries()]
    .map(([ticker, e]) => ({ ticker, issuer: e.issuer, holder_count: e.holders.size, total_value: e.total }))
    .sort((a, b) => b.holder_count - a.holder_count || b.total_value - a.total_value);

  const mv = new Map<string, { issuer: string; managers: Set<string>; net: number; direction: "bought" | "sold"; kinds: Map<MoveKind, number> }>();
  for (const m of scan) {
    for (const c of m.changes) {
      if (c.putCall) continue; // 期权(put/call)不是长仓,不算买卖动向
      const direction: "bought" | "sold" | null =
        c.kind === "new" || c.kind === "increased" ? "bought" : c.kind === "exited" || c.kind === "decreased" ? "sold" : null;
      if (!direction) continue;
      const { ticker, name } = keyOf(c.cusip, cusipToTicker);
      const k = `${ticker}|${direction}`;
      const e = mv.get(k) ?? { issuer: name ?? c.issuer, managers: new Set<string>(), net: 0, direction, kinds: new Map<MoveKind, number>() };
      e.managers.add(m.slug);
      e.net += c.value ?? 0;
      e.kinds.set(c.kind, (e.kinds.get(c.kind) ?? 0) + 1);
      mv.set(k, e);
    }
  }
  const moves: ConsensusMoveRow[] = [...mv.entries()]
    .map(([k, e]) => ({ ticker: k.split("|")[0], direction: e.direction, issuer: e.issuer, manager_count: e.managers.size, net_value: e.net, dominant_kind: dominantKind(e.kinds, e.direction) }))
    .sort((a, b) => b.manager_count - a.manager_count || b.net_value - a.net_value);

  return { holdings, moves };
}

// ── 个股页持有人快照(consensus_stock_holders)──────────────────────────────────
// 每位经理 × 每个 ticker 一行,供个股页"谁在持有"表/动向计数直接读,取代对 34 户逐个
// getManagerDetail 的 ~100 次/页往返。当前持有人行带 value/shares/weight + QoQ kind;
// 本季清仓者额外发一条 kind='exited'、零值行(不进持有人表,仅供 moves.exited 计数,即 plan 选项 A)。

export type StockHolderScan = {
  cik: string;
  slug: string;
  person: string;
  period: string;
  filedAt: string | null;
  holdings: { cusip: string; issuer: string; value: number; shares: number; weight: number; putCall?: string }[];
  priorHoldings?: { cusip: string; weight: number }[];
  changes: ScanChange[];
};

export type StockHolderRow = {
  ticker: string;
  cik: string;
  slug: string;
  person: string;
  issuer: string;
  value: number;
  shares: number;
  weight: number;
  prior_weight: number | null;   // 上季同 ticker 组合权重(供个股页 QoQ 箭头); 无上季持仓 → null
  kind: "new" | "increased" | "decreased" | "exited" | null;
  period: string;
  filed_at: string | null;
};

export function computeStockHolders(
  scan: StockHolderScan[],
  cusipToTicker: Map<string, CusipInfo>
): StockHolderRow[] {
  const out: StockHolderRow[] = [];
  for (const m of scan) {
    // cusip → 本季 change kind(非当季经理 changes 为空 → 全为"持有未变",kind=null)
    const kindByCusip = new Map<string, ScanChange["kind"]>();
    for (const c of m.changes) kindByCusip.set(c.cusip, c.kind);

    // 当前持仓按 ticker 归并:同 ticker 多 cusip(双重股权/正股+期权)的 value/shares/weight 求和;
    // kind 取该 ticker 组内最大市值 cusip 的变动(确定性,与个股页旧"取首个匹配"等价但更稳)。
    type Agg = { issuer: string; value: number; shares: number; weight: number; topCusip: string; topVal: number };
    const byTicker = new Map<string, Agg>();
    for (const h of m.holdings) {
      if (h.putCall) continue; // 期权(put/call)不是长仓,不算持有人
      const { ticker, name } = keyOf(h.cusip, cusipToTicker);
      const e = byTicker.get(ticker) ?? { issuer: name ?? h.issuer, value: 0, shares: 0, weight: 0, topCusip: h.cusip, topVal: -1 };
      e.value += h.value ?? 0;
      e.shares += h.shares ?? 0;
      e.weight += h.weight ?? 0;
      if ((h.value ?? 0) > e.topVal) { e.topVal = h.value ?? 0; e.topCusip = h.cusip; e.issuer = name ?? h.issuer; }
      byTicker.set(ticker, e);
    }

    // 上季同 ticker 组合权重(供 QoQ 箭头): 把上季持仓按 ticker 归并求和。
    const priorWByTicker = new Map<string, number>();
    for (const ph of m.priorHoldings ?? []) {
      const { ticker } = keyOf(ph.cusip, cusipToTicker);
      priorWByTicker.set(ticker, (priorWByTicker.get(ticker) ?? 0) + (ph.weight ?? 0));
    }

    const heldTickers = new Set(byTicker.keys());
    for (const [ticker, e] of byTicker) {
      const ck = kindByCusip.get(e.topCusip);
      const kind: StockHolderRow["kind"] =
        ck === "new" ? "new" : ck === "increased" ? "increased" : ck === "decreased" ? "decreased" : null;
      const pw = priorWByTicker.has(ticker) ? priorWByTicker.get(ticker)! : null;
      out.push({ ticker, cik: m.cik, slug: m.slug, person: m.person, issuer: e.issuer, value: e.value, shares: e.shares, weight: e.weight, prior_weight: pw, kind, period: m.period, filed_at: m.filedAt });
    }

    // 清仓行:本季 kind='exited' 且该 ticker 已不在当前持仓里(同 ticker 仅清掉某一股权类则不算)。
    const exitedSeen = new Set<string>();
    for (const c of m.changes) {
      if (c.kind !== "exited") continue;
      const { ticker, name } = keyOf(c.cusip, cusipToTicker);
      if (heldTickers.has(ticker) || exitedSeen.has(ticker)) continue;
      exitedSeen.add(ticker);
      out.push({ ticker, cik: m.cik, slug: m.slug, person: m.person, issuer: name ?? c.issuer, value: 0, shares: 0, weight: 0, prior_weight: null, kind: "exited", period: m.period, filed_at: m.filedAt });
    }
  }
  return out;
}

// ── 个股页持有人数趋势快照(consensus_stock_trend)─────────────────────────────
// 每个 (ticker, period) 一行: 该季有多少位 superinvestor 持有本票。供个股页 8 季趋势图,
// 取代对 34 户逐个拉完整 filings 历史再统计。每经理同一季同一 ticker 只计一次(多 cusip 去重)。

export type TrendScan = { slug: string; filings: { period: string; cusips: string[] }[] };
export type ConsensusStockTrendRow = { ticker: string; period: string; holder_count: number };

export function computeStockTrend(
  scan: TrendScan[],
  cusipToTicker: Map<string, CusipInfo>
): ConsensusStockTrendRow[] {
  // key = `${ticker} ${period}` → 持有该票该季的 slug 集合(去重计人数)
  const counts = new Map<string, Set<string>>();
  for (const m of scan) {
    for (const f of m.filings) {
      const tickers = new Set<string>();
      for (const c of f.cusips) tickers.add(keyOf(c, cusipToTicker).ticker);
      for (const t of tickers) {
        const k = `${t} ${f.period}`;
        let s = counts.get(k);
        if (!s) { s = new Set<string>(); counts.set(k, s); }
        s.add(m.slug);
      }
    }
  }
  const out: ConsensusStockTrendRow[] = [];
  for (const [k, s] of counts) {
    const sep = k.indexOf(" ");
    out.push({ ticker: k.slice(0, sep), period: k.slice(sep + 1), holder_count: s.size });
  }
  return out;
}
