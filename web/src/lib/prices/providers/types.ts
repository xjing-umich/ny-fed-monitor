// 价格源统一返回结构。日级收盘价（EOD）。
export type PriceSource = "yahoo" | "eastmoney" | "stooq" | "twelvedata";

export type DailyClose = {
  ticker: string;     // 大写 app ticker
  date: string;       // YYYY-MM-DD (UTC 交易日)
  close: number;      // > 0
  currency: string;   // 'USD'
  source: PriceSource;
};

// 任一价格源实现此接口；网络细节藏在实现内。
export interface PriceProvider {
  name: PriceSource;
  fetchDaily(ticker: string): Promise<DailyClose | null>;
  fetchHistory(ticker: string, sinceYears: number): Promise<DailyClose[]>;
}
