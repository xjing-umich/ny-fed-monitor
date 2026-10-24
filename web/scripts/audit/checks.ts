/**
 * 数据审计 · 检查项:只读本地快照,按 13F 持仓 → 投资人 → 财报 → 估值 → 交叉验证 → 全链路六组输出结构化结果。
 *
 * 状态口径:
 *   ok    硬约束,为 0 才算通过;不为 0 → warn
 *   warn  需关注
 *   watch 已知、长期存在的观察项(只看趋势,report 里与上次对比,变多就升为需关注)
 *   info  只是数字/日期,不判对错(如 TTM/FY 口径数)
 */
import * as fs from "fs";
import * as path from "path";
import { countsAsCurrentHolder } from "../../src/lib/freshness/derive";
import type { SnapshotMeta } from "./snapshot";

export type Status = "ok" | "warn" | "watch" | "info";
export type Check = {
  id: string;
  area: string;
  title: string;
  status: Status;
  value: number | string;
  detail?: string;
  examples?: unknown[];
};
export type DataDate = { label: string; source: string; value: string };
export type AuditResult = { runAt: string; today: string; meta: SnapshotMeta; dates: DataDate[]; checks: Check[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const num = (x: unknown) => (x == null ? 0 : Number(x));
const group = <T, K>(xs: T[], k: (x: T) => K) => {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const key = k(x);
    const arr = m.get(key);
    if (arr) arr.push(x);
    else m.set(key, [x]);
  }
  return m;
};
const counter = <T>(xs: T[]) => {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const fmtCounter = (c: Array<[unknown, number]>, n = 8) => c.slice(0, n).map(([k, v]) => `${k}: ${v}`).join(", ");
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
const qidx = (p: string) => Number(p.slice(0, 4)) * 4 + Math.floor((Number(p.slice(5, 7)) - 1) / 3);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** 同 cik 取最新 period;同 period 并存原件与修正件时取 filed_at 最新、再取 id 大者(与 computeConsensus 一致)。 */
function latestFilingPerManager(filings: Row[], keep: (f: Row) => boolean = () => true): Map<string, Row> {
  const out = new Map<string, Row>();
  for (const f of filings) {
    if (!keep(f)) continue;
    const prev = out.get(f.cik);
    if (
      !prev ||
      f.period > prev.period ||
      (f.period === prev.period && ((f.filed_at ?? "") > (prev.filed_at ?? "") || ((f.filed_at ?? "") === (prev.filed_at ?? "") && f.id > prev.id)))
    )
      out.set(f.cik, f);
  }
  return out;
}

export function runChecks(dir: string, managersConfigPath: string, meta: SnapshotMeta): AuditResult {
  const L = (n: string): Row[] => JSON.parse(fs.readFileSync(path.join(dir, `${n}.json`), "utf8"));
  const runAt = new Date().toISOString();
  const today = runAt.slice(0, 10);
  const todayDate = new Date(today + "T00:00:00Z");
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const must0 = (id: string, area: string, title: string, list: unknown[], detail?: string) =>
    add({ id, area, title, status: list.length === 0 ? "ok" : "warn", value: list.length, detail, examples: list.slice(0, 8) });
  const watch = (id: string, area: string, title: string, list: unknown[], detail?: string) =>
    add({ id, area, title, status: "watch", value: list.length, detail, examples: list.slice(0, 8) });
  const info = (id: string, area: string, title: string, value: number | string, detail?: string) => add({ id, area, title, status: "info", value, detail });

  const managersList = L("managers");
  const managers = new Map(managersList.map((m) => [m.cik, m]));
  const slug = (cik: string) => managers.get(cik)?.slug ?? cik;
  const filings = L("filings");
  const fil = new Map(filings.map((f) => [f.id, f]));
  const holdings = L("holdings");
  const cus = new Map(L("security_cusips").map((c) => [c.cusip, c]));
  const tk = (c: string): string | undefined => cus.get(c)?.ticker ?? undefined;
  const byf = group(holdings, (h) => h.filing_id);
  const longs = (fid: number) => (byf.get(fid) ?? []).filter((h) => !h.put_call);
  const latest = latestFilingPerManager(filings);

  // ── 1. 13F 持仓 ──────────────────────────────────────────────
  const A = "13F 持仓";
  const badTot: unknown[] = [];
  const badCnt: unknown[] = [];
  for (const f of filings) {
    const hs = byf.get(f.id) ?? [];
    const sAll = hs.reduce((s, h) => s + num(h.value), 0);
    const sLong = hs.filter((h) => !h.put_call).reduce((s, h) => s + num(h.value), 0);
    const tv = num(f.total_value);
    if (tv && Math.min(Math.abs(tv - sAll), Math.abs(tv - sLong)) / tv > 0.01) badTot.push([slug(f.cik), f.period, tv, sAll, sLong]);
    const nLong = hs.filter((h) => !h.put_call).length;
    if (num(f.holding_count) !== hs.length && num(f.holding_count) !== nLong) badCnt.push([slug(f.cik), f.period, f.holding_count, hs.length, nLong]);
  }
  must0("H1a", A, "申报表头 total_value 与持仓行合计差 >1%", badTot, `共 ${filings.length} 份 13F`);
  must0("H1b", A, "申报表头 holding_count 与持仓行数不符", badCnt);
  watch("H1c", A, "没有任何持仓行的申报", filings.filter((f) => !byf.get(f.id)?.length).map((f) => [slug(f.cik), f.period]));

  const wb: unknown[] = [];
  for (const [fid, hs] of byf) {
    const w = hs.reduce((s, h) => s + num(h.weight), 0);
    const wl = hs.filter((h) => !h.put_call).reduce((s, h) => s + num(h.weight), 0);
    if (!((w >= 0.97 && w <= 1.03) || (wl >= 0.97 && wl <= 1.03) || (w >= 97 && w <= 103))) wb.push([slug(fil.get(fid)?.cik), fil.get(fid)?.period, +w.toFixed(3)]);
  }
  must0("H2", A, "权重合计不在 ~1 的申报", wb);

  const dup = counter(holdings.map((h) => `${h.filing_id}|${h.cusip}|${h.put_call ?? ""}`)).filter(([, n]) => n > 1);
  must0("H3", A, "重复持仓行(同申报+CUSIP+put/call)", dup.map(([k, n]) => {
    const [fid, c] = k.split("|");
    return [slug(fil.get(Number(fid))?.cik), fil.get(Number(fid))?.period, c, n];
  }));
  watch("H4a", A, "value≤0 或 shares≤0 的持仓行", holdings.filter((h) => num(h.value) <= 0 || num(h.shares) <= 0).map((h) => [h.issuer, h.value, h.shares]));
  must0("H4b", A, "CUSIP 不是 9 位", [...new Set(holdings.filter((h) => (h.cusip ?? "").length !== 9).map((h) => h.cusip))]);

  const jumps: unknown[] = [];
  const dupPeriod: unknown[] = [];
  const gaps: unknown[] = [];
  for (const [cik, fs0] of group(filings, (f) => f.cik)) {
    const fsorted = [...fs0].sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
    for (const [p, n] of counter(fs0.map((f) => f.period))) if (n > 1) dupPeriod.push([slug(cik), p, n]);
    for (let i = 1; i < fsorted.length; i++) {
      const a = fsorted[i - 1];
      const b = fsorted[i];
      if (num(a.total_value) && num(b.total_value)) {
        const r = num(b.total_value) / num(a.total_value);
        if (r > 8 || r < 0.125) jumps.push([slug(cik), a.period, b.period, +r.toFixed(2)]);
      }
      if (qidx(b.period) - qidx(a.period) > 1) gaps.push([slug(cik), a.period, b.period]);
    }
  }
  watch("H5a", A, "组合市值环比 ×8 / ÷8 跳变", jumps, "多为赎回/清盘或申报范围变化,需人工确认不是单位错");
  must0("H5b", A, "同一投资人同一季度有多份申报", dupPeriod);
  must0("H5c", A, "历史中间缺季度", gaps);

  let tot = 0, mapped = 0, nTot = 0, nMap = 0;
  const unm = new Map<string, number>();
  for (const f of latest.values())
    for (const h of longs(f.id)) {
      tot += num(h.value);
      nTot++;
      if (tk(h.cusip)) {
        mapped += num(h.value);
        nMap++;
      } else unm.set(`${h.cusip} ${h.issuer} ${h.title_of_class ?? ""}`, (unm.get(`${h.cusip} ${h.issuer} ${h.title_of_class ?? ""}`) ?? 0) + num(h.value));
    }
  const valCov = tot ? mapped / tot : 0;
  add({
    id: "H6a", area: A, title: "最新季多头持仓 CUSIP→代码 映射率(按市值)",
    status: valCov >= 0.99 ? "ok" : "warn", value: pct(valCov),
    detail: `行数 ${nMap}/${nTot}(${pct(nTot ? nMap / nTot : 0)});低于 99% 判需关注`,
    examples: [...unm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} $${(v / 1e9).toFixed(2)}B`),
  });
  watch("H6b", A, "security_cusips 未解析", [...cus.values()].filter((c) => !c.resolved).map((c) => c.cusip));

  // ── 2. 投资人 ──────────────────────────────────────────────
  const B = "投资人";
  const cfgRaw = JSON.parse(fs.readFileSync(managersConfigPath, "utf8"));
  const cfg: Row[] = Array.isArray(cfgRaw) ? cfgRaw : cfgRaw.managers ?? cfgRaw;
  const ccik = new Map(cfg.map((c) => [String(c.cik).replace(/^0+/, ""), c]));
  const dcik = new Map(managersList.map((m) => [String(m.cik).replace(/^0+/, ""), m]));
  must0("I1a", B, "config/managers.json 与 managers 表不一致", [
    ...[...ccik].filter(([k]) => !dcik.has(k)).map(([, c]) => `仅配置有: ${c.slug}`),
    ...[...dcik].filter(([k]) => !ccik.has(k)).map(([, m]) => `仅库里有: ${m.slug}`),
    ...[...dcik].filter(([k, m]) => ccik.has(k) && ccik.get(k)!.slug !== m.slug).map(([k, m]) => `slug 不同: ${m.slug} / ${ccik.get(k)!.slug}`),
  ], `配置 ${cfg.length} / 库 ${managersList.length}`);
  must0("I1b", B, "name/person 为空", managersList.filter((m) => !(m.name && m.person)).map((m) => m.slug));
  must0("I1c", B, "slug 重复", counter(managersList.map((m) => m.slug)).filter(([, n]) => n > 1).map(([s]) => s));
  watch("I2", B, "未交上最近一个已到期季度的投资人(不计入当前持有人)",
    managersList.filter((m) => !countsAsCurrentHolder(latest.get(m.cik)?.period ?? null, todayDate)).map((m) => `${m.slug} ${latest.get(m.cik)?.period ?? "无"}`));

  // manager_index 跳过空申报,对比口径是"最新的非空申报"
  const latestNonEmpty = latestFilingPerManager(filings, (f) => longs(f.id).length > 0);
  const idx = new Map(L("rpc_manager_index").map((r) => [r.cik, r]));
  const rpcBad: unknown[] = [];
  for (const m of managersList) {
    const r = idx.get(m.cik);
    if (!r) {
      rpcBad.push([m.slug, "RPC 缺行"]);
      continue;
    }
    const f = latestNonEmpty.get(m.cik);
    const ls = f ? longs(f.id).sort((a, b) => num(b.value) - num(a.value)) : [];
    const expV = ls.reduce((s, h) => s + num(h.value), 0);
    const diffs: string[] = [];
    if (f && String(r.period) !== f.period) diffs.push(`period ${r.period} vs ${f.period}`);
    if (num(r.holding_count) !== ls.length) diffs.push(`count ${r.holding_count} vs ${ls.length}`);
    if (Math.abs(num(r.total_value) - expV) > 0.005 * Math.max(1, expV)) diffs.push(`value ${r.total_value} vs ${expV}`);
    if ((r.top_holding ?? "") !== (ls[0]?.issuer ?? "")) diffs.push(`top ${r.top_holding} vs ${ls[0]?.issuer ?? ""}`);
    if (diffs.length) rpcBad.push([m.slug, diffs.join("; ")]);
  }
  must0("I3", B, "manager_index RPC 与 filings/holdings 重算不符", rpcBad, `RPC ${idx.size} 行`);
  const qoq = new Map(L("rpc_manager_qoq").map((r) => [r.cik, r]));
  must0("I4a", B, "manager_qoq 缺环比结论", managersList.filter((m) => qoq.get(m.cik)?.verdict == null).map((m) => m.slug));
  watch("I4b", B, "组合市值环比超过 ±60%", managersList.filter((m) => Math.abs(num(qoq.get(m.cik)?.value_delta_pct)) > 60).map((m) => [m.slug, qoq.get(m.cik)?.value_delta_pct]));

  // ── 3. 财报 ──────────────────────────────────────────────
  const C = "SEC 财报";
  const P = L("company_fundamentals_periods");
  const latestF = new Map(L("company_fundamentals_latest").map((r) => [r.ticker, r]));
  const comp = new Map(L("sec_companies").map((r) => [r.ticker, r]));
  const splits = group(L("stock_splits"), (s) => s.ticker);
  const byT = group(P, (r) => r.ticker);
  const ANNUAL = new Set(["10-K", "20-F", "40-F"]);
  const maxOf = (xs: string[]) => xs.reduce<string | null>((m, x) => (m == null || x > m ? x : m), null);
  const latFy = new Map([...byT].map(([t, rs]) => [t, maxOf(rs.filter((r) => ANNUAL.has(r.form)).map((r) => r.period_end))]));
  const latQ = new Map([...byT].map(([t, rs]) => [t, maxOf(rs.filter((r) => r.form === "10-Q").map((r) => r.period_end))]));
  const latAny = new Map([...byT].map(([t, rs]) => [t, maxOf(rs.map((r) => r.period_end))!]));
  info("F0", C, "覆盖", `有财报期 ${byT.size} 家 / sec_companies ${comp.size} / latest 表 ${latestF.size}`, fmtCounter(counter(P.map((r) => r.form))));
  const ageB = counter([...latAny.values()].map((d) => {
    const a = daysBetween(d, today);
    return a <= 135 ? "≤135天" : a <= 230 ? "136–230天" : a <= 548 ? "231–548天" : ">18个月";
  }));
  info("F1a", C, `最新一期 period_end 距今(${today})`, fmtCounter(ageB));
  watch("F1b", C, "没有任何年报", [...latFy].filter(([, d]) => d == null).map(([t]) => t));
  watch("F1c", C, "美国本土 10-Q 申报人最新一期距今 >135 天", [...byT.keys()].filter((t) => latQ.get(t) && !comp.get(t)?.is_foreign_issuer && daysBetween(latAny.get(t)!, today) > 135).sort());

  const iss = new Map<string, unknown[]>();
  const push = (k: string, v: unknown) => (iss.get(k) ?? iss.set(k, []).get(k)!).push(v);
  for (const [t, rs] of byT) {
    for (const r of rs) {
      const rev = r.revenue, oi = r.operating_income, ni = r.net_income;
      if (rev != null && rev < 0) push("revenue<0", [t, r.period_end]);
      if (rev && oi != null && oi > rev * 1.001 && rev > 0) push("营业利润>营收", [t, r.form, r.period_end]);
      if (r.total_assets && r.shareholders_equity && r.shareholders_equity > r.total_assets * 1.001) push("权益>总资产", [t, r.period_end]);
      if (r.total_assets && r.total_liabilities != null && r.shareholders_equity != null) {
        const gap = Math.abs(r.total_assets - r.total_liabilities - r.shareholders_equity) / r.total_assets;
        if (gap > 0.15) push("资产≠负债+权益(>15%)", [t, r.form, r.period_end, +gap.toFixed(2)]);
      }
      if (r.eps_diluted && r.shares_diluted && ni && ANNUAL.has(r.form) && Math.abs(ni) > 1e7) {
        const implied = r.eps_diluted * r.shares_diluted;
        if (Math.abs(implied - ni) / Math.abs(ni) > 0.35) push("EPS×股数≠净利(>35%)", [t, r.period_end, +(implied / ni).toFixed(2)]);
      }
    }
    const fys = rs.filter((r) => ANNUAL.has(r.form) && r.shares_diluted).sort((a, b) => (a.period_end < b.period_end ? -1 : 1));
    for (let i = 1; i < fys.length; i++) {
      const a = fys[i - 1], c = fys[i];
      const ratio = c.shares_diluted / a.shares_diluted;
      if (ratio > 2.5 || ratio < 0.4) {
        const hasSplit = (splits.get(t) ?? []).some((s) => a.period_end < s.split_date && s.split_date <= c.period_end);
        push(hasSplit ? "股数跳变(有拆股记录)" : "股数跳变 ×2.5 无拆股", [t, a.period_end, c.period_end, +ratio.toFixed(2)]);
      }
    }
    for (const [k, n] of counter(rs.filter((r) => ANNUAL.has(r.form) && r.fiscal_period === "FY").map((r) => `${r.fiscal_year}|${r.form}`))) if (n > 1) push("同财年重复 FY 行", [t, k]);
    for (const [k, n] of counter(rs.map((r) => `${r.period_end}|${r.form}`))) if (n > 1) push("同 period_end+form 两行(财年标签漂移)", [t, k]);
  }
  const issKeys = ["revenue<0", "营业利润>营收", "权益>总资产", "资产≠负债+权益(>15%)", "EPS×股数≠净利(>35%)", "股数跳变 ×2.5 无拆股", "股数跳变(有拆股记录)", "同财年重复 FY 行", "同 period_end+form 两行(财年标签漂移)"];
  issKeys.forEach((k, i) => {
    const v = iss.get(k) ?? [];
    watch(`F2${String.fromCharCode(97 + i)}`, C, `完整性:${k}`, v, `涉及 ${new Set(v.map((x) => (x as unknown[])[0])).size} 家`);
  });

  const mis: unknown[] = [];
  for (const [t, l] of latestF) {
    if (!byT.has(t)) {
      mis.push([t, "无财报期"]);
      continue;
    }
    if (l.latest_10k_period_end && l.latest_10k_period_end !== latFy.get(t)) mis.push([t, "10k", l.latest_10k_period_end, latFy.get(t)]);
    if (l.latest_10q_period_end && l.latest_10q_period_end !== latQ.get(t)) mis.push([t, "10q", l.latest_10q_period_end, latQ.get(t)]);
  }
  watch("F3a", C, "latest 表与 periods 表不符", mis);
  info("F3b", C, "quality_status 分布", fmtCounter(counter([...latestF.values()].map((l) => l.quality_status))));

  // ── 4. 估值 ──────────────────────────────────────────────
  const D = "估值";
  const Vall = L("valuation_snapshot");
  const batchAt = maxOf(Vall.map((v) => v.computed_at)) ?? "";
  const cur = Vall.filter((v) => v.computed_at === batchAt);
  const old = Vall.filter((v) => v.computed_at !== batchAt);
  info("V0", D, "最新估值批次(computed_at 最大值)", batchAt, `本批 ${cur.length} 行 / 全表 ${Vall.length} 行`);
  must0("V0b", D, "不属于最新批次的遗留行", old.map((v) => [v.ticker, v.computed_at]));
  const vi = new Map<string, unknown[]>();
  const vpush = (k: string, v: unknown) => (vi.get(k) ?? vi.set(k, []).get(k)!).push(v);
  for (const v of cur) {
    const lo = v.range_lo, hi = v.range_hi, p = v.price;
    if (lo == null || hi == null || lo > hi) vpush("lohi", v.ticker);
    if (!p || p <= 0) vpush("price", v.ticker);
    if ((v.verdict_bucket === "above") !== (p > hi * 1.0001)) vpush("bucket", [v.ticker, v.verdict_bucket, p, hi]);
    if (v.in_strike_zone && v.verdict_bucket !== "below") vpush("strike", v.ticker);
    if (v.margin_pct != null && (v.margin_pct > 0.8 || v.margin_pct < -50)) vpush("margin", [v.ticker, +Number(v.margin_pct).toFixed(1)]);
    if (lo && hi / lo > 6) vpush("wide", [v.ticker, +(hi / lo).toFixed(1)]);
    if (hi != null && p && hi < p * 0.02) vpush("tiny", v.ticker);
  }
  must0("V1a", D, "range_lo > range_hi 或缺失", vi.get("lohi") ?? []);
  must0("V1b", D, "price ≤ 0", vi.get("price") ?? []);
  must0("V1c", D, "'above' 档与 price>range_hi 不一致", vi.get("bucket") ?? []);
  must0("V1d", D, "进入击球区但不在 'below' 档", vi.get("strike") ?? []);
  must0("V1e", D, "价值带上沿 <2% 现价", vi.get("tiny") ?? []);
  watch("V1f", D, "价值带宽度 >6 倍", vi.get("wide") ?? []);
  watch("V1g", D, "margin_pct 超出合理区间", vi.get("margin") ?? []);
  const lastTrading = meta.tradingDays[0];
  const oldestTrading = meta.tradingDays[meta.tradingDays.length - 1];
  info("V2a", D, "估值所用 price_date 分布", fmtCounter(counter(cur.map((v) => v.price_date)), 5));
  watch("V2b", D, `price_date 早于最近第 3 个交易日(${oldestTrading ?? "?"})`, cur.filter((v) => !oldestTrading || v.price_date < oldestTrading).map((v) => [v.ticker, v.price_date]));
  const kinds = counter(cur.map((v) => v.basis?.kind ?? "none"));
  info("V2c", D, "财报口径 TTM / FY", `TTM ${kinds.find(([k]) => k === "ttm")?.[1] ?? 0} / FY ${kinds.find(([k]) => k === "fy")?.[1] ?? 0}`, fmtCounter(kinds));
  info("V2d", D, "财报口径 as_of(月)", counter(cur.map((v) => (v.basis?.as_of ?? "none").slice(0, 7))).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 8).map(([k, n]) => `${k}: ${n}`).join(", "));
  info("V2e", D, "档位分布", `${fmtCounter(counter(cur.map((v) => v.verdict_bucket)))} | reliable ${cur.filter((v) => v.reliable).length} | 击球区 ${cur.filter((v) => v.in_strike_zone).length}`);

  // ── 5. 交叉验证 ──────────────────────────────────────────────
  const X = "交叉验证";
  const sec = new Map(L("securities").map((s) => [s.ticker, s]));
  const prices = new Map<string, Map<string, number>>();
  const priceRows = L("prices");
  for (const p of priceRows) (prices.get(p.ticker) ?? prices.set(p.ticker, new Map()).get(p.ticker)!).set(p.date, Number(p.close));
  const qe = meta.quarterEnd;
  const qeOrder = qe ? [qe, ...meta.quarterWindow.filter((d) => d < qe).sort().reverse(), ...meta.quarterWindow.filter((d) => d > qe).sort()] : [];
  const closeAtQe = (t: string) => {
    const m = prices.get(t);
    for (const d of qeOrder) if (m?.has(d)) return m.get(d)!;
    return undefined;
  };
  const agg = new Map<string, { val: number; sh: number; who: Set<string> }>();
  for (const f of filings) {
    if (f.period !== qe) continue;
    for (const h of byf.get(f.id) ?? []) {
      const t = tk(h.cusip);
      if (h.put_call || !t || num(h.shares) <= 0 || num(h.value) <= 0) continue;
      if (/^(NOTE|CONV|DEBT|BOND)/.test((h.title_of_class ?? "").toUpperCase())) continue;
      const a = agg.get(t) ?? agg.set(t, { val: 0, sh: 0, who: new Set() }).get(t)!;
      a.val += num(h.value);
      a.sh += num(h.shares);
      a.who.add(slug(f.cik));
    }
  }
  const x1: unknown[] = [];
  let checked = 0;
  for (const [t, a] of agg) {
    const close = closeAtQe(t);
    if (!close) continue;
    checked++;
    const r = a.val / a.sh / close;
    if (r > 1.6 || r < 0.6) x1.push([t, +r.toFixed(2), +(a.val / a.sh).toFixed(2), close, sec.get(t)?.security_type, [...a.who].sort().slice(0, 3)]);
  }
  watch("X1", X, `13F 隐含价(${qe} value/shares)与季末收盘偏离超 0.6–1.6 倍`, x1, `核对 ${checked}/${agg.size} 只`);

  const CH = new Map(L("consensus_holdings").map((c) => [c.ticker, c]));
  const held = new Map<string, Set<string>>();
  for (const [cik, f] of latest) {
    if (!countsAsCurrentHolder(f.period, todayDate)) continue;
    for (const h of longs(f.id)) {
      const key = tk(h.cusip) ?? h.cusip; // 与 computeConsensus 同口径:未映射的 CUSIP 以 CUSIP 本身为 key
      (held.get(key) ?? held.set(key, new Set()).get(key)!).add(cik);
    }
  }
  must0("X2a", X, "consensus_holdings.holder_count 与按最新持仓重算不符",
    [...CH].filter(([t, c]) => (held.get(t)?.size ?? 0) !== num(c.holder_count)).map(([t, c]) => [t, held.get(t)?.size ?? 0, c.holder_count]),
    `共识 ${CH.size} 只 / 重算 ${held.size} 只`);
  must0("X2b", X, "当前有人持有但不在 consensus_holdings", [...held.keys()].filter((t) => !CH.has(t)));

  const universe = new Set<string>();
  for (const f of latest.values()) for (const h of byf.get(f.id) ?? []) if (tk(h.cusip)) universe.add(tk(h.cusip)!);
  watch("X3", X, "遗留估值行中已无人持有的", old.filter((v) => !universe.has(v.ticker)).map((v) => v.ticker));

  const V = new Map(Vall.map((v) => [v.ticker, v]));
  must0("X4a", X, "估值现价与 prices 表当日收盘不符(>0.5%)",
    [...V].filter(([t, v]) => {
      const c = prices.get(t)?.get(v.price_date);
      return c && Math.abs(c - v.price) / c > 0.005;
    }).map(([t, v]) => [t, v.price_date, v.price, prices.get(t)?.get(v.price_date)]),
    "只核对 price_date 落在快照价格窗口内的行");
  watch("X4b", X, `持仓股最近 3 个交易日(${meta.tradingDays.join(" / ")})都没有价格`,
    [...universe].filter((t) => [undefined, null, "Common Stock", "common"].includes(sec.get(t)?.security_type) && !meta.tradingDays.some((d) => prices.get(t)?.has(d))));

  const newest = new Map<string, string>();
  for (const r of P) if (["10-Q", "10-K", "20-F"].includes(r.form) && r.fiscal_period !== "Q4" && (!newest.has(r.ticker) || r.period_end > newest.get(r.ticker)!)) newest.set(r.ticker, r.period_end);
  watch("X5", X, "估值所用财报早于库里最新一期", cur.filter((v) => v.basis?.as_of && newest.get(v.ticker) && v.basis.as_of < newest.get(v.ticker)!).map((v) => [v.ticker, v.basis.as_of, newest.get(v.ticker)]));

  const sharesCo = new Map<string, [string, number]>();
  for (const r of P) if (r.fiscal_period === "FY" && r.shares_diluted > 0 && (!sharesCo.has(r.ticker) || r.period_end > sharesCo.get(r.ticker)![0])) sharesCo.set(r.ticker, [r.period_end, r.shares_diluted]);
  watch("X6", X, "跟踪的投资人合计持有 >60% 稀释股本(映射可疑)",
    [...agg].filter(([t, a]) => sharesCo.has(t) && a.sh > sharesCo.get(t)![1] * 0.6).map(([t, a]) => [t, +(a.sh / sharesCo.get(t)![1]).toFixed(2), [...a.who].sort().slice(0, 3)]).sort((a, b) => (b[1] as number) - (a[1] as number)));

  const fundT = new Set(P.map((r) => r.ticker));
  const nonEtp = [...universe].filter((t) => !["ETP", "Fund", "ETF", "Warrant", "Right"].includes(sec.get(t)?.security_type));
  must0("X7a", X, "持仓股没有 securities 行", [...universe].filter((t) => !sec.has(t)));
  watch("X7b", X, "非 ETP 持仓股没有任何财报", nonEtp.filter((t) => !fundT.has(t)), `持仓股 ${universe.size} 只;${fmtCounter(counter([...universe].map((t) => sec.get(t)?.security_type)), 6)}`);

  // ── 6. 全链路 ──────────────────────────────────────────────
  const E = "全链路";
  const csh = counter(L("consensus_stock_holders").filter((r) => r.kind !== "exited").map((r) => r.ticker));
  const cshM = new Map(csh);
  must0("C2", E, "consensus 持有人数与 stock_holders 行数不一致", [...CH].filter(([t, c]) => cshM.get(t) && num(c.holder_count) !== cshM.get(t)).map(([t, c]) => [t, c.holder_count, cshM.get(t)]));
  const consAt = maxOf([...CH.values()].map((c) => c.computed_at)) ?? "";
  const latestFiled = maxOf(filings.map((f) => f.filed_at).filter(Boolean)) ?? "";
  add({
    id: "C2b", area: E, title: "共识在最新一份 13F 入库之后重算过",
    status: consAt && latestFiled && consAt.slice(0, 10) >= latestFiled.slice(0, 10) ? "ok" : "warn",
    value: consAt.slice(0, 10), detail: `consensus computed_at ${consAt};最新 13F filed_at ${latestFiled}`,
  });
  add({
    id: "C3", area: E, title: "估值批次晚于共识重算",
    status: batchAt && consAt && batchAt >= consAt ? "ok" : "warn", value: batchAt.slice(0, 10), detail: `估值 ${batchAt} / 共识 ${consAt}`,
  });
  const byDate = counter(priceRows.map((p) => p.date)).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  info("C4", E, "价格行数(按日期)", byDate.map(([d, n]) => `${d}: ${n}`).join(", "));
  const rates = L("market_rates");
  const dgs = rates.find((r) => r.series_id === "DGS10");
  add({
    id: "C6", area: E, title: "10 年期美债(DGS10)",
    status: dgs && lastTrading && daysBetween(dgs.as_of, lastTrading) <= 5 ? "ok" : "warn",
    value: dgs ? `${dgs.value}% @ ${dgs.as_of}` : "缺失", detail: "as_of 落后最近交易日超过 5 天判需关注(FRED 本身滞后 1–2 个交易日)",
  });
  info("C1", E, "各投资人最新 13F 期分布", fmtCounter(counter([...latest.values()].map((f) => f.period))));

  // ── 数据日期与来源 ──────────────────────────────────────────────
  const priceSrc = fmtCounter(counter(priceRows.filter((p) => p.date === lastTrading).map((p) => p.source)), 4);
  const dates: DataDate[] = [
    { label: "13F 最新报告期", source: "SEC EDGAR 13F-HR(filings / holdings 表)", value: `${qe ?? "?"}(当前计入持有人 ${[...latest.values()].filter((f) => countsAsCurrentHolder(f.period, todayDate)).length}/${latest.size} 位)` },
    { label: "13F 最新入库申报", source: "filings.filed_at", value: latestFiled },
    { label: "最近 3 个交易日价格", source: `prices 表(${priceSrc})`, value: meta.tradingDays.join(" / ") },
    { label: "季末价格窗口", source: "prices 表", value: meta.quarterWindow.length ? `${meta.quarterWindow[0]} ~ ${meta.quarterWindow[meta.quarterWindow.length - 1]}` : "无" },
    { label: "SEC 财报最新 filing_date", source: "SEC XBRL companyfacts(company_fundamentals_periods)", value: maxOf(P.map((r) => r.filing_date).filter(Boolean)) ?? "?" },
    { label: "SEC 财报最近入库", source: "company_fundamentals_periods.updated_at", value: maxOf(P.map((r) => r.updated_at).filter(Boolean)) ?? "?" },
    { label: "共识重算", source: "consensus_holdings.computed_at", value: consAt },
    { label: "估值批次", source: "valuation_snapshot.computed_at(最大值)", value: batchAt },
    { label: "10 年期美债", source: "FRED DGS10(market_rates)", value: dgs ? `${dgs.value}% @ ${dgs.as_of}` : "缺失" },
  ];

  return { runAt, today, meta, dates, checks };
}
