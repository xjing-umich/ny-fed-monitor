import type { PriceData } from "./types";

// store-first：估值从 prices 表读最新收盘价（由 Yahoo/Eastmoney 摄取入库）。
// 动态 import priceRead：它是 server-only，静态导入会让估值 barrel 在模块求值期
// 触发 server-only（tsx 测试/脚本里会抛错）；延迟到实际调用时（服务端）再加载。
export async function fetchStorePrice(ticker: string): Promise<PriceData | null> {
  const T = ticker.trim().toUpperCase();
  const { getLatestPrice } = await import("@/lib/managers/priceRead");
  const p = await getLatestPrice(T);
  if (!p) return null;
  return {
    ticker: T,
    latest_price: p.close,
    price_date: p.date,
    currency: p.currency,
    source: p.source ? `STORE_${p.source.toUpperCase()}` : "STORE",
  };
}

export function mockPrice(ticker: string, latestPrice = 430, priceDate = "2026-06-08"): PriceData {
  return {
    ticker: ticker.trim().toUpperCase(),
    latest_price: latestPrice,
    price_date: priceDate,
    currency: "USD",
    source: "MOCK_PRICE",
  };
}
