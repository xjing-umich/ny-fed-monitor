// 脊梁侧新鲜度的唯一新增逻辑：纯函数、无 DB、无 server-only → 可独立验证。
// 取值是 macro `MarketFreshnessStatusValue` 的子集(fresh/stale/empty)，将来并轨零摩擦，
// 当前不 import 任何 macro 模块。

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

// 最近一个「已过 45 天 SEC 截止日」的季度末(Mar31/Jun30/Sep30/Dec31)。
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
    .filter((qe) => addDays(qe, FILING_DEADLINE_DAYS) <= t)
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
