import type { DailyClose, PriceProvider } from "./types";
import { YahooChartProvider } from "./yahoo";
import { EastmoneyProvider } from "./eastmoney";

export type { DailyClose, PriceProvider, PriceSource, SplitEvent } from "./types";
export { YahooChartProvider } from "./yahoo";
export { EastmoneyProvider } from "./eastmoney";
export { StooqProvider } from "./stooq"; // 休眠：源已上反爬墙，不进默认链

// 价格陈旧判定：latest date 落后超过 maxAgeDays（自然日，宽容覆盖周末/假日）。
export function isStale(d: DailyClose | null, maxAgeDays = 5): boolean {
  if (!d) return true;
  const ageMs = Date.now() - new Date(`${d.date}T00:00:00Z`).getTime();
  return ageMs > maxAgeDays * 86_400_000;
}

// 每日：按 providers 顺序逐个尝试；返回第一个"新鲜"结果；都不新鲜则返回首个非空（尽力而为）。
export async function resolveDaily(
  ticker: string,
  providers: PriceProvider[],
): Promise<DailyClose | null> {
  let best: DailyClose | null = null;
  for (const p of providers) {
    const d = await p.fetchDaily(ticker).catch(() => null);
    if (d && !isStale(d)) return d;
    if (d && !best) best = d;
  }
  return best;
}

// 日更(整段):同 resolveDaily 的选源规则,但返回该源的近几日日线(升序),供整段 upsert 自愈。
// 无 fetchRecent 的源退化为单根。
export async function resolveRecent(
  ticker: string,
  providers: PriceProvider[],
): Promise<DailyClose[]> {
  let best: DailyClose[] = [];
  for (const p of providers) {
    const rows = p.fetchRecent
      ? await p.fetchRecent(ticker).catch(() => [] as DailyClose[])
      : await p.fetchDaily(ticker).then((d) => (d ? [d] : []), () => [] as DailyClose[]);
    const latest = rows[rows.length - 1] ?? null;
    if (latest && !isStale(latest)) return rows;
    if (latest && !best.length) best = rows;
  }
  return best;
}

// 历史：按 providers 顺序，返回第一个非空。
export async function resolveHistory(
  ticker: string,
  sinceYears: number,
  providers: PriceProvider[],
): Promise<DailyClose[]> {
  for (const p of providers) {
    const rows = await p.fetchHistory(ticker, sinceYears).catch(() => []);
    if (rows.length) return rows;
  }
  return [];
}

// 生产默认链：Yahoo 主（铁稳）→ Eastmoney 尽力而为兜底（限流时优雅降空）。零 key。
export function defaultProviders(): PriceProvider[] {
  return [new YahooChartProvider(), new EastmoneyProvider()];
}
