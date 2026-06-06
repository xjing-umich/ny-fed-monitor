/**
 * indicatorBlurbs.ts — Plain-language one-liner descriptions for each macro indicator.
 * Factored here so the overview page and indicator entity pages share the same strings.
 */

export type IndicatorBlurb = { zh: string; en: string };

export const INDICATOR_BLURBS: Record<string, IndicatorBlurb> = {
  "repo-financing": {
    zh: "回购融资市场的规模与压力——衡量短期资金供需是否紧张",
    en: "Size and stress in the repo financing market — a gauge of short-term funding supply and demand",
  },
  "reference-rates": {
    zh: "SOFR 等短端基准利率与利差——反映隔夜资金成本和市场分层",
    en: "Short-end benchmark rates like SOFR and their spreads — reflecting overnight funding costs and market tiering",
  },
  "facility-usage": {
    zh: "美联储 ON RRP 和 SRF 等货币政策工具的使用量——显示准备金充裕程度",
    en: "Usage of Fed facilities like ON RRP and SRF — showing whether reserves are abundant or scarce",
  },
  "fails": {
    zh: "国债结算失败规模——流动性紧张或特定证券缺货的早期预警信号",
    en: "Volume of Treasury settlement fails — an early-warning signal of liquidity stress or securities scarcity",
  },
  "auction-risk": {
    zh: "国债拍卖的需求强弱与尾部风险——评估市场消化新增供给的能力",
    en: "Demand strength and tail risk in Treasury auctions — assessing the market's capacity to absorb new supply",
  },
  "soma": {
    zh: "美联储 SOMA 持仓规模——追踪 QT/QE 进程对市场流动性的影响",
    en: "Fed's SOMA portfolio size — tracking how QT/QE affects market liquidity",
  },
  "dealer-inventory": {
    zh: "一级交易商净库存——反映做市商的风险承担意愿和市场深度",
    en: "Primary dealer net inventory — reflecting market-makers' risk appetite and market depth",
  },
  "transactions": {
    zh: "国债成交量与流动性——衡量二级市场活跃度和价格发现效率",
    en: "Treasury trading volume and liquidity — measuring secondary market activity and price discovery efficiency",
  },
  "market-share": {
    zh: "交易商集中度——显示市场是否由少数机构主导，影响流动性韧性",
    en: "Dealer concentration — showing whether a handful of firms dominate trading, which affects liquidity resilience",
  },
  "policy-expectations": {
    zh: "市场隐含的政策利率预期——反映投资者对美联储下一步行动的定价",
    en: "Market-implied policy rate expectations — reflecting investors' pricing of the Fed's next moves",
  },
  "data-freshness": {
    zh: "各数据源的更新时间和健康状态——系统监控面板",
    en: "Update timestamps and health status for each data source — system monitoring dashboard",
  },
};

export function indicatorBlurb(lang: "zh" | "en", indicator: string): string {
  const b = INDICATOR_BLURBS[indicator];
  if (!b) return indicator;
  return b[lang];
}
