import "server-only";
import type {
  ManagerIndex, ManagerSummary, ManagerDetail, Manager, FilingData, Holding, HoldingChange, ManagerQoQ,
} from "@/lib/managers/types";
import { getDb } from "@/lib/managers/db";

type IndexRow = ManagerSummary & { top_holding: string; total_value: number; holding_count: number };

// --- pure mappers (unit-tested) ---
export function mapIndexRows(rows: IndexRow[], generatedAt: string): ManagerIndex {
  const managers: ManagerSummary[] = rows
    .map((r) => ({
      cik: r.cik, slug: r.slug, name: r.name, person: r.person,
      period: r.period, totalValue: Number(r.total_value),
      holdingCount: Number(r.holding_count), topHolding: r.top_holding ?? "",
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
  return { generatedAt, managers };
}

function rowToHolding(r: any): Holding {
  return {
    cusip: r.cusip, issuer: r.issuer, titleOfClass: r.title_of_class ?? undefined,
    value: Number(r.value), shares: Number(r.shares),
    putCall: r.put_call ?? undefined, weight: Number(r.weight),
  };
}
function key(h: { cusip: string; putCall?: string }): string { return `${h.cusip}|${h.putCall ?? ""}`; }

function computeChanges(latest: Holding[], prior: Holding[]): HoldingChange[] {
  const lm = new Map(latest.map((h) => [key(h), h]));
  const pm = new Map(prior.map((h) => [key(h), h]));
  const out: HoldingChange[] = [];
  for (const [k, lh] of lm) {
    const ph = pm.get(k);
    if (!ph) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "new", prevShares: 0, shares: lh.shares, value: lh.value, deltaPct: null });
    else {
      const delta = lh.shares - ph.shares;
      if (delta !== 0) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: delta > 0 ? "increased" : "decreased", prevShares: ph.shares, shares: lh.shares, value: lh.value, deltaPct: ph.shares !== 0 ? delta / ph.shares : null });
    }
  }
  for (const [k, ph] of pm) if (!lm.has(k)) out.push({ cusip: ph.cusip, issuer: ph.issuer, kind: "exited", prevShares: ph.shares, shares: 0, value: 0, deltaPct: -1 });
  return out;
}

export function mapDetailRows(manager: Manager, filingRows: any[], holdingRows: any[]): ManagerDetail {
  const sorted = [...filingRows].sort((a, b) => (b.period > a.period ? 1 : -1));
  const latestRow = sorted[0];
  const priorRow = sorted[1];
  const byFiling = (fid: number) => holdingRows.filter((h) => h.filing_id === fid).map(rowToHolding).sort((a, b) => b.value - a.value);
  const toFiling = (r: any): FilingData => ({ period: r.period, filedAt: r.filed_at, accession: r.accession, totalValue: Number(r.total_value), holdings: byFiling(r.id) });
  const latest = toFiling(latestRow);
  const prior = priorRow ? toFiling(priorRow) : undefined;
  const changes = prior ? computeChanges(latest.holdings, prior.holdings) : [];
  return { manager, latest, prior, changes };
}

// --- live queries (verified manually once creds exist) ---
export async function getManagerIndex(generatedAt: string): Promise<ManagerIndex> {
  const db = getDb();
  // latest filing per manager + its top holding, via a view-like query
  const { data, error } = await db.rpc("manager_index"); // see README: optional SQL function; fallback below
  if (!error && data) return mapIndexRows(data as IndexRow[], generatedAt);
  // Fallback: compose in TS if the manager_index RPC isn't present.
  // 关键性能点:此前对每个 manager 串行查 filings→holdings(~34×2 次首尾相接的往返,
  // 在远端 Supabase 上累计十几秒),而本函数在根布局里对每个请求都执行——这是全站
  // "每页等十几秒"的主因。改为 Promise.all 并行:等待时间由"累加"降为"取最慢一个"。
  // 注:理想是建 manager_index SQL 函数一次返回(见 README),那条更快路径仍优先生效。
  const { data: mgrs } = await db.from("managers").select("*");
  const rows = await Promise.all(
    (mgrs ?? []).map(async (m): Promise<IndexRow | null> => {
      const { data: f } = await db.from("filings").select("*").eq("cik", m.cik).order("period", { ascending: false }).limit(1);
      const latest = f?.[0];
      if (!latest) return null;
      const { data: h } = await db.from("holdings").select("issuer,value").eq("filing_id", latest.id).order("value", { ascending: false }).limit(1);
      return { ...m, period: latest.period, total_value: latest.total_value, holding_count: latest.holding_count, top_holding: h?.[0]?.issuer ?? "", totalValue: latest.total_value, holdingCount: latest.holding_count, topHolding: h?.[0]?.issuer ?? "" } as IndexRow;
    })
  );
  const out = rows.filter((x): x is IndexRow => x !== null);
  return mapIndexRows(out, generatedAt);
}

// manager_qoq RPC 行(snake_case, 与 SQL 函数 returns table 一一对应)。
type QoQRow = {
  cik: string;
  value_delta_pct: number | null;
  count_delta: number | null;
  verdict: string | null;
  top_move_issuer: string | null;
  top_move_kind: string | null;
};

/**
 * 每户季度变化信号 Map(cik → ManagerQoQ)。仅 /investors 列表页调用。
 * 函数未部署/出错 → 返回空 Map(优雅降级,列表不显 QoQ,不抛)。
 */
export async function getManagerQoQ(): Promise<Map<string, ManagerQoQ>> {
  const out = new Map<string, ManagerQoQ>();
  const db = getDb();
  const { data, error } = await db.rpc("manager_qoq");
  if (error || !data) return out;
  for (const r of data as QoQRow[]) {
    out.set(r.cik, {
      valueDeltaPct: r.value_delta_pct,
      countDelta: r.count_delta,
      verdict: (r.verdict as ManagerQoQ["verdict"]) ?? null,
      topMoveIssuer: r.top_move_issuer,
      topMoveKind: (r.top_move_kind as ManagerQoQ["topMoveKind"]) ?? null,
    });
  }
  return out;
}

export async function getManagerDetail(cikOrSlug: string): Promise<ManagerDetail | null> {
  const db = getDb();
  const { data: mgrs } = await db.from("managers").select("*").or(`cik.eq.${cikOrSlug},slug.eq.${cikOrSlug}`).limit(1);
  const m = mgrs?.[0];
  if (!m) return null;
  const { data: filings } = await db.from("filings").select("*").eq("cik", m.cik).order("period", { ascending: false }).limit(2);
  const ids = (filings ?? []).map((f: any) => f.id);
  const { data: holdings } = await db.from("holdings").select("*").in("filing_id", ids);
  if (!filings?.length) return null;
  return mapDetailRows({ cik: m.cik, slug: m.slug, name: m.name, person: m.person }, filings, holdings ?? []);
}
