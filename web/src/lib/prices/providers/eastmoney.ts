import type { DailyClose, PriceProvider } from "./types";
import { toEastmoneySymbol } from "./symbol";

type EastmoneyKlineJson = { data?: { klines?: string[] } | null };

// klines 每行 "YYYY-MM-DD,close[,...]"（fields2=f51,f53 → 日期,收盘；多余列容忍）。
export function parseEastmoneyKline(json: EastmoneyKlineJson, ticker: string): DailyClose[] {
  const klines = json?.data?.klines;
  if (!Array.isArray(klines)) return [];
  const T = ticker.trim().toUpperCase();
  const out: DailyClose[] = [];
  for (const k of klines) {
    const parts = String(k).split(",");
    const date = (parts[0] ?? "").trim();
    const close = Number(parts[1]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) continue;
    out.push({ ticker: T, date, close, currency: "USD", source: "eastmoney" });
  }
  return out;
}

const KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
// secid 前缀：105=NASDAQ, 106=NYSE。不知道在哪个市场 → 逐个探测。
const PREFIXES = ["105", "106"] as const;

export class EastmoneyProvider implements PriceProvider {
  readonly name = "eastmoney" as const;
  constructor(private fetchImpl: typeof fetch = fetch) {}

  // klt=101 日线, fqt=0 不复权(与 Yahoo 可比), end 给远期取最近 lmt 根。8s 超时防卡住 cron。
  private async fetchKlines(ticker: string, lmt: number): Promise<DailyClose[]> {
    const sym = toEastmoneySymbol(ticker);
    for (const prefix of PREFIXES) {
      const url = `${KLINE_URL}?secid=${prefix}.${sym}&fields1=f1&fields2=f51,f53&klt=101&fqt=0&lmt=${lmt}&end=20500101`;
      try {
        const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const rows = parseEastmoneyKline(await res.json(), ticker);
        if (rows.length) return rows;
      } catch {
        // 超时/不可达/解析失败 → 试下一个前缀或放弃
      }
    }
    return [];
  }

  async fetchHistory(ticker: string, sinceYears: number): Promise<DailyClose[]> {
    const lmt = Math.min(10000, Math.ceil(sinceYears * 260) + 20);
    return this.fetchKlines(ticker, lmt);
  }

  async fetchDaily(ticker: string): Promise<DailyClose | null> {
    const rows = await this.fetchKlines(ticker, 5);
    return rows.length ? rows[rows.length - 1] : null;
  }
}
