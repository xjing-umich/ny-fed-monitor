// 共识计算纯逻辑(无 I/O): 把各经理人 latest 持仓/changes 聚合为 ticker-keyed 快照行。
// cusip → ticker 经传入的 map; 未解析 cusip 用 cusip 自身作兜底键(与个股页回退一致)。

export type ScanHolding = { cusip: string; issuer: string; value: number };
export type ScanChange = { cusip: string; issuer: string; kind: "new" | "exited" | "increased" | "decreased"; value: number };
export type ScanInput = { slug: string; holdings: ScanHolding[]; changes: ScanChange[] };
export type CusipInfo = { ticker: string | null; name: string | null };

export type ConsensusHoldingRow = { ticker: string; issuer: string; holder_count: number; total_value: number };
export type ConsensusMoveRow = { ticker: string; direction: "bought" | "sold"; issuer: string; manager_count: number; net_value: number };

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

  const mv = new Map<string, { issuer: string; managers: Set<string>; net: number; direction: "bought" | "sold" }>();
  for (const m of scan) {
    for (const c of m.changes) {
      const direction: "bought" | "sold" | null =
        c.kind === "new" || c.kind === "increased" ? "bought" : c.kind === "exited" || c.kind === "decreased" ? "sold" : null;
      if (!direction) continue;
      const { ticker, name } = keyOf(c.cusip, cusipToTicker);
      const k = `${ticker}|${direction}`;
      const e = mv.get(k) ?? { issuer: name ?? c.issuer, managers: new Set<string>(), net: 0, direction };
      e.managers.add(m.slug);
      e.net += c.value ?? 0;
      mv.set(k, e);
    }
  }
  const moves: ConsensusMoveRow[] = [...mv.entries()]
    .map(([k, e]) => ({ ticker: k.split("|")[0], direction: e.direction, issuer: e.issuer, manager_count: e.managers.size, net_value: e.net }))
    .sort((a, b) => b.manager_count - a.manager_count || b.net_value - a.net_value);

  return { holdings, moves };
}
