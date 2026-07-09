// 独门重仓(Lonely Conviction): 少人持 + 够重的交集 —— 一个投资人最不随大流的实质下注。
// 双闸: 共持数 ≤ maxHolders(默认 2 = 只此人 + 至多 1 家)且 组合权重 ≥ minWeight(默认 3%)。
// 权重在函数内自算 value/totalValue(与投资人页 top1Pct 同源), 不依赖 h.weight 的量纲。

export type LonelyHolding = {
  issuer: string;
  ticker: string;
  weight: number;       // 组合权重(0–1), = value / totalValue
  holderCount: number;  // 被几家超投共持(含本人)
  value: number;
};

export const LONELY_MAX_HOLDERS = 2;
export const MIN_CONVICTION_WEIGHT = 0.03;
export const LONELY_LIMIT = 6;

export function deriveLonelyConviction(input: {
  holdings: { cusip: string; issuer: string; value: number }[];
  cusipToTicker: Map<string, string>;
  holderCounts: Map<string, number>;
  totalValue: number;
}): LonelyHolding[] {
  const { totalValue } = input;
  if (!(totalValue > 0)) return [];

  const out: LonelyHolding[] = [];
  for (const h of input.holdings) {
    const ticker = input.cusipToTicker.get(h.cusip);
    if (!ticker) continue;                                             // 未解析 ticker → 跳
    const holderCount = input.holderCounts.get(ticker.toUpperCase());
    if (holderCount == null || holderCount > LONELY_MAX_HOLDERS) continue;  // 共持缺失/拥挤 → 跳
    const weight = h.value / totalValue;
    if (weight < MIN_CONVICTION_WEIGHT) continue;                     // 太小 → 跳
    out.push({ issuer: h.issuer, ticker, weight, holderCount, value: h.value });
  }
  out.sort((a, b) => b.weight - a.weight);
  return out;
}
