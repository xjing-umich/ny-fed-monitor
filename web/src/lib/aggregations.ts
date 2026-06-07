import { cache } from "react";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import type { Holding, HoldingChange } from "@/lib/managers/types";

export type ScanRow = {
  slug: string;
  person: string;
  holdings: Holding[];
  changes: HoldingChange[];
};

export type HeldRow = { cusip: string; issuer: string; holderCount: number; totalValue: number };
export type MoveKind = "new" | "increased" | "exited" | "decreased";
export type MoveRow = { cusip: string; issuer: string; count: number; value: number; dominantKind: MoveKind };
export type NotableMoves = { mostBought: MoveRow[]; mostSold: MoveRow[] };

/** Scan every manager's latest holdings + changes. Cached per render to avoid re-reads. */
export const scanAllManagers = cache(async (): Promise<ScanRow[]> => {
  const idx = await getManagerIndex();
  const rows = await Promise.all(
    (idx.managers ?? []).map(async (m) => {
      const d = await getManagerDetail(m.slug);
      if (!d) return null;
      return { slug: m.slug, person: m.person, holdings: d.latest.holdings ?? [], changes: d.changes ?? [] };
    })
  );
  return rows.filter((r): r is ScanRow => r !== null);
});

export function computeMostHeld(scan: ScanRow[], limit: number): HeldRow[] {
  const agg = new Map<string, { issuer: string; holders: Set<string>; totalValue: number }>();
  for (const row of scan) {
    for (const h of row.holdings) {
      const e = agg.get(h.cusip) ?? { issuer: h.issuer, holders: new Set<string>(), totalValue: 0 };
      e.holders.add(row.slug);
      e.totalValue += h.value ?? 0;
      if (!e.issuer && h.issuer) e.issuer = h.issuer;
      agg.set(h.cusip, e);
    }
  }
  return [...agg.entries()]
    .map(([cusip, e]) => ({ cusip, issuer: e.issuer, holderCount: e.holders.size, totalValue: e.totalValue }))
    .sort((a, b) => b.holderCount - a.holderCount || b.totalValue - a.totalValue)
    .slice(0, limit);
}

function dominantOf(kinds: Map<MoveKind, number>, side: "buy" | "sell"): MoveKind {
  const [strong, weak]: MoveKind[] = side === "buy" ? ["new", "increased"] : ["exited", "decreased"];
  return (kinds.get(weak) ?? 0) > (kinds.get(strong) ?? 0) ? weak : strong;
}

export function computeNotableMoves(scan: ScanRow[], limit: number): NotableMoves {
  type Agg = { issuer: string; count: number; value: number; kinds: Map<MoveKind, number> };
  const buys = new Map<string, Agg>();
  const sells = new Map<string, Agg>();
  const bump = (m: Map<string, Agg>, c: HoldingChange) => {
    const e = m.get(c.cusip) ?? { issuer: c.issuer, count: 0, value: 0, kinds: new Map<MoveKind, number>() };
    e.count += 1; e.value += c.value ?? 0;
    e.kinds.set(c.kind as MoveKind, (e.kinds.get(c.kind as MoveKind) ?? 0) + 1);
    m.set(c.cusip, e);
  };
  for (const row of scan) {
    for (const c of row.changes) {
      if (c.kind === "new" || c.kind === "increased") bump(buys, c);
      else if (c.kind === "exited" || c.kind === "decreased") bump(sells, c);
    }
  }
  const top = (m: Map<string, Agg>, side: "buy" | "sell"): MoveRow[] =>
    [...m.entries()]
      .map(([cusip, e]) => ({ cusip, issuer: e.issuer, count: e.count, value: e.value, dominantKind: dominantOf(e.kinds, side) }))
      .sort((a, b) => b.count - a.count || b.value - a.value)
      .slice(0, limit);
  return { mostBought: top(buys, "buy"), mostSold: top(sells, "sell") };
}

export async function mostHeld(limit = 40): Promise<HeldRow[]> {
  const { readConsensusHeld } = await import("@/lib/managers/consensusRead");
  const fromDb = await readConsensusHeld(limit);
  if (fromDb && fromDb.length) return fromDb;
  return computeMostHeld(await scanAllManagers(), limit); // 回退: 无库/空表时请求时计算
}
export async function notableMoves(limit = 6): Promise<NotableMoves> {
  const { readConsensusMoves } = await import("@/lib/managers/consensusRead");
  const fromDb = await readConsensusMoves(limit);
  if (fromDb && (fromDb.mostBought.length || fromDb.mostSold.length)) return fromDb;
  return computeNotableMoves(await scanAllManagers(), limit);
}
