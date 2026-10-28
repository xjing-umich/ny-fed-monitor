import "server-only";
import type {
  ManagerIndex, ManagerSummary, ManagerDetail, Manager, FilingData, Holding, ManagerQoQ,
} from "@/lib/managers/types";
import { assembleManagerDetail, tickerCanon, type CanonicalKey } from "@/lib/managers/assemble";
import { getCusipMap } from "@/lib/managers/securities";
import { getDb, withRetry, selectAllPages, isMissingTableError } from "@/lib/managers/db";
import { factorLookup, NO_SPLITS, type SplitFactorLookup } from "@/lib/managers/splitAdjust";
import { overlayZeroReports, type ZeroFilingRow } from "@/lib/managers/zeroReports";

/**
 * holdings 的显式读取列 —— egress 护栏。表共 9 列，`id` 在读取侧无用
 * (rowToHolding 只取 7 个字段，byFiling 用 filing_id 分组)。
 * 单行省约 7%；真正的量在调用频次上(valuation:ingest 的 collectUniverse、
 * aggregations 的 scanAllManagers 都会把整张 52k 行表拉一遍)。
 * 必须是字符串字面量：拼接/join 得到 string 会让 supabase-js 行类型推导退化。
 */
const HOLDINGS_SELECT = "filing_id,cusip,issuer,title_of_class,value,shares,put_call,weight";

type IndexRow = ManagerSummary & { top_holding: string; total_value: number; holding_count: number; filed_at: string | null };

// --- pure mappers (unit-tested) ---
export function mapIndexRows(rows: IndexRow[], generatedAt: string): ManagerIndex {
  const managers: ManagerSummary[] = rows
    .map((r) => ({
      cik: r.cik, slug: r.slug, name: r.name, person: r.person,
      period: r.period, filedAt: r.filed_at ?? null, totalValue: Number(r.total_value),
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
export function mapDetailRows(manager: Manager, filingRows: any[], holdingRows: any[], splits: SplitFactorLookup = NO_SPLITS, canon?: CanonicalKey): ManagerDetail {
  const byFiling = (fid: number) => holdingRows.filter((h) => h.filing_id === fid).map(rowToHolding).sort((a, b) => b.value - a.value);
  const toFiling = (r: any): FilingData => ({ period: r.period, filedAt: r.filed_at, accession: r.accession, totalValue: Number(r.total_value), holdings: byFiling(r.id) });
  const filings = filingRows.map(toFiling);
  return assembleManagerDetail(manager, filings, splits, canon);
}

// --- live queries (verified manually once creds exist) ---
export async function getManagerIndex(generatedAt: string): Promise<ManagerIndex> {
  const db = getDb();
  // latest filing per manager + its top holding, via a view-like query
  const { data, error } = await db.rpc("manager_index"); // see README: optional SQL function; fallback below
  if (!error && data) {
    // 零持仓季补丁(见 overlayZeroReports)。这一查询出错要 THROW:吞掉会让零持仓户悄悄退回旧季。
    const { data: zeros, error: zErr } = await withRetry(() => db.from("filings").select("cik,period,filed_at").eq("holding_count", 0));
    if (zErr) throw new Error(`getManagerIndex zero-holding filings query failed: ${zErr.message}`);
    return mapIndexRows(overlayZeroReports(data as IndexRow[], (zeros ?? []) as ZeroFilingRow[]), generatedAt);
  }
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
      const { data: f, error: fErr } = await withRetry(() => db.from("filings").select("*").eq("cik", m.cik).order("period", { ascending: false }).limit(8));
      if (fErr) throw new Error(`getManagerIndex filings query failed (${m.cik}): ${fErr.message}`);
      for (const latest of f ?? []) {
        // 分页:单季也可能逼近 1000 行上限(Bridgewater 2026-06-30 = 997 行)。id 作次序键保证分页不漏行。
        const { data: h, error: hErr } = await selectAllPages(() => db.from("holdings").select("issuer,value,put_call").eq("filing_id", latest.id).order("value", { ascending: false }).order("id", { ascending: true }));
        if (hErr) throw new Error(`getManagerIndex holdings query failed (${m.cik}): ${hErr.message}`);
        const longHoldings = (h ?? []).filter((row: any) => !row.put_call);
        // 零持仓申报(holding_count 0 且无 holdings 行)就是该户最新一季,不能跳过退回旧季。
        const zeroReport = (h ?? []).length === 0 && Number(latest.holding_count) === 0;
        if (longHoldings.length === 0 && !zeroReport) continue;
        const totalValue = longHoldings.reduce((s: number, row: any) => s + Number(row.value ?? 0), 0);
        return { ...m, period: latest.period, filed_at: latest.filed_at ?? null, filedAt: latest.filed_at ?? null, total_value: totalValue, holding_count: longHoldings.length, top_holding: longHoldings[0]?.issuer ?? "", totalValue, holdingCount: longHoldings.length, topHolding: longHoldings[0]?.issuer ?? "" } as IndexRow;
      }
      return null;
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

export type SummaryRow = { cik: string; latest_value: number | string; prior_value: number | string; latest_count: number; prior_count: number; count_verdict: string; top_moves: { issuer: string; kind: string }[] };
/** manager_quarter_summary 行 → 列表页 ManagerQoQ。PR A 阶段 verdict 仍用只数口径(count_verdict),与详情页一致。 */
export function mapSummaryRows(rows: SummaryRow[]): Map<string, ManagerQoQ> {
  const out = new Map<string, ManagerQoQ>();
  for (const r of rows) {
    const prior = Number(r.prior_value);
    const top = r.top_moves?.[0];
    out.set(r.cik, {
      valueDeltaPct: prior > 0 ? (Number(r.latest_value) - prior) / prior : null,
      countDelta: r.latest_count - r.prior_count,
      verdict: (r.count_verdict as ManagerQoQ["verdict"]) ?? null,
      topMoveIssuer: top?.issuer ?? null,
      topMoveKind: (top?.kind as ManagerQoQ["topMoveKind"]) ?? null,
    });
  }
  return out;
}

/**
 * 每户季度变化信号(cik → ManagerQoQ)。仅 /investors 列表页调用。
 * 读 manager_quarter_summary;表未迁移、或表已建但还没有行(DDL 之后、首次共识运行之前)→ 回退 RPC manager_qoq
 * (空表若直接返回空 Map,/investors 的 ISR 会把"—"缓存 3 天);其他出错 → console.error 后返回空 Map(优雅降级)。
 */
export async function getManagerQoQ(): Promise<Map<string, ManagerQoQ>> {
  const db = getDb();
  // 读入库时算好的季度汇总(拆股已换算,与详情页同一函数);表未迁移 → 回退旧 RPC manager_qoq。
  const { data: rows, error: tErr } = await db.from("manager_quarter_summary").select("cik,latest_value,prior_value,latest_count,prior_count,count_verdict,top_moves");
  if (!tErr && rows?.length) return mapSummaryRows(rows as SummaryRow[]);
  if (tErr && !isMissingTableError(tErr)) {
    console.error(`getManagerQoQ manager_quarter_summary query failed: ${tErr.message}`);
    return new Map(); // 与原函数一致:出错优雅降级为空 Map(列表不显 QoQ)
  }
  const out = new Map<string, ManagerQoQ>();
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

export async function getManagerDetail(cikOrSlug: string, opts: { adjustSplits?: boolean } = {}): Promise<ManagerDetail | null> {
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
  // 必须分页:大户 8 季持仓远超 1000 行上限,单次查询会被静默截断(见 selectAllPages)。
  const { data: holdings, error: hErr } = await selectAllPages(() => db.from("holdings").select(HOLDINGS_SELECT).in("filing_id", ids).order("id", { ascending: true }));
  if (hErr) throw new Error(`getManagerDetail holdings query failed (${m.cik}): ${hErr.message}`);
  if (!filings?.length) return null;
  // 拆股换算系数:只取本人各季作为 to_period 的行(全表约几百行,按季过滤后更少)。
  // 表未迁移 → 系数 1(旧行为);其他错误照样 THROW(见上方注释:不能吞成 404)。
  let splits: SplitFactorLookup = NO_SPLITS;
  if (opts.adjustSplits !== false) {
    const periods = filings.map((f: { period: string }) => f.period);
    // 分页 + 稳定排序(几百行逼近 1000 行上限时不能静默截断);表缺失不重试(withRetry 会对 42P01 退避 3 次,白等 ~0.5s)。
    const { data: sa, error: sErr } = await selectAllPages<{ cusip: string; from_period: string; to_period: string; factor: number | string }>(
      () => db.from("split_adjustments").select("cusip,from_period,to_period,factor").in("to_period", periods).order("cusip").order("from_period").order("to_period"),
      undefined,
      (e) => !isMissingTableError(e as { code?: string }),
    );
    // selectAllPages 原样透出 PostgREST error(含 code),类型上只声明了 message,故断言。
    if (sErr && !isMissingTableError(sErr as { code?: string })) throw new Error(`getManagerDetail split_adjustments query failed (${m.cik}): ${sErr.message}`);
    if (sa?.length) splits = factorLookup(sa.map((r: { cusip: string; from_period: string; to_period: string; factor: number | string }) => ({ cusip: r.cusip, fromPeriod: r.from_period, toPeriod: r.to_period, factor: Number(r.factor) })));
  }
  // 换 CUSIP 归并:按 ticker 比对两季(进程级缓存的证券脊梁,不另起查询)。
  const cusipMap = await getCusipMap();
  const canon = tickerCanon((c) => cusipMap.get(c)?.ticker);
  return mapDetailRows({ cik: m.cik, slug: m.slug, name: m.name, person: m.person }, filings, holdings ?? [], splits, canon);
}
