// Finnhub /quote 纯逻辑(无网络): 响应 → {close,date}。网络在 scripts/lib/updatePrices.ts。
export type FinnhubQuote = { c?: number; t?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number };
export type ParsedQuote = { close: number; date: string };

/** c=当前/最近收盘价; t=最后成交秒级 epoch。c>0 才有效; date 取 t 的 UTC 日期(交易日)。 */
export function parseQuote(q: FinnhubQuote): ParsedQuote | null {
  if (!q || typeof q.c !== "number" || q.c <= 0 || typeof q.t !== "number" || q.t <= 0) return null;
  const date = new Date(q.t * 1000).toISOString().slice(0, 10);
  return { close: q.c, date };
}
