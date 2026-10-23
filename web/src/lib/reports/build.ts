// 季度报告生成(纯函数,无 I/O)。买卖口径直接复用 computeConsensus,与 buys/sells 页同源;
// 不同点只有一处:输入锁定在报告季度 P,且没有更早申报的投资人不产生买卖(否则其全部持仓都会被算成“新建仓”)。
import { computeConsensus, diffHoldings, type ScanInput, type ScanChange } from "../consensus/compute";
import type {
  ConsensusMoveItem, FeaturedEntry, FeaturedMove, MostHeldItem, MoveKind, ReportHolding,
  ReportInput, ReportPayload, ReportStock, Section, StrikeZoneItem,
} from "./types";

export const CONSENSUS_MIN_HOLDERS_REPORT = 2;
const TOP_N = 10;
const FEATURED_MOVES = 2;

const toDiffRows = (hs: ReportHolding[]) =>
  hs.map((h) => ({ cusip: h.cusip, issuer: h.issuer, value: h.value, shares: h.shares, put_call: h.putCall }));

function section<T>(items: T[], emptyReason: Section<T>["emptyReason"]): Section<T> {
  return { items, emptyReason: items.length ? null : emptyReason };
}

export function buildQuarterlyReport(input: ReportInput): ReportPayload {
  const { period, managers, cusipMap, bargains, featuredSlugs, valuationAvailable } = input;
  const knownTickers = new Set([...cusipMap.values()].map((v) => v.ticker).filter((t): t is string => !!t));
  const stock = (key: string, issuer: string): ReportStock => ({ key, ticker: knownTickers.has(key) ? key : null, issuer });
  const keyOf = (cusip: string) => cusipMap.get(cusip)?.ticker ?? cusip;

  const filers = managers.filter((m) => m.current !== null);
  const coverage = { filed: filers.length, total: managers.length, excluded: input.excludedCount };
  const noFilers = filers.length === 0;

  // —— 共识买卖:复用全站 computeConsensus
  const scan: ScanInput[] = filers.map((m) => ({
    slug: m.slug,
    holdings: m.current!.map((h) => ({ cusip: h.cusip, issuer: h.issuer, value: h.value, putCall: h.putCall ?? undefined })),
    changes: m.prior ? diffHoldings(toDiffRows(m.current!), toDiffRows(m.prior)) : [],
  }));
  const { holdings, moves } = computeConsensus(scan, cusipMap);
  const toMove = (r: (typeof moves)[number]): ConsensusMoveItem => ({
    ...stock(r.ticker, r.issuer), managerCount: r.manager_count, netValue: r.net_value, dominantKind: r.dominant_kind,
  });
  const bought = moves.filter((r) => r.direction === "bought").slice(0, TOP_N).map(toMove);
  const sold = moves.filter((r) => r.direction === "sold").slice(0, TOP_N).map(toMove);

  // —— 持有人数环比:只在“已申报 P 且有更早申报”的同一批人内自比(申报季中不会因有人没申报而虚降)
  const longKeys = (hs: ReportHolding[]) => new Set(hs.filter((h) => !h.putCall).map((h) => keyOf(h.cusip)));
  const delta = new Map<string, number>();
  for (const m of filers) {
    if (!m.prior) continue;
    const now = longKeys(m.current!);
    const before = longKeys(m.prior);
    for (const k of now) if (!before.has(k)) delta.set(k, (delta.get(k) ?? 0) + 1);
    for (const k of before) if (!now.has(k)) delta.set(k, (delta.get(k) ?? 0) - 1);
  }
  const allHeld: MostHeldItem[] = holdings.map((r) => ({
    ...stock(r.ticker, r.issuer), holderCount: r.holder_count, holderDelta: delta.get(r.ticker) ?? 0,
  }));

  // —— 击球区交集
  const strike: StrikeZoneItem[] = allHeld
    .filter((r) => r.ticker && r.holderCount >= CONSENSUS_MIN_HOLDERS_REPORT && bargains.has(r.ticker))
    .map((r) => {
      const b = bargains.get(r.ticker!)!;
      return { key: r.key, ticker: r.ticker, issuer: r.issuer, holderCount: r.holderCount, position: b.inStrikeZone ? "strike_zone" as const : "below" as const, marginPct: b.marginPct };
    })
    .sort((a, b) => b.holderCount - a.holderCount || b.marginPct - a.marginPct);
  // 估值整体不可用 ≠ 没有便宜票:前者 no_valuation,后者 no_qualifying。
  const strikeReason = noFilers ? "no_filers" : !valuationAvailable ? "no_valuation" : "no_qualifying";

  // —— 名家动作:权重变化绝对值最大的 1–2 条
  const bySlug = new Map(managers.map((m) => [m.slug, m]));
  const featured: FeaturedEntry[] = [];
  for (const slug of featuredSlugs) {
    const m = bySlug.get(slug);
    if (!m) continue;
    const entry: FeaturedEntry = { slug, person: m.person, personZh: m.personZh, filed: m.current !== null, moves: [] };
    if (m.current && m.prior) entry.moves = topWeightMoves(m.current, m.prior, keyOf, stock);
    featured.push(entry);
  }

  const reason = noFilers ? "no_filers" : "no_qualifying";
  return {
    schemaVersion: 1,
    period,
    coverage,
    bought: section(bought, reason),
    sold: section(sold, reason),
    mostHeld: section(allHeld.slice(0, TOP_N), reason),
    strikeZone: section(strike, strikeReason),
    featured,
  };
}

function topWeightMoves(
  current: ReportHolding[],
  prior: ReportHolding[],
  keyOf: (cusip: string) => string,
  stock: (key: string, issuer: string) => ReportStock,
): FeaturedMove[] {
  const changes: ScanChange[] = diffHoldings(toDiffRows(current), toDiffRows(prior)).filter((c) => !c.putCall);
  const weightOf = (hs: ReportHolding[], cusip: string) => hs.find((h) => h.cusip === cusip && !h.putCall)?.weight ?? 0;
  return changes
    .map((c) => {
      const before = weightOf(prior, c.cusip);
      const after = weightOf(current, c.cusip);
      return { ...stock(keyOf(c.cusip), c.issuer), kind: c.kind as MoveKind, weightBefore: before, weightAfter: after };
    })
    .sort((a, b) => Math.abs(b.weightAfter - b.weightBefore) - Math.abs(a.weightAfter - a.weightBefore))
    .slice(0, FEATURED_MOVES);
}
