import type { Lang } from "@/lib/nav";

/**
 * 个股分区跨页术语表 —— 同一概念只用一套中英标签。
 * - 列表/筛选「持有机构数」：按基金/机构计数
 * - 详情 masthead「持有人数」：持有该票的超级投资者人数（人）
 * - EN 两侧均可 "Holders"；ZH 必须区分机构 vs 人
 */
export const STOCK_GLOSSARY = {
  zh: {
    security: "标的",
    holdersInstitution: "持有机构数",
    holdersInstitutionShort: "持有",
    holdersPeople: "持有人数",
    totalValue: "合计持仓市值",
    totalValueShort: "持仓市值",
    links: "链接",
    byHolders: "按持有机构数",
  },
  en: {
    security: "Security",
    holdersInstitution: "Holders",
    holdersInstitutionShort: "Holders",
    holdersPeople: "Holders",
    totalValue: "Total value",
    totalValueShort: "Value",
    links: "Links",
    byHolders: "By holders",
  },
} as const;

/** 列表 / 筛选 / 详情共用的轻量 UI 文案。 */
export const STOCK_UI = {
  zh: {
    collapse: "收起",
    showMore: (n: number) => `展开其余 ${n} 只`,
    backToStocks: "← 个股",
    alsoOn: "也可在",
    stocksTitle: "个股",
    emptyScreener: "当前筛选暂无可展示的估值结果。",
    search: "搜索代码或公司…",
    noResults: "无匹配结果",
    count: (m: number, n: number) => (m === n ? `共 ${n} 只` : `匹配 ${m} / 共 ${n} 只`),
    more: "加载更多",
    prev: "上一页",
    next: "下一页",
    pageOf: (p: number, n: number) => `第 ${p} / ${n} 页`,
  },
  en: {
    collapse: "Collapse",
    showMore: (n: number) => `Show ${n} more`,
    backToStocks: "← Stocks",
    alsoOn: "Also on",
    stocksTitle: "Stocks",
    emptyScreener: "No valuation results to display in this view.",
    search: "Search ticker or name…",
    noResults: "No results",
    count: (m: number, n: number) => (m === n ? `${n} stocks` : `${m} of ${n}`),
    more: "Load more",
    prev: "Prev",
    next: "Next",
    pageOf: (p: number, n: number) => `Page ${p} of ${n}`,
  },
} as const;

/** 详情页区块级文案（与 HoldersTable 内 TABLE_COPY 分工：这里管 masthead / 各节标题）。 */
export const STOCK_PAGE_COPY = {
  zh: {
    subtitle: (n: number) => `${n} 位超级投资者持有。`,
    disclaimer:
      "仅供教育与信息参考，不构成投资建议。13F 持仓为机构自行申报的季末快照，通常在季末后 45 天内申报，遇周末或假日顺延；不代表当前仓位。",
    price: "现价",
    marginOfSafety: "安全边际",
    bq: {
      aria: "生意质量",
      eyebrow: "SEC · 基本面",
      title: "生意质量",
      asOf: (d: string) => `最新完整财年（截至 ${d}）`,
      // 全站唯一的历史营收增速口径(revenueGrowthStandard),带年份区间;无则退回最近财年同比并写明。
      revenueGrowth: (span: string) => `营收年化增速（FY ${span}）`,
      revenueYoy: "最近财年营收同比",
      netMargin: "净利率",
      fcfMargin: "自由现金流利润率",
      revenueTrail: (from: string, to: string, span: string) =>
        `营收 ${from} → ${to} · ${span}（按报告期末年份列示）`,
      incomplete: "基本面数据不完整，仅供参考。",
      learn: "什么样的生意算优质",
    },
    valuation: {
      eyebrow: "估值 · 价值区间",
      splitPaused: "该公司近期拆股，每股估值口径待下一份财报对齐后恢复。",
      moatDistorted: "多年回购已把股东权益压成负数，重置价值和护城河没法从资产端算，这里不给出估值判定。",
      holdcoNotAssessable: "这是一家以投资组合为主体的控股集团。把整体盈利力和资产重置价值放在一起比，对它没有经济含义——一个可交易的证券组合，重置成本就是它当时的市价，持有它本身不构成竞争壁垒。这里不给出价值区间和护城河判定，下面的资产底只作参考下限。",
      holdcoSotpTitle: "分部估值",
      holdcoSotpCentral: "每股中枢 · 基础档",
      holdcoSotpIntro:
        "这是一家以投资组合为主体的控股集团，合并层面的单一口径对它没有经济含义。下面按巴菲特本人的分栏法拆开算：投资按市值计，经营业务按盈利给倍数，两者相加再扣掉证券未实现增值对应的递延税。",
      holdcoSotpInvestments: "投资按市值",
      holdcoSotpOperating: "非保险经营业务",
      holdcoSotpUnderwriting: "保险承保",
      holdcoSotpDeferredTax: "减：递延所得税",
      holdcoSotpUnit: (unit: "share" | "ADS") => unit === "ADS" ? "每 ADS 估值（美元）" : "每股估值（美元）",
      holdcoSotpTotal: "合计",
      holdcoSotpNote:
        "经营业务与承保取最近三个财年的均值；倍数分别为 12/15/18 倍与 8/10/12 倍，承保因结果波动更大而给更低倍数。投资组合由浮存金支撑的部分不另行扣减，浮存金成本为负，扣它会与承保利润重复惩罚。经营业务的实际税率低于法定税率，主要来自能源业务的可再生能源税收抵免。投资与递延税是时点数，这两行在三档下取值相同。",
      tierPessimistic: "悲观",
      tierBase: "基础",
      tierOptimistic: "乐观",
      assetFloorLabel: "资产底（每股）",
      methodsConflict: (iv: string, floor: string, price: string) =>
        `两种方法在这里给出相反答案：所有者盈利折现的中枢约 ${iv}，反而低于零增长底 ${floor}；现价 ${price} 夹在两者之间，按前者不便宜、按后者低于底。是否便宜没有可信答案，这里不给出估值判定。`,
      growthEvidenceMissing: "近期可比财报或经营再投资资料不足，暂不判断贵便宜。下方保留零增长盈利能力及所用报告期，待资料完整后恢复增长估值。",
      fundamentalsSuspect: "这家公司的财报数据存在口径问题（如营业利润高于营收），数值不可靠，暂不给出估值判定，待数据修正后恢复。",
      learn: "内在价值怎么读",
      ttmBasis: (d: string) => `估值口径：截至 ${d} 的滚动十二个月（最新 10-K 叠加未审计 10-Q）。`,
    },
    holders: {
      eyebrow: "SEC 13F · 持有人",
      learn: "如何读懂 13F",
    },
    coOwned: {
      aria: "共同持仓",
      eyebrow: "SEC 13F · 共持信号",
      title: "他们还共同持有",
      lead: (issuer: string, ticker: string) =>
        `持有 ${issuer}（${ticker}）的这些人还共同重仓 →`,
      shared: (n: number) => `${n} 人`,
    },
    folded: "文字说明",
    foldedEyebrow: "SEC 13F · 说明",
    externalAria: "外部金融数据",
    breadcrumbStocks: "个股",
  },
  en: {
    subtitle: (n: number) => `Held by ${n} superinvestor${n === 1 ? "" : "s"}.`,
    disclaimer:
      "Educational data only — not investment advice. 13F positions are self-reported quarter-end snapshots, usually filed within 45 days after quarter-end, extended for weekends and holidays; they do not represent current positions.",
    price: "Price",
    marginOfSafety: "Margin of safety",
    bq: {
      aria: "Business quality",
      eyebrow: "SEC · fundamentals",
      title: "Business quality",
      asOf: (d: string) => `Latest full fiscal year (ended ${d})`,
      revenueGrowth: (span: string) => `Revenue growth, annualized (FY ${span})`,
      revenueYoy: "Revenue, latest FY vs prior",
      netMargin: "Net margin",
      fcfMargin: "FCF margin",
      revenueTrail: (from: string, to: string, span: string) =>
        `Revenue ${from} → ${to} · ${span} (years refer to reporting-period ends)`,
      incomplete: "Fundamentals data incomplete — read with care.",
      learn: "What makes a business high quality",
    },
    valuation: {
      eyebrow: "Valuation · value range",
      splitPaused: "Recent stock split — per-share valuation is paused until the next filing restates the share count.",
      moatDistorted: "Years of buybacks have pushed shareholders' equity negative, so reproduction value and the moat can't be assessed from the asset side. No valuation verdict is shown here.",
      holdcoNotAssessable: "This is a holding company whose balance sheet is led by an investment portfolio. Comparing consolidated earnings power against reproduction value says nothing here — a marketable portfolio reproduces at its own market price, so owning it is not a competitive barrier. No value range or moat verdict is shown; the asset floor below is a floor only.",
      holdcoSotpTitle: "Sum of the parts",
      holdcoSotpCentral: "central estimate · per share",
      holdcoSotpIntro:
        "This is a holding company led by an investment portfolio, so a single consolidated lens says little about it. Below it is broken out the way Buffett himself presented it: investments at market, operating businesses on a multiple of earnings, added together, less the deferred tax on unrealized securities gains.",
      holdcoSotpInvestments: "Investments at market",
      holdcoSotpOperating: "Non-insurance operating businesses",
      holdcoSotpUnderwriting: "Insurance underwriting",
      holdcoSotpDeferredTax: "Less: deferred tax",
      holdcoSotpUnit: (unit: "share" | "ADS") => unit === "ADS" ? "Value per ADS (USD)" : "Value per share (USD)",
      holdcoSotpTotal: "Total",
      holdcoSotpNote:
        "Operating earnings and underwriting are three-year averages, capitalized at 12/15/18× and 8/10/12×. Underwriting gets the lower range because its results swing far harder. Float is not deducted from the portfolio: its cost is negative, and deducting it would penalize the same economics twice alongside underwriting profit. The operating businesses' effective tax rate runs below statutory, largely on renewable-energy credits in the energy segment. Investments and deferred tax are balance-sheet figures, so those two rows read the same across all three columns.",
      tierPessimistic: "Low",
      tierBase: "Base",
      tierOptimistic: "High",
      assetFloorLabel: "Asset floor (per share)",
      methodsConflict: (iv: string, floor: string, price: string) =>
        `The two methods disagree here: the owner-earnings DCF central value is about ${iv}, below the zero-growth floor of ${floor}. At ${price} the price sits between them — not cheap by the first, below the floor by the second. With no trustworthy answer on cheapness, no valuation verdict is shown.`,
      growthEvidenceMissing: "Current comparable financials or operating reinvestment data are incomplete, so no valuation verdict is shown. The zero-growth earnings reference and its reporting period remain below.",
      fundamentalsSuspect: "This company's reported figures contain an impossible value (e.g., operating income above revenue), so the data can't be trusted and no valuation verdict is shown until it's corrected.",
      learn: "How to read intrinsic value",
      ttmBasis: (d: string) => `Valuation basis: trailing twelve months to ${d} — latest 10-K plus unaudited 10-Q filings.`,
    },
    holders: {
      eyebrow: "SEC 13F · holders",
      learn: "How to read a 13F",
    },
    coOwned: {
      aria: "Co-ownership",
      eyebrow: "SEC 13F · co-ownership",
      title: "Also held by these investors",
      lead: (issuer: string, ticker: string) =>
        `Investors holding ${issuer} (${ticker}) also commonly hold →`,
      shared: (n: number) => `${n} holder${n === 1 ? "" : "s"}`,
    },
    folded: "Written summary",
    foldedEyebrow: "SEC 13F · notes",
    externalAria: "External finance links",
    breadcrumbStocks: "Stocks",
  },
} as const;

export function stockGlossary(lang: Lang) {
  return STOCK_GLOSSARY[lang];
}

export function stockUi(lang: Lang) {
  return STOCK_UI[lang];
}

export function stockPageCopy(lang: Lang) {
  return STOCK_PAGE_COPY[lang];
}
