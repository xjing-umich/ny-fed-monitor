// 脊梁侧新鲜度的唯一新增逻辑：纯函数、无 DB、无 server-only → 可独立验证。
// 取值是 macro `MarketFreshnessStatusValue` 的子集(fresh/stale/empty)，将来并轨零摩擦，
// 当前不 import 任何 macro 模块。
import { quarter } from "../i18n/format";

export type FreshnessStatus = "fresh" | "stale" | "empty";

export const PRICE_STALE_AFTER_TRADING_DAYS = 3; // 价格落后超过 3 个工作日 → stale
export const FILING_DEADLINE_DAYS = 45; // 13F：季度末 + 45 天为 SEC 截止日

// YYYY-MM-DD → UTC Date（避免本地时区漂移）。非法/空 → null。
export function parseUTC(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

// 归一到 UTC 当日 0 点。
function utcDay(dt: Date): Date {
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

function addDays(dt: Date, n: number): Date {
  return new Date(dt.getTime() + n * 86400000);
}

function isWeekday(dt: Date): boolean {
  const day = dt.getUTCDay(); // 0=Sun, 6=Sat
  return day !== 0 && day !== 6;
}

// (from, to] 区间内的工作日(周一~周五)计数。to ≤ from → 0。不排除联邦假日。
export function tradingDaysBetween(from: Date, to: Date): number {
  const a = utcDay(from);
  const b = utcDay(to);
  if (b <= a) return 0;
  let count = 0;
  for (let cur = addDays(a, 1); cur <= b; cur = addDays(cur, 1)) {
    if (isWeekday(cur)) count++;
  }
  return count;
}

/** 落在周六/周日的截止日顺延到下周一(SEC 规则;不含联邦假日)。 */
function rollWeekend(deadline: Date): Date {
  const day = deadline.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 6) return addDays(deadline, 2);
  if (day === 0) return addDays(deadline, 1);
  return deadline;
}

// 最近一个「已过 SEC 截止日」的季度末(Mar31/Jun30/Sep30/Dec31)。截止日 = 季末 + 45 天,周末顺延到周一。
export function mostRecentDueQuarter(today: Date): Date {
  const t = utcDay(today);
  const quarterEnds = [
    [2, 31], // Mar 31  (month index 2)
    [5, 30], // Jun 30
    [8, 30], // Sep 30
    [11, 31], // Dec 31
  ] as const;
  // 从今年和去年的所有季度末里，挑出「截止日(QE+45)已过」且最晚的那个。
  const year = t.getUTCFullYear();
  const candidates: Date[] = [];
  for (const y of [year, year - 1]) {
    for (const [mo, day] of quarterEnds) {
      candidates.push(new Date(Date.UTC(y, mo, day)));
    }
  }
  const due = candidates
    .filter((qe) => rollWeekend(addDays(qe, FILING_DEADLINE_DAYS)) < t)
    .sort((x, y) => y.getTime() - x.getTime());
  // 理论上 due 必非空(去年同季一定已过)；兜底返回最早候选避免崩。
  return due[0] ?? candidates.sort((x, y) => x.getTime() - y.getTime())[0];
}

// 价格新鲜度：latestDate = 最新价格交易日 (YYYY-MM-DD)。
export function priceFreshness(latestDate: string | null, today: Date): FreshnessStatus {
  const d = parseUTC(latestDate);
  if (!d) return "empty";
  return tradingDaysBetween(d, today) > PRICE_STALE_AFTER_TRADING_DAYS ? "stale" : "fresh";
}

// 13F 新鲜度：latestPeriod = 某户最新 filing 期 (YYYY-MM-DD, 季度末)。
export function filingFreshness(latestPeriod: string | null, today: Date): FreshnessStatus {
  const p = parseUTC(latestPeriod);
  if (!p) return "empty";
  return p < mostRecentDueQuarter(today) ? "stale" : "fresh";
}

// ── 13F 三档新鲜度（以全局最新季为基准的落后季数）─────────────────────────────
// 与上面 filingFreshness(挂钟基准)不同：这里的基准是"全体 manager 中最新的 period"，
// 用于站内一致的相对落后标注与聚合口径(spec 2026-06-12-freshness-guard §B)。

export type Freshness13F = "current" | "stale" | "inactive";

export const STALE_MIN_LAG = 2;    // 落后 ≥2 季 → stale(偏旧)
export const INACTIVE_MIN_LAG = 4; // 落后 ≥4 季(一年无申报) → inactive(停报 tripwire)

/** periods(YYYY-MM-DD 季末日)中的最大值。空/全非法 → null。 */
export function globalLatestPeriod(periods: Array<string | null | undefined>): string | null {
  let max: string | null = null;
  for (const p of periods) {
    if (p && parseUTC(p) && (max === null || p > max)) max = p;
  }
  return max;
}

export const MOVES_COVERAGE_MIN = 0.5;

export type EffectiveMovesReason =
  | "due_and_covered"
  | "before_deadline"
  | "low_coverage"
  | "empty";

export type EffectiveMovesPeriod = {
  period: string | null;
  reason: EffectiveMovesReason;
  maxPeriod: string | null;
  /** total = 应申报 M(isExpectedFiler);excluded = 名单人数 − M(上季未申报或从未申报)。 */
  coverage: { filed: number; total: number; excluded: number };
};

/** Prior calendar quarter-end for a YYYY-MM-DD quarter-end string. Illegal → null. */
export function priorQuarterEnd(period: string): string | null {
  const p = parseUTC(period);
  if (!p) return null;
  const y = p.getUTCFullYear();
  const m = p.getUTCMonth(); // 0-based: 2=Mar, 5=Jun, 8=Sep, 11=Dec
  if (m === 2) return `${y - 1}-12-31`;
  if (m === 5) return `${y}-03-31`;
  if (m === 8) return `${y}-06-30`;
  if (m === 11) return `${y}-09-30`;
  return null;
}

/**
 * 进行中季度 period 的「应申报」判定:最新申报期 ≥ period 的上一季,即进入申报季前的「计入」口径。
 * 申报进度 n/M、切季覆盖率、季度报告的覆盖率与门槛都用这个分母(spec 2026-10-23 §三.1)。
 * 停在更早季度或从未申报的人不在分母里,页面旁边写明人数与原因。
 */
export function isExpectedFiler(latestPeriod: string | null | undefined, period: string): boolean {
  const prior = priorQuarterEnd(period);
  if (!prior || !latestPeriod || !parseUTC(latestPeriod)) return false;
  return latestPeriod >= prior;
}

/**
 * Moves baseline quarter: do not follow early filers until SEC deadline (weekend-rolled) passed
 * AND coverage of maxPeriod among expected filers (isExpectedFiler) ≥ MOVES_COVERAGE_MIN.
 */
export function effectiveMovesPeriod(
  periods: Array<string | null | undefined>,
  today: Date,
): EffectiveMovesPeriod {
  const valid = periods.filter((p): p is string => !!p && !!parseUTC(p));
  const maxPeriod = globalLatestPeriod(valid);
  if (!maxPeriod || valid.length === 0) {
    return { period: null, reason: "empty", maxPeriod: null, coverage: { filed: 0, total: 0, excluded: periods.length } };
  }
  const expected = valid.filter((p) => isExpectedFiler(p, maxPeriod));
  const total = expected.length;
  const filed = expected.filter((p) => p === maxPeriod).length;
  const coverage = { filed, total, excluded: periods.length - total };
  const maxDate = parseUTC(maxPeriod)!;
  const deadline = rollWeekend(addDays(maxDate, FILING_DEADLINE_DAYS));
  // Same strictness as mostRecentDueQuarter: due only when today is strictly after deadline day.
  const due = utcDay(today) > utcDay(deadline);
  const prior = priorQuarterEnd(maxPeriod);
  if (!due) {
    return { period: prior, reason: "before_deadline", maxPeriod, coverage };
  }
  if (filed / total < MOVES_COVERAGE_MIN) {
    return { period: prior, reason: "low_coverage", maxPeriod, coverage };
  }
  return { period: maxPeriod, reason: "due_and_covered", maxPeriod, coverage };
}

/**
 * 站上展示季度(effectiveMovesPeriod)的数据最后一次变化的日期:该季最晚一份 13F 的 SEC 提交日。
 * 供 sitemap lastmod 和列表页 dateModified。不用季末日:Q2 的数据 8 月中才报齐。提交日都缺 → 季末日。
 */
export function displayedDataModified(
  managers: Array<{ period: string | null; filedAt: string | null }>,
  today: Date,
): string | null {
  const period = effectiveMovesPeriod(managers.map((m) => m.period), today).period;
  if (!period) return null;
  const filed = managers
    .filter((m) => m.period === period && m.filedAt)
    .map((m) => m.filedAt!.slice(0, 10))
    .sort()
    .at(-1);
  return filed ?? period;
}

/** period 落后 globalLatest 的季数(非负)。任一非法 → null。 */
export function quarterLag(period: string | null, globalLatest: string | null): number | null {
  const p = parseUTC(period);
  const g = parseUTC(globalLatest);
  if (!p || !g) return null;
  const qi = (d: Date) => d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
  return Math.max(0, qi(g) - qi(p));
}

/** 三档判定：0–1 → current；2–3 → stale；≥4 → inactive。period 缺失/非法按最严(inactive)。 */
export function freshness13F(period: string | null, globalLatest: string | null): Freshness13F {
  const lag = quarterLag(period, globalLatest);
  if (lag == null || lag >= INACTIVE_MIN_LAG) return "inactive";
  if (lag >= STALE_MIN_LAG) return "stale";
  return "current";
}

/** dateStr(YYYY-MM-DD)距 today 的日历天数(非负;未来日期 → 0)。非法/空 → null。 */
export function daysAgo(dateStr: string | null, today: Date): number | null {
  const d = parseUTC(dateStr);
  if (!d) return null;
  const diff = Math.floor((utcDay(today).getTime() - utcDay(d).getTime()) / 86400000);
  return Math.max(0, diff);
}

/** 某季末 period 的 SEC 申报截止日(period + 45 天)。非法/空 → null。 */
export function filingDeadline(period: string | null): Date | null {
  const p = parseUTC(period);
  if (!p) return null;
  return addDays(p, FILING_DEADLINE_DAYS);
}

/**
 * 实际可申报的最后一天:filingDeadline 落在周六/周日时顺延到下周一(SEC 规则;不含联邦假日)。
 * 到期判断(mostRecentDueQuarter / effectiveMovesPeriod)、报告可定稿、看门狗、首页截止日都用它;
 * filingDeadline 本身保持 +45 天不变。
 */
export function effectiveFilingDeadline(period: string | null): Date | null {
  const d = filingDeadline(period);
  return d ? rollWeekend(d) : null;
}

/**
 * 报告期(季末 YYYY-MM-DD) → 季度标签("2026-03-31" → "Q1 2026")。
 * 用于把裸日期换成"季度"语感,避免被误读成"某天的过期数据"。非法格式原样返回。
 */
export function quarterLabel(period: string | null, lang: "zh" | "en" = "en"): string {
  return quarter(period, lang);
}

/**
 * 是否计入「当前持有人」(共识持仓 / 个股持有人 / 持有人数)。
 *
 * 只认交上了最近一个已到期季度(季末 + 45 天截止已过)的 manager:截止日一过还停在上一季的
 * (Pershing/Olstein 2026-10 停在 Q1 2026),其仓位已是半年前的,不能再算"现在持有"。
 * 申报季内(截止日前)还没交新季的照常按上一季计入 —— 那是正常节奏,不是落后。
 * 早申报者(已交下一季)自然计入。period 缺失/非法 → 不计入。
 */
export function countsAsCurrentHolder(period: string | null, today: Date): boolean {
  return filingFreshness(period, today) === "fresh";
}

/** 组合市值环比的「量级异常」门槛:单季 ≤ −50% 或 ≥ +100%,股价波动到不了这个量级。 */
export const SCOPE_CHANGE_DROP = -0.5;
export const SCOPE_CHANGE_RISE = 1;

/**
 * 组合市值环比是否大到「不是价格造成的」:多为赎回/清盘/部分账户移出申报范围,或新增大额委托。
 * 页面据此在环比旁附说明,避免读者把 −96% 当成数据错误或当成"大举卖出"。null → false。
 */
export function isScopeChange(valueDeltaPct: number | null | undefined): boolean {
  return valueDeltaPct != null && (valueDeltaPct <= SCOPE_CHANGE_DROP || valueDeltaPct >= SCOPE_CHANGE_RISE);
}
