import "server-only";
import type {
  ManagerIndex, ManagerSummary, ManagerDetail, Manager, FilingData, Holding, ManagerQoQ,
} from "@/lib/managers/types";
import { assembleManagerDetail } from "@/lib/managers/assemble";
import { getDb, withRetry } from "@/lib/managers/db";

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
export function mapDetailRows(manager: Manager, filingRows: any[], holdingRows: any[]): ManagerDetail {
  const byFiling = (fid: number) => holdingRows.filter((h) => h.filing_id === fid).map(rowToHolding).sort((a, b) => b.value - a.value);
  const toFiling = (r: any): FilingData => ({ period: r.period, filedAt: r.filed_at, accession: r.accession, totalValue: Number(r.total_value), holdings: byFiling(r.id) });
  const filings = filingRows.map(toFiling);
  return assembleManagerDetail(manager, filings);
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
  // 同上:出错 THROW,不能把"查询失败"误当成"该户无 filing"而静默从索引里丢掉
  // (一次抖动 → 索引少几户 → 列表页/个股页"谁在持有"残缺)。RPC 路径仍优先。
  const { data: mgrs, error: mErr } = await withRetry(() => db.from("managers").select("*"));
  if (mErr) throw new Error(`getManagerIndex managers query failed: ${mErr.message}`);
  const rows = await Promise.all(
    (mgrs ?? []).map(async (m): Promise<IndexRow | null> => {
      const { data: f, error: fErr } = await withRetry(() => db.from("filings").select("*").eq("cik", m.cik).order("period", { ascending: false }).limit(1));
      if (fErr) throw new Error(`getManagerIndex filings query failed (${m.cik}): ${fErr.message}`);
      const latest = f?.[0];
      if (!latest) return null;
      const { data: h, error: hErr } = await withRetry(() => db.from("holdings").select("issuer,value").eq("filing_id", latest.id).order("value", { ascending: false }).limit(1));
      if (hErr) throw new Error(`getManagerIndex holdings query failed (${m.cik}): ${hErr.message}`);
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
  // 关键:查询出错(超时/限流/后端抖动)必须 THROW,不能吞成 null。
  // 吞成 null → 页面 notFound() → ISR 把 404 缓存 revalidate(1h),一次后端抖动 = 招牌页死链一小时,
  // 还会让 Google 据 404 取消收录。THROW 则 ISR 走 stale-while-revalidate / 500 并下次重试,绝不缓存假 404。
  // null 仅在「查询成功但确实查无此户/无 filing」时返回(真正的 404)。
  const { data: mgrs, error: mErr } = await withRetry(() => db.from("managers").select("*").or(`cik.eq.${cikOrSlug},slug.eq.${cikOrSlug}`).limit(1));
  if (mErr) throw new Error(`getManagerDetail managers query failed (${cikOrSlug}): ${mErr.message}`);
  const m = mgrs?.[0];
  if (!m) return null;
  const { data: filings, error: fErr } = await withRetry(() => db.from("filings").select("*").eq("cik", m.cik).order("period", { ascending: false }).limit(8));
  if (fErr) throw new Error(`getManagerDetail filings query failed (${m.cik}): ${fErr.message}`);
  const ids = (filings ?? []).map((f: any) => f.id);
  const { data: holdings, error: hErr } = await withRetry(() => db.from("holdings").select("*").in("filing_id", ids));
  if (hErr) throw new Error(`getManagerDetail holdings query failed (${m.cik}): ${hErr.message}`);
  if (!filings?.length) return null;
  return mapDetailRows({ cik: m.cik, slug: m.slug, name: m.name, person: m.person }, filings, holdings ?? []);
}
