import { FUNDAMENTAL_TAGS, FundamentalField, INSTANT_FIELDS } from "./fundamental-tags";
import { CompanyFacts, SecFactUnit } from "./company-facts";
import { NormalizedFiling } from "./company-submissions";
import { KNOWN_FOREIGN_ISSUERS } from "./company-universe";

export type FundamentalPeriod = {
  ticker: string;
  cik: string;
  form: string;
  fiscal_year: number | null;
  fiscal_period: string | null;
  period_end: string;
  filing_date: string | null;
  accession_number: string | null;
  // flow
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  eps_diluted: number | null;
  shares_diluted: number | null;
  operating_cash_flow: number | null;
  capex: number | null;
  free_cash_flow: number | null;
  d_and_a: number | null;
  stock_based_comp: number | null;
  rd_expense: number | null;
  sga_expense: number | null;
  interest_expense: number | null;
  pretax_income: number | null;
  income_tax_expense: number | null;
  dividends_paid: number | null;
  share_repurchases: number | null;
  investment_fv_gain_loss: number | null;
  // instant
  cash_and_equivalents: number | null;
  short_term_investments: number | null;
  current_assets: number | null;
  current_liabilities: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  total_debt: number | null;
  ppe_net: number | null;
  goodwill: number | null;
  intangibles: number | null;
  equity_securities_fv: number | null;
  shareholders_equity: number | null;
  minority_interest: number | null;
  preferred_equity: number | null;
  shares_outstanding: number | null;
  // derived
  ebitda: number | null;
  working_capital: number | null;
  effective_tax_rate: number | null;
  revenue_yoy: number | null;
  net_income_yoy: number | null;
  fcf_yoy: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  fcf_margin: number | null;
  roe: number | null;
  debt_to_equity: number | null;
  net_debt: number | null;
  // provenance / quality
  is_derived: boolean;
  data_quality: string;
  missing_fields: Record<string, boolean>;
  /**
   * XBRL 原始事实溯源。ingest 侧(normalizeFacts / applyClassSharesFallback)总会填它，
   * 但**读取侧刻意不 select 它**(见 sec/columns.ts:CFP_OMITTED_COLUMNS —— 它独占单行约
   * 61% 字节且无读取侧消费者)，所以从 DB 读回的行上它是 undefined。标成可选是如实描述，
   * 不是放松约束：任何要读它的代码必须自己处理缺失，或改用带该列的专门查询。
   */
  raw_facts?: Record<string, unknown>;
};

// Flow facts report over a duration: a single quarter (~90d), a half-year YTD
// (~180d), a three-quarter YTD (~270d), or a full year (~365d).
type FlowBucket = "Q" | "H1" | "TQ" | "FY";
type PickedFact = {
  val: number;
  start: string | null;
  end: string;
  filed: string;
  accn: string | null;
  tag: string;
  days: number | null;
  form?: string;
  derived?: boolean;
  /** 16 周 Q1 / 28 周 H1 这类超出标准时长的事实:只在起点对齐财年起点时才认(见 deriveFlowSeries)。 */
  extended?: boolean;
};

const DAY_MS = 86_400_000;
const toDay = (date: string) => Math.round(Date.parse(date) / DAY_MS);
const utcYear = (day: number) => new Date(day * DAY_MS).getUTCFullYear();
function addYears(day: number, years: number) {
  const d = new Date(day * DAY_MS);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return Math.round(d.getTime() / DAY_MS);
}

const ALL_FIELDS = Object.keys(FUNDAMENTAL_TAGS) as FundamentalField[];
const FLOW_FIELDS = ALL_FIELDS.filter((field) => !INSTANT_FIELDS.has(field));
const INSTANT_FIELD_LIST = ALL_FIELDS.filter((field) => INSTANT_FIELDS.has(field));

// Some filers tag weighted-average share counts in millions/thousands (e.g. MCD
// reports diluted shares as 716.4, not 716,400,000) — SEC companyfacts returns
// that raw value, and the unit decl is just "shares" with no scale. Reconcile
// against net income / diluted EPS (both filer-scale-independent): if the tagged
// count is smaller by a clean power of 10 (≥100×), rescale it to absolute shares.
// Returns the value unchanged when there is no reliable EPS cross-check.
export function normalizeDilutedShares(
  shares: number | null,
  netIncome: number | null,
  epsDiluted: number | null
): number | null {
  if (shares == null || !(shares > 0)) return shares;
  if (netIncome == null || epsDiluted == null || epsDiluted === 0) return shares;
  const implied = Math.abs(netIncome / epsDiluted);
  if (!(implied > 0)) return shares;
  const ratio = implied / shares;
  if (ratio < 100) return shares; // already absolute (EPS-rounding noise stays ~1×)
  const scale = Math.pow(10, Math.round(Math.log10(ratio)));
  return shares * scale;
}

/**
 * 反向量级错:申报把稀释股数标大了 10^k 倍(WAT 2026 Q1/Q2 标成 821 亿/982 亿股,真实约 8200 万/9800 万;
 * TBLA 2026 Q2 标成 2914 亿)。单看 NI/EPS 不够:HAL/PCG/KRC 等是 NI 或 EPS 自身量级错、股数是对的,
 * 只按 NI/EPS 缩会把正确股数改坏。所以要两个信号同时成立才缩:
 *   1. NI/EPS 隐含股数 ≤ 申报值的 1/100(四舍五入到 10 的整数次幂 = 缩放倍数);
 *   2. 缩放后落在同公司其它期(非派生、自身不可疑)股数中位数的 1/3–3 倍内,而原值 ≥30 倍。
 * 拿不到参照(只有一期)→ 不动,交给估值侧的价值带合理性闸兜底。
 */
export const SHARES_DEFLATE_MIN_RATIO = 100;
export const SHARES_DEFLATE_REF_MIN = 30;
export function deflateOverScaledShares<T extends { shares_diluted: number | null; net_income: number | null; eps_diluted: number | null; is_derived?: boolean }>(rows: T[]): T[] {
  const impliedRatio = (r: T): number | null => {
    const s = r.shares_diluted, ni = r.net_income, e = r.eps_diluted;
    if (s == null || !(s > 0) || ni == null || e == null || e === 0) return null;
    const imp = Math.abs(ni / e);
    return imp > 0 ? s / imp : null;
  };
  const suspect = (r: T) => (impliedRatio(r) ?? 0) >= SHARES_DEFLATE_MIN_RATIO;
  const median = (xs: number[]) => {
    const a = [...xs].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  return rows.map((r) => {
    const ratio = impliedRatio(r);
    if (ratio == null || ratio < SHARES_DEFLATE_MIN_RATIO) return r;
    const refs = rows
      .filter((o) => o !== r && !o.is_derived && !suspect(o) && o.shares_diluted != null && o.shares_diluted > 0)
      .map((o) => o.shares_diluted as number);
    if (!refs.length) return r;
    const ref = median(refs);
    const raw = r.shares_diluted as number;
    const scaled = raw / Math.pow(10, Math.round(Math.log10(ratio)));
    if (raw / ref < SHARES_DEFLATE_REF_MIN || scaled / ref < 1 / 3 || scaled / ref > 3) return r;
    return { ...r, shares_diluted: scaled };
  });
}

// Fields that, when absent, mark a period as not "high" quality. Enrichment
// fields (d_and_a, sga, etc.) intentionally do NOT gate quality — a period is
// still trustworthy without them; they just enable richer valuation.
const REQUIRED_HIGH: FundamentalField[] = [
  "revenue",
  "net_income",
  "operating_cash_flow",
  "capex",
  "cash_and_equivalents",
  "total_assets",
  "total_liabilities",
  "shareholders_equity"
];

function safeDiv(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function dayCount(start?: string, end?: string) {
  if (!start || !end) return null;
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
}

// Classify a flow fact by its reporting duration. This is the fix for the
// "same end date, different duration" trap: a 10-Q reports a ~90-day single
// quarter AND a ~180/270-day year-to-date figure for the same `end`; only the
// duration distinguishes them. Capturing all four buckets lets us derive the
// single quarters that 10-Qs only report cumulatively (e.g. cash-flow lines).
//
// 52/53 周财历的非 13 周季:16-12-12-12 周(KR/ACI/AAP/FLO/CAVA)的 Q1 是 16 周(~112 天)、H1 是
// 28 周(~196 天);12-12-12-16 周(PEP)的 H1 是 24 周(~168 天)、前三季 36 周(~252 天)。这些落在
// 标准区间之外 → 标 extended,由 deriveFlowSeries 核对「起点 = 财年起点」且季序对得上才认,
// 其它长度的残段(并购过渡期等)仍丢弃。
function flowBucket(unit: SecFactUnit): { bucket: FlowBucket; extended: boolean } | null {
  const d = dayCount(unit.start, unit.end);
  if (d === null) return null;
  if (d >= 80 && d <= 100) return { bucket: "Q", extended: false };
  if (d >= 101 && d <= 125) return { bucket: "Q", extended: true };
  if (d >= 160 && d <= 171) return { bucket: "H1", extended: true };
  if (d >= 172 && d <= 190) return { bucket: "H1", extended: false };
  if (d >= 191 && d <= 200) return { bucket: "H1", extended: true };
  if (d >= 248 && d <= 259) return { bucket: "TQ", extended: true };
  if (d >= 260 && d <= 285) return { bucket: "TQ", extended: false };
  if (d >= 350 && d <= 380) return { bucket: "FY", extended: false };
  return null;
}

function getUnits(facts: CompanyFacts, tag: string): SecFactUnit[] {
  const concept = facts.facts?.["us-gaap"]?.[tag];
  if (!concept) return [];
  return concept.units.USD ?? concept.units.shares ?? concept.units["USD/shares"] ?? [];
}

// As-originally-reported: when the same period appears in multiple filings
// (original + later comparatives/restatements), keep the value from the
// earliest filing. Comparatives in later filings carry the later filing's
// fy/fp — which is exactly why we never key on fy/fp.
function earlier(a: PickedFact, b: PickedFact) {
  return a.filed <= b.filed ? a : b;
}

function toPicked(unit: SecFactUnit, tag: string): PickedFact {
  return {
    val: Number(unit.val),
    start: unit.start ?? null,
    end: unit.end!,
    filed: unit.filed ?? "9999-99-99",
    accn: unit.accn ?? null,
    tag: unit.source_tag ?? tag,
    days: dayCount(unit.start, unit.end),
    form: unit.form
  };
}

// ── 财年日历:从事实本身推财年起点,不信 submissions.fiscalYearEnd ──
// 旧逻辑用 submissions 的单一 fiscalYearEnd 月份按日历月推每期属于哪个财年/第几季,三处会错:
//   1. fiscalYearEnd 与历史财年不符 —— 改过财年(FERG 7→12 月、AMCR 6→12 月、SPHR、AIOT、GEF)
//      或本身就标错(SUI "0513"、JHG "0630"、PBFS/RJET/AEHR "1231"):年报整段被 ±1 月闸丢掉。
//   2. 年报按期中年命名、季度按期末年命名,1–6 月财年末的公司两套键错一年 → Q4 = 本财年 FY − 上一
//      财年前三季(2026-10 生产库:MSFT FY26 Q4 营收 1266 亿、NVDA 1248 亿,都是跨年相减的假数)。
//   3. 52/53 周年末漂进下个月头几天(KR 2025-02-01)→ 那期 Q4 被当成下一财年的 Q1。
// 新做法:财年起点 = 10-K 年度事实的 start 与 end+1、10-Q 累计(YTD)事实的 start、10-KT 过渡期
// 自身期末 +1。每期挂到「≤ 期末的最近起点」那个财年,季序 = 距起点的天数 / 91.3;累计链只在同一
// 起点内相减。起点就是财年身份,不再有两套命名对不上的问题。

// 只认 10-K 家族(含 10-K/A、10-KT):20-F/6-K 外国发行人(BABA 等)维持旧行为,不因新锚凭空多出年报行。
const ANNUAL_FORM = /^10-K/;

function fiscalYearStarts(facts: CompanyFacts, fyeMonth: number): number[] {
  // 年报区间(10-K 家族里 350–380 天的事实)是硬锚;同一区间多次出现时按最晚申报排序。
  const annuals = new Map<string, { start: number; end: number; filed: string }>();
  const ytdStarts: number[] = [];
  const transitionEnd = new Map<string, number>(); // 10-KT accn -> 自身期末(该申报里最晚的 end)
  let minEnd = Infinity;
  let maxEnd = -Infinity;
  for (const field of FLOW_FIELDS) {
    for (const tag of FUNDAMENTAL_TAGS[field]) {
      for (const unit of getUnits(facts, tag)) {
        if (!unit.start || !unit.end) continue;
        const d = dayCount(unit.start, unit.end)!;
        const start = toDay(unit.start);
        const end = toDay(unit.end);
        minEnd = Math.min(minEnd, end);
        maxEnd = Math.max(maxEnd, end);
        const form = unit.form ?? "";
        if (d >= 350 && d <= 380 && ANNUAL_FORM.test(form)) {
          const key = `${start}|${end}`;
          const filed = unit.filed ?? "";
          if (!annuals.has(key) || filed > annuals.get(key)!.filed) annuals.set(key, { start, end, filed });
        } else if (((d >= 160 && d <= 200) || (d >= 248 && d <= 285)) && form.startsWith("10-")) {
          ytdStarts.push(start); // YTD 从财年起点算(只认 10-Q/10-K,6-K 半年报同样维持旧行为)
        }
        if (form.startsWith("10-KT") && unit.accn) {
          transitionEnd.set(unit.accn, Math.max(transitionEnd.get(unit.accn) ?? -Infinity, end));
        }
      }
    }
  }

  // 两套互相重叠的年报区间 = 会计主体换了(RJET:Mesa 9 月财年 → 反向并购后按 Republic 12 月财年
  // 重报)。以最近申报的那套为准,冲突点之前旧主体的财年一律不作锚,免得两家公司的年报混成一条序列。
  const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
    Math.min(a.end, b.end) - Math.max(a.start, b.start) > 7;
  const accepted: { start: number; end: number }[] = [];
  let cutoff = -Infinity;
  for (const iv of [...annuals.values()].sort((a, b) => b.filed.localeCompare(a.filed) || b.end - a.end)) {
    if (iv.end < cutoff) continue;
    // 同一财年在不同申报里起止差一两天(52/53 周口径)= 同一区间,不算冲突。
    if (accepted.some((a) => Math.abs(a.start - iv.start) <= 7 && Math.abs(a.end - iv.end) <= 7)) continue;
    if (accepted.some((a) => overlaps(a, iv))) {
      cutoff = Math.max(cutoff, Math.min(...accepted.map((a) => a.start)));
      continue;
    }
    accepted.push(iv);
  }
  const raw: number[] = accepted.flatMap((iv) => [iv.start, iv.end + 1]);
  // YTD 起点只补年报还没覆盖到的财年(最新财年、无 10-K 的早年)。落在已知财年中间的 YTD 起点是改财年后
  // 按新财历重述的比较期(FERG 2026 年 10-Q 里的「2025-01-01 起 6 个月」、GEF 的 10 月起算),不是财年起点。
  const insideAnnual = (day: number) => accepted.some((a) => day - a.start > 7 && a.end + 1 - day > 7);
  for (const day of ytdStarts) if (day >= cutoff - 7 && !insideAnnual(day)) raw.push(day);
  for (const end of transitionEnd.values()) if (end >= cutoff) raw.push(end + 1); // 过渡期之后就是新财年
  // 没有任何年报/YTD 事实可依(极少数只报单季的申报人)→ 退回 fiscalYearEnd 月份的名义起点。
  if (!raw.length && Number.isFinite(minEnd)) {
    for (let y = utcYear(minEnd) - 1; y <= utcYear(maxEnd); y += 1) raw.push(Math.round(Date.UTC(y, fyeMonth, 1) / DAY_MS));
  }
  // 同一财年起点的不同来源(end+1 与 YTD start)相差几天 → 7 天内归并为一个。
  const starts: number[] = [];
  for (const day of [...new Set(raw)].sort((a, b) => a - b)) {
    if (!starts.length || day - starts[starts.length - 1] > 7) starts.push(day);
  }
  return starts;
}

/**
 * 期末所在财年的起点(天数)。超出已知起点的期间按整年外推(最新财年还没有 10-K / YTD 时)。
 * 起点须早于期末 45 天以上:归并后的起点可能比真实起点早一两天(AEHR 某份 10-Q 把 YTD 起点标成
 * 2024-05-31),不能让它把恰好在那天结束的上一财年年报吞掉。
 */
function fiscalStartOf(endDay: number, starts: number[]): number {
  let s = starts[0];
  for (const x of starts) {
    if (x > endDay - 45) break;
    s = x;
  }
  while (s > endDay - 45) s = addYears(s, -1);
  while (endDay - s > 375) s = addYears(s, 1);
  return s;
}

/** 第 q 季期末距财年起点的天数区间(与累计事实的时长区间同口径,含 16-12-12-12 / 12-12-12-16 周财历)。 */
const ELAPSED_DAYS: Record<number, [number, number]> = { 1: [80, 125], 2: [160, 200], 3: [248, 290], 4: [350, 380] };

/** 距财年起点的季序:16 周 Q1(~112 天)仍是 1,28 周 H1 仍是 2。 */
function quarterIndex(endDay: number, fyStart: number) {
  return Math.min(4, Math.max(1, Math.round((endDay - fyStart + 1) / 91.31)));
}

/**
 * 同一槽位(财年 × 季序)多条候选:最早申报的胜出 —— 后来申报里的重述比较期不能顶掉原始季报;
 * 同一份申报里再取时长更接近标准的(平手取后到者,与旧版 Map 覆盖语义一致)。
 */
function closerTo(target: number, existing: PickedFact | undefined, candidate: PickedFact) {
  if (!existing) return candidate;
  if (existing.filed !== candidate.filed) return candidate.filed < existing.filed ? candidate : existing;
  const dist = (p: PickedFact) => Math.abs((p.days ?? target) - target);
  return dist(candidate) <= dist(existing) ? candidate : existing;
}

// Collect the as-reported value per (period_end, bucket) for one flow field.
function collectFlow(facts: CompanyFacts, field: FundamentalField) {
  const byKey = new Map<string, PickedFact>();
  for (const tag of FUNDAMENTAL_TAGS[field]) {
    for (const unit of getUnits(facts, tag)) {
      const bucket = flowBucket(unit);
      if (!bucket || !unit.end || unit.val === undefined || unit.val === null) continue;
      const key = `${unit.end}|${bucket.bucket}`;
      const picked = { ...toPicked(unit, tag), extended: bucket.extended };
      const existing = byKey.get(key);
      // first concept in the fallback list wins per period; same concept ->
      // earliest-filed (as-reported) wins. 标准时长永远压过 extended(同期末只在没有标准事实时才用)。
      if (!existing) byKey.set(key, picked);
      else if (existing.extended !== picked.extended) {
        if (existing.extended) byKey.set(key, picked);
      } else if (existing.tag === picked.tag) byKey.set(key, earlier(existing, picked));
    }
  }
  return byKey;
}

// Turn one field's bucketed facts into single-quarter values (Q1..Q4) and an
// annual value per fiscal year, keyed by fiscal-year start (`${start}|${q}`).
// Single quarters are taken directly when the filer reports a single-quarter
// fact; otherwise derived from the YTD chain (Qk = cumulative_k − cumulative_{k-1}).
// Q4 is always derived (never filed).
function deriveFlowSeries(byKey: Map<string, PickedFact>, starts: number[]) {
  const direct = new Map<string, PickedFact>(); // `${fyStart}|${q}` -> single quarter
  const cum = new Map<string, PickedFact>(); // `${fyStart}|${k}` -> cumulative-through-k
  for (const [key, p] of byKey) {
    const bucket = key.split("|")[1] as FlowBucket;
    const endDay = toDay(p.end);
    const fyStart = fiscalStartOf(endDay, starts);
    const q = quarterIndex(endDay, fyStart);
    // 累计事实必须从本财年起点算起;中段起算的 365 天是 TTM,不是年报,丢弃。
    const aligned = p.start !== null && Math.abs(toDay(p.start) - fyStart) <= 7;
    if (p.extended && !(aligned && q === { Q: 1, H1: 2, TQ: 3, FY: 4 }[bucket])) continue;
    const k = (n: number) => `${fyStart}|${n}`;
    if (bucket === "Q") {
      // 单季的期末离财年起点应正好是 q 个季度(16 周 Q1 也在 Q1 区间内);差一个多月的是改财年后
      // 按新财历重述的比较季(FERG 2025-04-01~06-30 落在旧财年第 11 个月),不占原财年的槽位。
      const [lo, hi] = ELAPSED_DAYS[q];
      if (endDay - fyStart < lo || endDay - fyStart > hi) continue;
      direct.set(k(q), closerTo(91, direct.get(k(q)), p));
      if (q === 1) cum.set(k(1), direct.get(k(1))!); // 3-month YTD == Q1
    } else if (bucket === "H1" && q === 2 && aligned) cum.set(k(2), closerTo(182, cum.get(k(2)), p));
    else if (bucket === "TQ" && q === 3 && aligned) cum.set(k(3), closerTo(273, cum.get(k(3)), p));
    else if (bucket === "FY" && q === 4 && aligned) cum.set(k(4), closerTo(364, cum.get(k(4)), p));
  }

  const quarters = new Map<string, PickedFact>();
  const annual = new Map<string, PickedFact>(); // fyStart -> FY fact
  const fiscalYears = new Set<string>();
  for (const key of [...direct.keys(), ...cum.keys()]) fiscalYears.add(key.split("|")[0]);

  for (const fy of fiscalYears) {
    for (let q = 1; q <= 4; q += 1) {
      const directQ = direct.get(`${fy}|${q}`);
      const ck = cum.get(`${fy}|${q}`);
      const cprev = q === 1 ? null : cum.get(`${fy}|${q - 1}`);
      const derived: PickedFact | null =
        ck && (q === 1 || cprev)
          ? {
              val: ck.val - (cprev?.val ?? 0),
              start: null,
              end: ck.end,
              // 派生值要等两段累计都披露后才成立 → 取两者较晚的申报日
              filed: cprev && cprev.filed > ck.filed ? cprev.filed : ck.filed,
              accn: null,
              tag: `derived(cum${q}-cum${q - 1})`,
              days: 90,
              derived: true
            }
          : null;
      // 直报单季优先(旧语义,不动既有历史值);例外:10-KT 过渡期报告按新财历/新口径重述的比较季
      // (GEF 剥离业务后重述 2024-08~10 季营收 11.07 亿)不能顶掉原始申报累计数推出的值(14.17 亿)。
      const recast = directQ?.form?.startsWith("10-KT") && derived !== null && derived.filed < directQ.filed;
      const pick = directQ && !recast ? directQ : derived;
      if (pick) quarters.set(`${fy}|${q}`, pick);
    }
    const c4 = cum.get(`${fy}|4`);
    if (c4) annual.set(fy, c4);
  }
  return { quarters, annual };
}

// Without an original annual FY focus, infer the ending year for isolated quarters.
// Annual-backed periods share the source-aware labelYear map below.
const quarterLabel = (fyStart: number) => utcYear(fyStart + 350);

// Collect the as-reported instant value per period_end for one field.
function collectInstant(facts: CompanyFacts, field: FundamentalField) {
  const byEnd = new Map<string, PickedFact>();
  for (const tag of FUNDAMENTAL_TAGS[field]) {
    for (const unit of getUnits(facts, tag)) {
      // instant facts have an `end` and no `start`
      if (!unit.end || unit.start || unit.val === undefined || unit.val === null) continue;
      const picked = toPicked(unit, tag);
      const existing = byEnd.get(unit.end);
      if (!existing) byEnd.set(unit.end, picked);
      else if (existing.tag === picked.tag) byEnd.set(unit.end, earlier(existing, picked));
    }
  }
  return byEnd;
}

// 债务概念优先级 —— 避免重叠概念双算,同时覆盖新旧两套 taxonomy。
// 很多大盘(CMCSA/HD/KO/FDX…)用「资本租赁/合并」老口径,不拆 Current/Noncurrent,
// 若只认拆分 tag 会把它们的负债整段算成 0(假的「无杠杆」信号)。
//
// 规则:
//   1. 有总额 tag `DebtAndCapitalLeaseObligations`(已含全部)→ 直取,不再叠加分项。
//   2. 否则「非流动 + 流动 + 短期」三桶各取一(桶内按优先级,越靠前越含租赁/越完整)。
//   3. 三桶无非流动项时兜底:合并 `LongTermDebt`(含流动+非流动)+ 短期借款。
const DEBT_GRAND_TOTAL = "DebtAndCapitalLeaseObligations";
const DEBT_NONCURRENT = [
  "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
  "LongTermDebtAndCapitalLeaseObligations",
  "LongTermDebtNoncurrent",
];
const DEBT_CURRENT = [
  "LongTermDebtAndFinanceLeaseObligationsCurrent",
  "LongTermDebtCurrent",
  "DebtCurrent",
];
const DEBT_LT_COMBINED = "LongTermDebt"; // 含流动+非流动的合并 LT,仅作非流动兜底
const DEBT_SHORT = "ShortTermBorrowings";

export function pickDebtTags(present: Set<string>): string[] {
  // 1. 总额 tag 直取(含全部,叠加分项会双算)
  if (present.has(DEBT_GRAND_TOTAL)) return [DEBT_GRAND_TOTAL];

  const out: string[] = [];
  const noncurrent = DEBT_NONCURRENT.find((t) => present.has(t));
  const current = DEBT_CURRENT.find((t) => present.has(t));
  const short = present.has(DEBT_SHORT) ? DEBT_SHORT : undefined;

  if (noncurrent) {
    // 2. 分项:非流动 + 流动 + 短期(各取一,互不重叠)
    out.push(noncurrent);
    if (current) out.push(current);
  } else if (present.has(DEBT_LT_COMBINED)) {
    // 3. 无分项非流动 → 合并 LongTermDebt(已含流动,故不再叠加 current)
    out.push(DEBT_LT_COMBINED);
  } else if (current) {
    // 极端:只有流动项
    out.push(current);
  }
  if (short) out.push(DEBT_SHORT);
  return out;
}

// total_debt is the sum of several debt concepts at a given period_end.
function collectTotalDebt(facts: CompanyFacts) {
  const byEnd = new Map<string, Map<string, PickedFact>>();
  for (const tag of FUNDAMENTAL_TAGS.total_debt) {
    for (const unit of getUnits(facts, tag)) {
      if (!unit.end || unit.start || unit.val === undefined || unit.val === null) continue;
      const picked = toPicked(unit, tag);
      const tagMap = byEnd.get(unit.end) ?? new Map<string, PickedFact>();
      const existing = tagMap.get(tag);
      tagMap.set(tag, existing ? earlier(existing, picked) : picked);
      byEnd.set(unit.end, tagMap);
    }
  }
  const summed = new Map<string, PickedFact>();
  for (const [end, tagMap] of byEnd) {
    const keep = new Set(pickDebtTags(new Set(tagMap.keys())));
    const kept = Array.from(tagMap.entries())
      .filter(([t]) => keep.has(t))
      .map(([, p]) => p);
    const total = kept.reduce((sum, p) => sum + p.val, 0);
    const earliestFiled = kept.reduce((min, p) => (p.filed < min ? p.filed : min), "9999-99-99");
    summed.set(end, { val: total, start: null, end, filed: earliestFiled, accn: null, tag: [...keep].join("+"), days: null });
  }
  return summed;
}

function qualityStatus(ticker: string, values: Record<FundamentalField, number | null>, missing: Record<string, boolean>) {
  if (KNOWN_FOREIGN_ISSUERS.has(ticker)) return "foreign";
  if (values.revenue === null || values.net_income === null) return "low";
  if (REQUIRED_HIGH.every((field) => values[field] !== null)) return "high";
  if (values.cash_and_equivalents !== null && values.shareholders_equity !== null) return "medium";
  return Object.keys(missing).length ? "low" : "unknown";
}

type RowDraft = {
  period_end: string;
  isAnnual: boolean;
  fiscal_year: number;
  fiscal_period: string;
  is_derived: boolean;
  values: Record<FundamentalField, number | null>;
  picks: Record<string, PickedFact>;
};

function emptyValues(): Record<FundamentalField, number | null> {
  return Object.fromEntries(ALL_FIELDS.map((field) => [field, null])) as Record<FundamentalField, number | null>;
}

function finalizeRow(ticker: string, cik: string, draft: RowDraft, filings: NormalizedFiling[]): FundamentalPeriod {
  const v = draft.values;
  // Many filers (e.g. Amazon) never tag a `Liabilities` total, only its
  // components. Fall back to the accounting identity: liabilities = assets −
  // total equity (parent equity + any non-controlling interest).
  if (v.total_liabilities === null && v.total_assets !== null && v.shareholders_equity !== null) {
    v.total_liabilities = v.total_assets - v.shareholders_equity - (v.minority_interest ?? 0);
  }
  const capex = v.capex === null ? null : -Math.abs(v.capex);
  const freeCashFlow = v.operating_cash_flow === null || capex === null ? null : v.operating_cash_flow + capex;
  const ebitda = v.operating_income !== null && v.d_and_a !== null ? v.operating_income + v.d_and_a : null;
  const workingCapital =
    v.current_assets !== null && v.current_liabilities !== null ? v.current_assets - v.current_liabilities : null;
  const sharesDiluted = normalizeDilutedShares(v.shares_diluted, v.net_income, v.eps_diluted);

  const filedDates = Object.values(draft.picks)
    .map((p) => p.filed)
    .filter((f) => f !== "9999-99-99");
  const firstFiled = filedDates.length ? filedDates.reduce((min, f) => (f < min ? f : min)) : null;
  const matchedFiling = filings.find((f) => f.report_date === draft.period_end);

  const missing = Object.fromEntries(
    [...FLOW_FIELDS, ...INSTANT_FIELD_LIST]
      .filter((field) => field !== "total_debt" && v[field] === null)
      .map((field) => [field, true])
  );
  const dataQuality = qualityStatus(ticker, v, missing);

  return {
    ticker,
    cik,
    form: matchedFiling?.form ?? draft.picks.net_income?.form ?? draft.picks.revenue?.form ?? (draft.isAnnual ? "10-K" : "10-Q"),
    fiscal_year: draft.fiscal_year,
    fiscal_period: draft.fiscal_period,
    period_end: draft.period_end,
    filing_date: matchedFiling?.filing_date ?? firstFiled,
    accession_number: matchedFiling?.accession_number ?? Object.values(draft.picks).find((p) => p.accn)?.accn ?? null,
    revenue: v.revenue,
    gross_profit: v.gross_profit,
    operating_income: v.operating_income,
    net_income: v.net_income,
    eps_diluted: v.eps_diluted,
    shares_diluted: sharesDiluted,
    operating_cash_flow: v.operating_cash_flow,
    capex,
    free_cash_flow: freeCashFlow,
    d_and_a: v.d_and_a,
    stock_based_comp: v.stock_based_comp,
    rd_expense: v.rd_expense,
    sga_expense: v.sga_expense,
    interest_expense: v.interest_expense,
    pretax_income: v.pretax_income,
    income_tax_expense: v.income_tax_expense,
    dividends_paid: v.dividends_paid,
    share_repurchases: v.share_repurchases,
    investment_fv_gain_loss: v.investment_fv_gain_loss,
    cash_and_equivalents: v.cash_and_equivalents,
    short_term_investments: v.short_term_investments,
    current_assets: v.current_assets,
    current_liabilities: v.current_liabilities,
    total_assets: v.total_assets,
    total_liabilities: v.total_liabilities,
    total_debt: v.total_debt,
    ppe_net: v.ppe_net,
    goodwill: v.goodwill,
    intangibles: v.intangibles,
    equity_securities_fv: v.equity_securities_fv,
    shareholders_equity: v.shareholders_equity,
    minority_interest: v.minority_interest,
    preferred_equity: v.preferred_equity,
    shares_outstanding: v.shares_outstanding,
    ebitda,
    working_capital: workingCapital,
    effective_tax_rate: safeDiv(v.income_tax_expense, v.pretax_income),
    revenue_yoy: null,
    net_income_yoy: null,
    fcf_yoy: null,
    gross_margin: safeDiv(v.gross_profit, v.revenue),
    operating_margin: safeDiv(v.operating_income, v.revenue),
    net_margin: safeDiv(v.net_income, v.revenue),
    fcf_margin: safeDiv(freeCashFlow, v.revenue),
    roe: safeDiv(v.net_income, v.shareholders_equity),
    debt_to_equity: safeDiv(v.total_debt, v.shareholders_equity),
    net_debt: v.total_debt !== null && v.cash_and_equivalents !== null ? v.total_debt - v.cash_and_equivalents : null,
    is_derived: draft.is_derived,
    data_quality: dataQuality,
    missing_fields: missing,
    raw_facts: Object.fromEntries(
      Object.entries(draft.picks).map(([k, p]) => [k, { tag: p.tag, val: p.val, filed: p.filed, days: p.days, derived: p.derived ?? false }])
    )
  };
}

function withYearOverYear(rows: FundamentalPeriod[]) {
  // rows ascending by period_end; compare to the most recent prior row sharing
  // the same fiscal_period (prior FY for annual, same quarter a year ago).
  return rows.map((row, index) => {
    const prior = rows
      .slice(0, index)
      .reverse()
      .find((c) => c.fiscal_period === row.fiscal_period);
    if (!prior) return row;
    return {
      ...row,
      revenue_yoy: safeDiv(row.revenue !== null && prior.revenue !== null ? row.revenue - prior.revenue : null, prior.revenue),
      net_income_yoy: safeDiv(
        row.net_income !== null && prior.net_income !== null ? row.net_income - prior.net_income : null,
        prior.net_income
      ),
      fcf_yoy: safeDiv(
        row.free_cash_flow !== null && prior.free_cash_flow !== null ? row.free_cash_flow - prior.free_cash_flow : null,
        prior.free_cash_flow
      )
    };
  });
}

export function normalizeCompanyFacts(
  tickerInput: string,
  cik: string,
  facts: CompanyFacts,
  filings: NormalizedFiling[],
  fiscalYearEnd?: string
) {
  const ticker = tickerInput.toUpperCase();
  const fyeMonth = fiscalYearEnd && fiscalYearEnd.length >= 2 ? Number(fiscalYearEnd.slice(0, 2)) || 12 : 12;

  // 1. Per flow field: bucket facts, then resolve single-quarter + annual series
  //    on one fiscal calendar shared by all fields (fiscal-year starts from the facts).
  const starts = fiscalYearStarts(facts, fyeMonth);
  const flowSeries = new Map<FundamentalField, ReturnType<typeof deriveFlowSeries>>();
  for (const field of FLOW_FIELDS) flowSeries.set(field, deriveFlowSeries(collectFlow(facts, field), starts));

  // 2. Instant fields keyed by period_end.
  const instant = new Map<FundamentalField, Map<string, PickedFact>>();
  for (const field of INSTANT_FIELD_LIST) {
    instant.set(field, field === "total_debt" ? collectTotalDebt(facts) : collectInstant(facts, field));
  }

  // 3. Calendar of real periods (union across fields), with their end dates.
  const quarterEnd = new Map<string, string>(); // `${fyStart}|${q}` -> end
  const annualEnd = new Map<string, string>(); // fyStart -> end
  for (const { quarters, annual } of flowSeries.values()) {
    for (const [k, p] of quarters) if (!quarterEnd.has(k)) quarterEnd.set(k, p.end);
    for (const [fy, p] of annual) if (!annualEnd.has(fy)) annualEnd.set(fy, p.end);
  }

  // Labels are presentation identities, never calendar bucket keys. Prefer the
  // original annual filing's own FY focus; later comparative facts carry newer FYs.
  const ownFiscalYears = FLOW_FIELDS.flatMap(field => FUNDAMENTAL_TAGS[field].flatMap(tag => getUnits(facts, tag)))
    .filter(u => u.start && u.end && Number.isInteger(u.fy) && u.filed && /^(10-K|20-F)/.test(u.form ?? "")
      && dayCount(u.start, u.end)! >= 350 && dayCount(u.start, u.end)! <= 380
      && toDay(u.filed) >= toDay(u.end) && toDay(u.filed) - toDay(u.end) <= 180)
    .sort((a,b) => a.filed!.localeCompare(b.filed!));
  const yearLabels = new Map<number, number>();
  for (const [start, end] of annualEnd) {
    const own = ownFiscalYears.find(u => Math.abs(toDay(u.start!) - Number(start)) <= 7 && Math.abs(toDay(u.end!) - toDay(end)) <= 7);
    // Without reported FY focus retain the established early-year retail convention;
    // other year-ends (including MSFT June) are named for their ending year.
    yearLabels.set(Number(start), own?.fy ?? (Number(end.slice(5,7)) <= 2 ? utcYear(toDay(end)-182) : Number(end.slice(0,4))));
  }
  const labelYear = (start: number): number => {
    if (yearLabels.has(start)) return yearLabels.get(start)!;
    const previous = [...yearLabels.keys()].filter(s => s < start).sort((a,b) => b-a)[0];
    return previous == null ? quarterLabel(start) : yearLabels.get(previous)! + Math.round((start-previous)/365.25);
  };

  // 4. Build quarterly + annual drafts; attach balance-sheet values by end date.
  const drafts: RowDraft[] = [];
  const attachInstant = (draft: RowDraft) => {
    for (const field of INSTANT_FIELD_LIST) {
      const picked = instant.get(field)?.get(draft.period_end);
      if (picked) {
        draft.values[field] = picked.val;
        draft.picks[field] = picked;
      }
    }
  };

  for (const [key, end] of quarterEnd) {
    const [fyStart, q] = key.split("|").map(Number);
    const draft: RowDraft = {
      period_end: end,
      isAnnual: false,
      fiscal_year: labelYear(fyStart),
      fiscal_period: `Q${q}`,
      is_derived: q === 4, // Q4 has no standalone filing; income-stmt Q2/Q3 are direct
      values: emptyValues(),
      picks: {}
    };
    for (const field of FLOW_FIELDS) {
      const p = flowSeries.get(field)?.quarters.get(key);
      if (p) {
        draft.values[field] = p.val;
        draft.picks[field] = p;
      }
    }
    attachInstant(draft);
    drafts.push(draft);
  }

  for (const [fy, end] of annualEnd) {
    const draft: RowDraft = {
      period_end: end,
      isAnnual: true,
      fiscal_year: labelYear(Number(fy)),
      fiscal_period: "FY",
      is_derived: false,
      values: emptyValues(),
      picks: {}
    };
    for (const field of FLOW_FIELDS) {
      const p = flowSeries.get(field)?.annual.get(fy);
      if (p) {
        draft.values[field] = p.val;
        draft.picks[field] = p;
      }
    }
    attachInstant(draft);
    drafts.push(draft);
  }

  // 5. Finalize, split, sort, limit, then compute YoY within each series.
  const finalized = drafts.map((d) => finalizeRow(ticker, cik, d, filings));
  // 数据准确性护栏: 丢弃 period_end 落在未来 90 天之后的行。XBRL 偶有公司自报错标年份
  // (如 LEGH 把 2024-Q1 标成 2033-03-31), 这种行会污染"最新期"物化(latest 按 period_end
  // 倒序选最新 → 2033>2026 被当最新, 盖住真最新季)。90 天容差留给正常的提前申报。
  const futureCutoff = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  const finalizedSane = deflateOverScaledShares(finalized).filter((r) => {
    if (r.period_end > futureCutoff) {
      console.warn(`[normalize-facts] 丢弃未来日期行 ${ticker} ${r.fiscal_period} FY${r.fiscal_year} period_end=${r.period_end}`);
      return false;
    }
    // 派生季度(Q4 = FY − 前三季)若得出负营收, 必是 FY/YTD 口径不齐的派生假数据(如 UHAL.B
    // 单季营收 −38.6 亿)。合法的负营收——保险股投资亏损季——走 is_derived=false 直报路径,
    // 不受此闸影响。丢弃整行而非仅清营收: 同源派生的净利/FCF 同样不可信。
    if (r.is_derived && r.revenue !== null && r.revenue < 0) {
      console.warn(`[normalize-facts] 丢弃派生负营收行 ${ticker} ${r.fiscal_period} FY${r.fiscal_year} revenue=${r.revenue}`);
      return false;
    }
    return true;
  });
  const annual = finalizedSane
    .filter((r) => r.fiscal_period === "FY")
    .sort((a, b) => b.period_end.localeCompare(a.period_end))
    .slice(0, 6);
  const quarterly = finalizedSane
    .filter((r) => r.fiscal_period !== "FY")
    .sort((a, b) => b.period_end.localeCompare(a.period_end))
    .slice(0, 12);

  return {
    annual: withYearOverYear([...annual].reverse()).reverse(),
    quarterly: withYearOverYear([...quarterly].reverse()).reverse()
  };
}
