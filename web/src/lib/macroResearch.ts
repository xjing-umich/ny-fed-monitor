import type { DataPayload, Metric, Section } from "@/lib/types";

export type Lang = "zh" | "en";

type LocalText = { zh: string; en: string };

export type MacroDisplayLevel = "overview" | "detail" | "source" | "hidden";
export type MacroSignalRole = "core_signal" | "supporting_signal" | "context_metadata" | "todo_placeholder";

export type MacroUsefulnessRule = {
  usefulnessScore: 1 | 2 | 3 | 4 | 5;
  displayLevel: MacroDisplayLevel;
  signalRole: MacroSignalRole;
};

export const MACRO_USEFULNESS: Record<string, MacroUsefulnessRule> = {
  "reference-rates": { usefulnessScore: 5, displayLevel: "overview", signalRole: "core_signal" },
  "facility-usage": { usefulnessScore: 5, displayLevel: "overview", signalRole: "core_signal" },
  "repo-financing": { usefulnessScore: 5, displayLevel: "overview", signalRole: "core_signal" },
  fails: { usefulnessScore: 5, displayLevel: "overview", signalRole: "core_signal" },
  "auction-risk": { usefulnessScore: 5, displayLevel: "overview", signalRole: "core_signal" },
  soma: { usefulnessScore: 5, displayLevel: "overview", signalRole: "core_signal" },
  "dealer-inventory": { usefulnessScore: 5, displayLevel: "overview", signalRole: "core_signal" },
  transactions: { usefulnessScore: 4, displayLevel: "detail", signalRole: "supporting_signal" },
  "market-share": { usefulnessScore: 3, displayLevel: "detail", signalRole: "supporting_signal" },
  "policy-expectations": { usefulnessScore: 4, displayLevel: "overview", signalRole: "supporting_signal" },
  "macro-pricing": { usefulnessScore: 5, displayLevel: "overview", signalRole: "core_signal" },
  "macro-conditions": { usefulnessScore: 5, displayLevel: "overview", signalRole: "core_signal" },
  "wage-pressure": { usefulnessScore: 4, displayLevel: "overview", signalRole: "supporting_signal" },
  "data-freshness": { usefulnessScore: 5, displayLevel: "overview", signalRole: "core_signal" },
};

export type SnapshotItem = {
  key: string;
  label: LocalText;
  value: string;
  sourceKey: string;
  hrefKey?: string;
  tone: "green" | "yellow" | "orange" | "red" | "gray";
};

export type WatchItem = {
  key: string;
  label: LocalText;
  detail: LocalText;
  sourceKey?: string;
  tone: "green" | "yellow" | "orange" | "red" | "gray";
};

export type CrossSignalCheck = {
  key: string;
  label: LocalText;
  detail: LocalText;
  primaryKey: string;
  secondaryKey: string;
  tone: "green" | "yellow" | "orange" | "red" | "gray";
};

export type ResearchPrompt = {
  key: string;
  question: LocalText;
  detail: LocalText;
  hrefKey: string;
};

export type MacroSummary = {
  headline: LocalText;
  bullets: LocalText[];
  primaryDriver: LocalText;
};

export type DriverModule = {
  key: "funding" | "supply" | "policy" | "macro-pricing";
  label: LocalText;
  question: LocalText;
  indicatorKeys: string[];
  comingSignals?: LocalText[];
};

export const DRIVER_MODULES: DriverModule[] = [
  {
    key: "funding",
    label: { zh: "资金面", en: "Funding" },
    question: {
      zh: "短端资金是否开始变贵或分层？",
      en: "Is short-end funding becoming expensive or tiered?",
    },
    indicatorKeys: ["reference-rates", "facility-usage", "repo-financing", "fails"],
  },
  {
    key: "supply",
    label: { zh: "供给面", en: "Supply" },
    question: {
      zh: "市场是否顺利吸收新增久期供给？",
      en: "Is the market absorbing new duration supply cleanly?",
    },
    indicatorKeys: ["auction-risk", "soma", "dealer-inventory", "transactions", "market-share"],
  },
  {
    key: "policy",
    label: { zh: "政策面", en: "Policy" },
    question: {
      zh: "政策路径是否仍在压住曲线前端？",
      en: "Is the policy path still anchoring the front end?",
    },
    indicatorKeys: ["policy-expectations"],
    comingSignals: [
      { zh: "FOMC 文本与会议纪要语气", en: "FOMC statement and minutes tone" },
      { zh: "r-star / real policy gap", en: "r-star / real policy gap" },
    ],
  },
  {
    key: "macro-pricing",
    label: { zh: "宏观定价", en: "Macro Pricing" },
    question: {
      zh: "增长、通胀与实际利率是否支持更高收益率？",
      en: "Do growth, inflation, and real rates support higher yields?",
    },
    indicatorKeys: ["macro-pricing", "macro-conditions", "wage-pressure"],
    comingSignals: [
      { zh: "Cleveland inflation nowcast", en: "Cleveland inflation nowcast" },
      { zh: "更多劳动力细项", en: "Deeper labor details" },
    ],
  },
];

export const MACRO_INDICATOR_RESEARCH: Record<string, {
  sources: string[];
  drivers: LocalText[];
  watch: LocalText[];
  misleading: LocalText[];
  lineage: LocalText;
}> = {
  "reference-rates": {
    sources: ["New York Fed Reference Rates"],
    drivers: [{ zh: "资金面", en: "Funding" }, { zh: "政策面", en: "Policy" }],
    watch: [
      { zh: "SOFR-EFFR 是否持续高于 10-20bp，并且不只是季末、税期或单日技术性波动。", en: "Whether SOFR-EFFR stays above 10-20 bps and is not just quarter-end, tax-date, or one-day technical pressure." },
      { zh: "TGCR/BGCR 是否同步确认 secured funding 广泛变贵；相关利率只能算 breadth，不能当作完全独立证据。", en: "Whether TGCR/BGCR confirm broad secured-funding pressure; related repo rates add breadth, not fully independent evidence." },
      { zh: "利差压力是否传导到 ON RRP/SRF、repo financing 或 settlement fails。", en: "Whether spread pressure transmits into ON RRP/SRF, repo financing, or settlement fails." },
    ],
    misleading: [
      { zh: "SOFR 水平本身不是 funding stress；需要看 SOFR-EFFR/SOFR-IORB 与其他 repo/collateral 指标确认。", en: "SOFR level alone is not funding stress; confirm with SOFR-EFFR/SOFR-IORB and other repo/collateral indicators." },
      { zh: "单日季末、税期或技术性波动不一定代表系统性资金压力。", en: "Quarter-end, tax-date, or one-day technical moves may not imply systemic funding stress." },
    ],
    lineage: {
      zh: "来自 NY Fed 官方 reference rates，进入首页核心快照与 Funding 判断。",
      en: "Sourced from NY Fed reference rates; used in the home snapshot and Funding verdict.",
    },
  },
  "facility-usage": {
    sources: ["New York Fed Open Market Operations", "Federal Reserve Board H.4.1 context"],
    drivers: [{ zh: "资金面", en: "Funding" }, { zh: "供给面", en: "Supply" }],
    watch: [
      { zh: "ON RRP 下降是否与 SOFR-EFFR 抬升、SRF/Repo 使用和准备金背景同向。", en: "Whether lower ON RRP aligns with higher SOFR-EFFR, SRF/repo usage, and reserve context." },
      { zh: "SRF/Repo 是否从小额测试转向真实使用，并且与 repo rates 压力同日或同周期出现。", en: "Whether SRF/repo operations move from small tests to real usage and line up with repo-rate pressure." },
    ],
    misleading: [
      { zh: "ON RRP 低不等于资金紧；需要和 reserves、SOFR-EFFR、SRF 一起看。", en: "Low ON RRP does not by itself mean scarcity; cross-check reserves, SOFR-EFFR, and SRF." },
      { zh: "工具使用数据说明流动性缓冲和政策工具使用，不应单独替代 repo reference rates。", en: "Facility data describes liquidity buffers and facility usage; it should not replace repo reference rates by itself." },
    ],
    lineage: {
      zh: "来自 NY Fed 工具操作数据，作为准备金充裕度和政策工具使用的核心信号。",
      en: "Sourced from NY Fed facility operations; a core signal for reserve abundance and facility usage.",
    },
  },
  "repo-financing": {
    sources: ["New York Fed Primary Dealer Statistics"],
    drivers: [{ zh: "资金面", en: "Funding" }, { zh: "机构行为", en: "Institutional Behavior" }],
    watch: [
      { zh: "融资使用量是否处于高历史分位，并且是否与 dealer inventory、auction absorption 同时偏高。", en: "Whether financing usage sits at a high historical percentile and coincides with dealer inventory or auction absorption pressure." },
      { zh: "高融资是否传导到 SOFR-EFFR、SRF/Repo 或 settlement fails；没有传导时更像仓位/成交背景。", en: "Whether high financing spills into SOFR-EFFR, SRF/repo, or settlement fails; without spillover it is more position/activity context." },
    ],
    misleading: [
      { zh: "融资规模高可能只是库存或成交量高，不一定是压力。", en: "High financing can reflect high inventory or activity, not necessarily stress." },
      { zh: "周度 dealer 数据不能解释日内 funding shock，置信度需要低于实时 repo/funding 数据。", en: "Weekly dealer data cannot explain intraday funding shocks; confidence should be lower than live repo/funding data." },
    ],
    lineage: {
      zh: "来自 NY Fed 一级交易商统计，进入 Funding 与机构行为交叉判断。",
      en: "Sourced from NY Fed Primary Dealer Statistics; used across Funding and institutional behavior.",
    },
  },
  fails: {
    sources: ["New York Fed Primary Dealer Statistics"],
    drivers: [{ zh: "资金面", en: "Funding" }, { zh: "市场结构", en: "Market Structure" }],
    watch: [
      { zh: "fails to deliver/receive 是否同步且持续上升，而不是单周噪音。", en: "Whether fails to deliver and fails to receive rise together and persist beyond one weekly print." },
      { zh: "fails 是否与 repo rate pressure、auction cycle 或 dealer inventory 同时出现。", en: "Whether fails line up with repo-rate pressure, auction cycles, or dealer inventory." },
    ],
    misleading: [
      { zh: "结算失败有时是局部券种短缺，不一定代表全市场流动性崩坏。", en: "Fails can be CUSIP-specific scarcity rather than broad market dysfunction." },
      { zh: "当前是 aggregate weekly fails；没有 CUSIP-level specialness 时，不能断言某只券 special。", en: "Current data is aggregate weekly fails; without CUSIP-level specialness, do not claim a specific issue is special." },
    ],
    lineage: {
      zh: "来自 NY Fed 一级交易商 fails 数据，用于 Funding stress 和 specialness 早期预警。",
      en: "Sourced from NY Fed dealer fails data; an early warning for funding stress and specialness.",
    },
  },
  "auction-risk": {
    sources: ["Treasury.gov Auctions", "New York Fed dealer context"],
    drivers: [{ zh: "供给面", en: "Supply" }],
    watch: [
      { zh: "未来 7/14 天发行量是否集中；大供给只有在需求、成交或 dealer 吸收变弱时才成为市场压力。", en: "Whether 7/14-day issuance is concentrated; large supply becomes market pressure only when demand, trading, or dealer absorption weakens." },
      { zh: "bid-to-cover、indirect/direct/dealer share 是否恶化，并和 post-auction performance 同向。", en: "Whether bid-to-cover, indirect/direct/dealer shares deteriorate and line up with post-auction performance." },
      { zh: "如果没有 when-issued yield，tail/stop-through 只能作为低置信度或不可用项。", en: "Without a when-issued yield, tail/stop-through should be treated as low-confidence or unavailable." },
    ],
    misleading: [
      { zh: "单次拍卖差不一定改变趋势；要结合连续拍卖和 dealer inventory。", en: "One weak auction may not define the trend; pair it with consecutive auctions and dealer inventory." },
      { zh: "bid-to-cover 高不一定代表价格需求强；若 tail 或 dealer takedown 同时偏弱，应降低结论强度。", en: "A high bid-to-cover does not guarantee strong price-sensitive demand; downgrade confidence if tail or dealer takedown looks weak." },
    ],
    lineage: {
      zh: "来自 Treasury auction 日历和结果，并用 dealer/fails/transactions 做供给吸收背景。",
      en: "Sourced from Treasury auction calendar/results, contextualized with dealer, fails, and transaction data.",
    },
  },
  soma: {
    sources: ["New York Fed SOMA"],
    drivers: [{ zh: "供给面", en: "Supply" }, { zh: "政策面", en: "Policy" }],
    watch: [
      { zh: "Treasury/MBS 持仓的 4 周和 13 周变化。", en: "4-week and 13-week changes in Treasury/MBS holdings." },
      { zh: "QT/QE 变化是否与准备金和 ON RRP 同向收缩。", en: "Whether QT/QE shifts line up with reserves and ON RRP drawdown." },
    ],
    misleading: [
      { zh: "SOMA 缩表是慢变量，不应替代拍卖与 dealer absorption 的短期判断。", en: "SOMA runoff is slow-moving and should not replace auction and dealer absorption signals." },
    ],
    lineage: {
      zh: "来自 NY Fed SOMA 持仓，用于判断 Fed 持仓变化和久期供给背景。",
      en: "Sourced from NY Fed SOMA holdings; used to frame Fed holdings and duration supply.",
    },
  },
  "dealer-inventory": {
    sources: ["New York Fed Primary Dealer Statistics"],
    drivers: [{ zh: "供给面", en: "Supply" }, { zh: "机构行为", en: "Institutional Behavior" }],
    watch: [
      { zh: "库存分位是否进入 Elevated/Extreme，并且是否与 auction absorption 弱化、funding watch 或 fails 上升同向。", en: "Whether inventory percentile moves into Elevated/Extreme and aligns with weak auction absorption, funding watch, or rising fails." },
      { zh: "高库存是正常 warehousing，还是已经接近 constrained balance sheet。", en: "Whether high inventory is ordinary warehousing or closer to constrained balance-sheet behavior." },
    ],
    misleading: [
      { zh: "库存高可能代表做市吸收能力，也可能代表风险仓位累积，需要结合融资和 fails。", en: "High inventory can mean market-making absorption or risk accumulation; cross-check financing and fails." },
      { zh: "公开 dealer 数据是周度聚合数据；没有实时 depth、bid-ask 或 margin 数据时，不能给出高置信度的流动性崩坏判断。", en: "Public dealer data is weekly and aggregate; without live depth, bid-ask, or margin data, avoid high-confidence dysfunction claims." },
    ],
    lineage: {
      zh: "来自 NY Fed 一级交易商持仓，是供给吸收和做市商资产负债表压力的核心信号。",
      en: "Sourced from NY Fed dealer positions; a core signal for absorption and dealer balance-sheet pressure.",
    },
  },
  transactions: {
    sources: ["New York Fed Primary Dealer Statistics"],
    drivers: [{ zh: "供给面", en: "Supply" }, { zh: "市场流动性", en: "Market Liquidity" }],
    watch: [
      { zh: "成交量下降是否与库存、fails、拍卖压力同时出现。", en: "Whether lower activity coincides with inventory, fails, and auction pressure." },
      { zh: "高成交是否只是宏观 repricing，还是伴随 depth/bid-ask/funding 恶化。", en: "Whether high activity is clean macro repricing or comes with weaker depth, bid-ask, or funding." },
    ],
    misleading: [
      { zh: "成交放大不一定是流动性好，也可能是波动率冲击。", en: "Higher activity is not always better liquidity; it can reflect volatility shocks." },
      { zh: "没有实时 depth/bid-ask 时，成交量只能做 market functioning 背景，不能单独证明市场质量。", en: "Without live depth/bid-ask, volume is market-functioning context and cannot prove market quality by itself." },
    ],
    lineage: {
      zh: "来自 NY Fed 一级交易商成交数据，作为供给吸收的辅助信号。",
      en: "Sourced from NY Fed dealer transaction data; a supporting signal for absorption.",
    },
  },
  "market-share": {
    sources: ["New York Fed Market Share"],
    drivers: [{ zh: "市场结构", en: "Market Structure" }],
    watch: [
      { zh: "交易是否集中在少数 dealer。", en: "Whether trading is concentrated among a few dealers." },
    ],
    misleading: [
      { zh: "集中度数据频率较低，更适合结构背景，不适合日内判断。", en: "Concentration data is lower frequency and better for structure than day-to-day calls." },
    ],
    lineage: {
      zh: "来自 NY Fed market share 数据，默认只进入详情页/背景层。",
      en: "Sourced from NY Fed market share data; normally detail/background rather than top-level verdict.",
    },
  },
  "policy-expectations": {
    sources: ["Manual SME file", "NY Fed Survey of Market Participants context"],
    drivers: [{ zh: "政策面", en: "Policy" }, { zh: "宏观定价", en: "Macro Pricing" }],
    watch: [
      { zh: "Fed funds median path 是否显示更慢降息。", en: "Whether the fed funds median path implies slower easing." },
      { zh: "衰退概率与 Core PCE 预期是否同时上升。", en: "Whether recession probability and Core PCE expectations rise together." },
    ],
    misleading: [
      { zh: "SME 是调查型预期，更新频率低，不等同于市场实时价格。", en: "SME is survey-based and lower frequency; it is not live market pricing." },
    ],
    lineage: {
      zh: "当前来自手动 SME 文件，作为政策路径和宏观预期的辅助信号。",
      en: "Currently sourced from a manual SME file; a supporting signal for policy path and macro expectations.",
    },
  },
  "macro-pricing": {
    sources: ["FRED"],
    drivers: [{ zh: "宏观定价", en: "Macro Pricing" }, { zh: "市场定价", en: "Market Pricing" }],
    watch: [
      { zh: "10Y nominal yield、10Y real yield 与 10Y breakeven 谁在主导变化；同一个名义收益率变化可能是 real-rate tightening、inflation shock 或 risk-off。", en: "Whether the 10Y nominal yield is driven by real yields or breakevens; the same nominal move can be real-rate tightening, inflation shock, or risk-off." },
      { zh: "10Y-2Y 曲线是倒挂、走平还是重新陡峭化，并结合 2Y/10Y/30Y 判断 curve leadership。", en: "Whether the 10Y-2Y curve is inverted, flat, or steepening, and whether 2Y/10Y/30Y identify curve leadership." },
      { zh: "breakeven 需要 CPI/PCE、通胀预期或 commodities 确认；real yield 需要金融条件、信用或风险资产确认。", en: "Breakevens need confirmation from CPI/PCE, inflation expectations, or commodities; real yields need confirmation from financial conditions, credit, or risk assets." },
    ],
    misleading: [
      { zh: "FRED 日频序列是收盘/发布数据，不是实时盘中行情；不要把单日读数当成完整市场叙事。", en: "FRED daily series are closing/published data, not intraday pricing; do not make a full market story from one print." },
      { zh: "没有 same-horizon 变化和 cross-asset confirmation 时，不要把所有收益率上行都说成通胀，也不要把所有收益率下行都说成 risk-off。", en: "Without same-horizon changes and cross-asset confirmation, do not label every yield rise as inflation or every yield fall as risk-off." },
    ],
    lineage: {
      zh: "来自 FRED 的曲线、实际收益率和 breakeven 序列，用于 nominal-real-breakeven decomposition。当前是日频 public data，缺少盘中和 cross-asset 专业数据时置信度上限为中等。",
      en: "Sourced from FRED curve, real-yield, and breakeven series for nominal-real-breakeven decomposition. This is daily public data, so confidence is capped at medium without intraday and cross-asset professional confirmation.",
    },
  },
  "macro-conditions": {
    sources: ["FRED", "Atlanta Fed GDPNow via FRED", "Chicago Fed via FRED", "BLS / BEA via FRED"],
    drivers: [{ zh: "宏观定价", en: "Macro Pricing" }, { zh: "基本面确认", en: "Macro Confirmation" }],
    watch: [
      { zh: "GDPNow 是增长 nowcast，不是已公布 GDP；它只确认增长背景是否支持当前收益率。", en: "GDPNow is a growth nowcast, not realized GDP; it confirms whether the growth backdrop supports current yields." },
      { zh: "NFCI/ANFCI 是周度金融条件背景；只有和 real yields、信用、股票、美元等同向时才提高宏观金融条件置信度。", en: "NFCI/ANFCI are weekly financial-conditions context; confidence rises only when they align with real yields, credit, equities, or the dollar." },
      { zh: "CFNAI、失业率、非农和 CPI/PCE 是否同向确认增长/就业/通胀，但不能混用不同发布日期得出同日结论。", en: "Whether CFNAI, unemployment, payrolls, and CPI/PCE confirm growth/labor/inflation without mixing release dates into a same-day conclusion." },
    ],
    misleading: [
      { zh: "这些是不同频率的数据：GDPNow、周度金融条件、月度就业和通胀不能当作同一天的市场行情。", en: "These series have mixed frequencies: GDPNow, weekly financial conditions, monthly labor, and inflation should not be read as same-day market pricing." },
      { zh: "金融条件指数会和股票、信用、美元等底层资产重叠；后续加入 cross-asset 后不应重复计分。", en: "Financial-conditions indexes overlap with equities, credit, the dollar, and other components; do not double-count them if cross-assets are added later." },
    ],
    lineage: {
      zh: "来自 FRED 聚合的 Atlanta Fed GDPNow、Chicago Fed NFCI/CFNAI、BLS/BEA 宏观序列。该模块是确认层，不是实时 driver；混合频率会限制同日结论置信度。",
      en: "Sourced through FRED for Atlanta Fed GDPNow, Chicago Fed NFCI/CFNAI, and BLS/BEA macro series. This module is confirmation, not a live driver; mixed frequencies cap same-day confidence.",
    },
  },
  "wage-pressure": {
    sources: ["Atlanta Fed Wage Growth Tracker via FRED"],
    drivers: [{ zh: "宏观定价", en: "Macro Pricing" }, { zh: "劳动力市场", en: "Labor Market" }],
    watch: [
      { zh: "整体工资增长是否仍高于 3.5%-4.0%，并且是否连续多月停留在高位。", en: "Whether overall wage growth stays above the 3.5%-4.0% zone and persists for several months." },
      { zh: "留岗者工资是否仍高，显示工资黏性而非只由跳槽溢价推动。", en: "Whether job-stayer wage growth remains high, pointing to stickiness rather than only switcher premia." },
      { zh: "工资压力是否与 CPI/PCE、breakeven、policy expectations 同向；只有同向时才增强 higher-for-longer 叙事。", en: "Whether wage pressure aligns with CPI/PCE, breakevens, and policy expectations; only alignment strengthens the higher-for-longer story." },
    ],
    misleading: [
      { zh: "Wage Growth Tracker 是月度、3 个月均值，不是实时工资行情；它更适合解释黏性而非日内收益率变化。", en: "The Wage Growth Tracker is monthly and smoothed; it explains stickiness better than intraday yield moves." },
      { zh: "跳槽者工资上升可能只是 labor mix 或跳槽溢价；如果留岗者不确认，不应过度解读为全市场工资压力。", en: "Higher switcher wages can reflect labor mix or switching premia; if stayers do not confirm, avoid over-reading broad wage pressure." },
    ],
    lineage: {
      zh: "来自 FRED 聚合的 Atlanta Fed Wage Growth Tracker。它是月度、平滑后的劳动力成本确认层，用于通胀黏性和 higher-for-longer 分析；不是实时市场驱动。",
      en: "Sourced through FRED from the Atlanta Fed Wage Growth Tracker. It is a monthly, smoothed labor-cost confirmation layer for inflation stickiness and higher-for-longer analysis, not a live market driver.",
    },
  },
  "data-freshness": {
    sources: ["Internal freshness checks"],
    drivers: [{ zh: "系统信任", en: "System Trust" }],
    watch: [
      { zh: "首页核心指标是否 Fresh 或 Manual-live。", en: "Whether top-level indicators are Fresh or Manual-live." },
    ],
    misleading: [
      { zh: "Fresh 只表示数据更新正常，不表示信号本身可靠或重要。", en: "Fresh only means data updated; it does not guarantee signal importance." },
    ],
    lineage: {
      zh: "内部健康检查，用于决定首页展示可信度。",
      en: "Internal health checks used to qualify home-page confidence.",
    },
  },
};

function metric(section: Section | undefined, label: string): Metric | undefined {
  return (section?.key_metrics ?? []).find((item) => item.label === label);
}

function metricValue(sections: Record<string, Section>, sectionKey: string, label: string, fallback = "Unavailable"): string {
  return metric(sections[sectionKey], label)?.value ?? fallback;
}

function metricTone(value: string): SnapshotItem["tone"] {
  const raw = value.toLowerCase();
  if (raw.includes("extreme") || raw.includes("high")) return "red";
  if (raw.includes("elevated")) return "orange";
  if (raw.includes("watch") || raw.includes("moderate") || raw.includes("manual") || raw.includes("stale")) return "yellow";
  if (raw.includes("unavailable") || raw.includes("missing")) return "gray";
  return "green";
}

function sectionTone(section: Section | undefined): SnapshotItem["tone"] {
  return metricTone(section?.freshness_status ?? section?.mode ?? "Unavailable");
}

export function buildMarketSnapshot(data: DataPayload): SnapshotItem[] {
  const sections = data.sections;
  return [
    {
      key: "funding-rate-stress",
      label: { zh: "资金利率压力", en: "Funding Rate Stress" },
      value: metricValue(sections, "reference-rates", "Funding Rate Stress"),
      sourceKey: "reference-rates",
      tone: metricTone(metricValue(sections, "reference-rates", "Funding Rate Stress")),
    },
    {
      key: "sofr-effr",
      label: { zh: "SOFR-EFFR", en: "SOFR-EFFR" },
      value: metricValue(sections, "reference-rates", "SOFR-EFFR"),
      sourceKey: "reference-rates",
      tone: sectionTone(sections["reference-rates"]),
    },
    {
      key: "on-rrp",
      label: { zh: "ON RRP 使用量", en: "ON RRP Usage" },
      value: metricValue(sections, "facility-usage", "ON RRP Latest Usage"),
      sourceKey: "facility-usage",
      tone: sectionTone(sections["facility-usage"]),
    },
    {
      key: "repo-financing",
      label: { zh: "回购融资使用", en: "Repo Financing" },
      value: metricValue(sections, "repo-financing", "Usage Label"),
      sourceKey: "repo-financing",
      tone: metricTone(metricValue(sections, "repo-financing", "Usage Label")),
    },
    {
      key: "auction-risk",
      label: { zh: "拍卖风险", en: "Auction Risk" },
      value: metricValue(sections, "auction-risk", "Auction Risk"),
      sourceKey: "auction-risk",
      tone: metricTone(metricValue(sections, "auction-risk", "Auction Risk")),
    },
    {
      key: "dealer-inventory",
      label: { zh: "交易商库存压力", en: "Dealer Inventory" },
      value: metricValue(sections, "dealer-inventory", "Pressure Label"),
      sourceKey: "dealer-inventory",
      tone: metricTone(metricValue(sections, "dealer-inventory", "Pressure Label")),
    },
    {
      key: "fails",
      label: { zh: "结算失败方向", en: "Fails Direction" },
      value: metricValue(sections, "fails", "Fails Direction"),
      sourceKey: "fails",
      tone: metricTone(metricValue(sections, "fails", "Fails Direction")),
    },
    {
      key: "soma",
      label: { zh: "SOMA 4周变化", en: "SOMA 4w Change" },
      value: metricValue(sections, "soma", "Total SOMA 4-week Change"),
      sourceKey: "soma",
      tone: sectionTone(sections.soma),
    },
    {
      key: "policy-expectations",
      label: { zh: "政策预期风险", en: "Policy Risk" },
      value: metricValue(sections, "policy-expectations", "Policy Expectations Risk"),
      sourceKey: "policy-expectations",
      tone: metricTone(metricValue(sections, "policy-expectations", "Policy Expectations Risk")),
    },
    {
      key: "macro-pricing",
      label: { zh: "宏观定价信号", en: "Macro Pricing" },
      value: metricValue(sections, "macro-pricing", "Macro Pricing Signal"),
      sourceKey: "macro-pricing",
      tone: metricTone(metricValue(sections, "macro-pricing", "Macro Pricing Signal")),
    },
    {
      key: "ten-year-real-yield",
      label: { zh: "10Y 实际收益率", en: "10Y Real Yield" },
      value: metricValue(sections, "macro-pricing", "10Y Real Yield"),
      sourceKey: "macro-pricing",
      tone: metricTone(metricValue(sections, "macro-pricing", "Real Yield Pressure")),
    },
    {
      key: "ten-year-breakeven",
      label: { zh: "10Y Breakeven", en: "10Y Breakeven" },
      value: metricValue(sections, "macro-pricing", "10Y Breakeven"),
      sourceKey: "macro-pricing",
      tone: metricTone(metricValue(sections, "macro-pricing", "Breakeven Pressure")),
    },
    {
      key: "gdpnow",
      label: { zh: "GDPNow", en: "GDPNow" },
      value: metricValue(sections, "macro-conditions", "GDPNow"),
      sourceKey: "macro-conditions",
      tone: sectionTone(sections["macro-conditions"]),
    },
    {
      key: "financial-conditions",
      label: { zh: "金融条件", en: "Financial Conditions" },
      value: metricValue(sections, "macro-conditions", "Financial Conditions Signal"),
      sourceKey: "macro-conditions",
      tone: metricTone(metricValue(sections, "macro-conditions", "Financial Conditions Signal")),
    },
    {
      key: "inflation-signal",
      label: { zh: "通胀信号", en: "Inflation Signal" },
      value: metricValue(sections, "macro-conditions", "Inflation Signal"),
      sourceKey: "macro-conditions",
      tone: metricTone(metricValue(sections, "macro-conditions", "Inflation Signal")),
    },
    {
      key: "wage-pressure",
      label: { zh: "工资压力", en: "Wage Pressure" },
      value: metricValue(sections, "wage-pressure", "Wage Pressure Signal"),
      sourceKey: "wage-pressure",
      tone: metricTone(metricValue(sections, "wage-pressure", "Wage Pressure Signal")),
    },
  ];
}

export function buildMacroSummary(data: DataPayload): MacroSummary {
  const snapshot = buildMarketSnapshot(data);
  const severity = { red: 4, orange: 3, yellow: 2, green: 1, gray: 0 } as const;
  const watched = snapshot
    .filter((item) => ["yellow", "orange", "red"].includes(item.tone))
    .sort((a, b) => severity[b.tone] - severity[a.tone]);
  const primary = watched[0];
  const unavailableCount = snapshot.filter((item) => item.tone === "gray").length;

  const primaryDriver = primary
    ? {
        zh: `当前最需要先看的信号是 ${primary.label.zh}（${primary.value}）。`,
        en: `The first signal to check is ${primary.label.en} (${primary.value}).`,
      }
    : {
        zh: "当前已接入的资金、供给、政策和宏观信号没有显示单一主导压力。",
        en: "Connected funding, supply, policy, and macro signals do not show one dominant pressure point.",
      };

  return {
    headline: {
      zh: primary
        ? "美债市场先按压力信号排序，再下钻到资金、供给和政策来源。"
        : "美债市场当前更适合用交叉验证阅读，而不是押注单一驱动因素。",
      en: primary
        ? "Treasury signals are ranked by pressure first, then traced back to funding, supply, and policy sources."
        : "Treasury conditions are best read through cross-checks rather than a single dominant driver.",
    },
    primaryDriver,
    bullets: [
      {
        zh: `首页核心快照覆盖 ${snapshot.length} 个已接入信号，其中 ${watched.length} 个处于观察或压力状态。`,
        en: `The home snapshot covers ${snapshot.length} connected signals; ${watched.length} are in watch or stress territory.`,
      },
      {
        zh: unavailableCount
          ? `${unavailableCount} 个核心信号当前不可用或缺失，应先看数据新鲜度。`
          : "核心信号都有可展示读数，下一步看是否互相确认。"
        ,
        en: unavailableCount
          ? `${unavailableCount} core signals are unavailable or missing; check freshness first.`
          : "Core signals have displayable readings; the next step is cross-confirmation.",
      },
      {
        zh: `所有结论按“驱动信号 + 独立确认 + 数据新鲜度”读取；单个读数只触发观察，不单独生成高置信度结论。`,
        en: `All conclusions should be read as driver signal plus independent confirmation plus freshness; one print can trigger a watch item, not a high-confidence conclusion by itself.`,
      },
      {
        zh: `宏观定价已接入 nominal-real-breakeven decomposition、GDPNow、金融条件、就业、通胀和工资压力确认层。`,
        en: `Macro Pricing now uses nominal-real-breakeven decomposition, GDPNow, financial conditions, labor, inflation, and wage-pressure confirmation.`,
      },
    ],
  };
}

export function buildWatchItems(data: DataPayload): WatchItem[] {
  const sections = data.sections;
  const items: WatchItem[] = [
    {
      key: "funding-spread",
      label: { zh: "Funding spread watch", en: "Funding spread watch" },
      detail: {
        zh: `SOFR-EFFR 为 ${metricValue(sections, "reference-rates", "SOFR-EFFR")}；只有持续抬升并被 TGCR/BGCR、SRF/Repo 或 fails 确认时，才把 funding 升级为市场驱动。`,
        en: `SOFR-EFFR is ${metricValue(sections, "reference-rates", "SOFR-EFFR")}; upgrade funding to a market driver only if it persists and is confirmed by TGCR/BGCR, SRF/repo, or fails.`,
      },
      sourceKey: "reference-rates",
      tone: metricTone(metricValue(sections, "reference-rates", "Funding Rate Stress")),
    },
    {
      key: "dealer-absorption",
      label: { zh: "Dealer absorption", en: "Dealer absorption" },
      detail: {
        zh: `Dealer inventory 为 ${metricValue(sections, "dealer-inventory", "Pressure Label")}；只有和拍卖吸收走弱、funding watch 或 fails 上升同向时，才接近资产负债表约束。`,
        en: `Dealer inventory is ${metricValue(sections, "dealer-inventory", "Pressure Label")}; it approaches balance-sheet constraint only when weak auctions, funding watch, or rising fails confirm it.`,
      },
      sourceKey: "dealer-inventory",
      tone: metricTone(metricValue(sections, "dealer-inventory", "Pressure Label")),
    },
    {
      key: "auction-calendar",
      label: { zh: "Auction supply", en: "Auction supply" },
      detail: {
        zh: `未来 7 天供给为 ${metricValue(sections, "auction-risk", "Upcoming 7-day Supply")}；供给大本身只是背景，要看 demand metrics、dealer takedown 和 post-auction 表现是否同步走弱。`,
        en: `7-day supply is ${metricValue(sections, "auction-risk", "Upcoming 7-day Supply")}; size alone is context, so watch whether demand metrics, dealer takedown, and post-auction performance weaken too.`,
      },
      sourceKey: "auction-risk",
      tone: metricTone(metricValue(sections, "auction-risk", "Auction Risk")),
    },
    {
      key: "freshness",
      label: { zh: "Freshness trust", en: "Freshness trust" },
      detail: {
        zh: `数据模式为 ${data.summary.data_mode}；不同频率或 stale 输入只能作为背景，不能升级置信度。`,
        en: `Data mode is ${data.summary.data_mode}; mixed-frequency or stale inputs can provide context but should not upgrade confidence.`,
      },
      sourceKey: "data-freshness",
      tone: data.summary.data_mode === "live" ? "green" : "yellow",
    },
  ];

  return items;
}

export function buildCrossSignalChecks(data: DataPayload): CrossSignalCheck[] {
  const sections = data.sections;
  const fundingStress = metricValue(sections, "reference-rates", "Funding Rate Stress");
  const repoUsage = metricValue(sections, "repo-financing", "Usage Label");
  const dealerPressure = metricValue(sections, "dealer-inventory", "Pressure Label");
  const auctionRisk = metricValue(sections, "auction-risk", "Auction Risk");
  const failsDirection = metricValue(sections, "fails", "Fails Direction");
  const policyRisk = metricValue(sections, "policy-expectations", "Policy Expectations Risk");
  const macroSignal = metricValue(sections, "macro-pricing", "Macro Pricing Signal");
  const realYieldPressure = metricValue(sections, "macro-pricing", "Real Yield Pressure");
  const breakevenPressure = metricValue(sections, "macro-pricing", "Breakeven Pressure");
  const macroConditions = metricValue(sections, "macro-conditions", "Macro Conditions Signal");
  const financialConditions = metricValue(sections, "macro-conditions", "Financial Conditions Signal");
  const inflationSignal = metricValue(sections, "macro-conditions", "Inflation Signal");
  const wagePressure = metricValue(sections, "wage-pressure", "Wage Pressure Signal");

  return [
    {
      key: "funding-vs-dealer",
      label: { zh: "资金利差 vs 交易商库存", en: "Funding spreads vs dealer inventory" },
      detail: {
        zh: `Funding Rate Stress 为 ${fundingStress}，Dealer Inventory 为 ${dealerPressure}。若资金利差正常而库存极高，更像 warehousing / 供给吸收压力；若 funding、fails 同时恶化，才升级为资产负债表约束。`,
        en: `Funding Rate Stress is ${fundingStress}, while Dealer Inventory is ${dealerPressure}. Normal spreads with high inventory look more like warehousing/absorption; funding and fails need to worsen before calling balance-sheet constraint.`,
      },
      primaryKey: "reference-rates",
      secondaryKey: "dealer-inventory",
      tone: metricTone(dealerPressure),
    },
    {
      key: "auction-vs-dealer",
      label: { zh: "拍卖风险 vs dealer absorption", en: "Auction risk vs dealer absorption" },
      detail: {
        zh: `Auction Risk 为 ${auctionRisk}，Dealer Inventory 为 ${dealerPressure}。两者同时偏高时是供给吸收 watch；若缺少 WI/post-auction 或实时 dealer 确认，置信度仍应封顶。`,
        en: `Auction Risk is ${auctionRisk}, and Dealer Inventory is ${dealerPressure}. Both high create an absorption watch; without WI/post-auction or live dealer confirmation, confidence remains capped.`,
      },
      primaryKey: "auction-risk",
      secondaryKey: "dealer-inventory",
      tone: metricTone(auctionRisk) === "red" || metricTone(dealerPressure) === "red" ? "red" : metricTone(auctionRisk),
    },
    {
      key: "repo-vs-fails",
      label: { zh: "回购融资 vs settlement fails", en: "Repo financing vs settlement fails" },
      detail: {
        zh: `Repo financing 为 ${repoUsage}，Fails Direction 为 ${failsDirection}。融资高但 fails 稳定时，先看库存/成交；融资、fails 和 reference rates 同升才更像 plumbing stress。`,
        en: `Repo financing is ${repoUsage}, and Fails Direction is ${failsDirection}. High financing with stable fails points first to inventory/activity; financing, fails, and reference rates rising together look more like plumbing stress.`,
      },
      primaryKey: "repo-financing",
      secondaryKey: "fails",
      tone: metricTone(repoUsage),
    },
    {
      key: "policy-vs-supply",
      label: { zh: "政策路径 vs 久期供给", en: "Policy path vs duration supply" },
      detail: {
        zh: `Policy Expectations Risk 为 ${policyRisk}，Auction Risk 为 ${auctionRisk}。政策偏鹰和供给压力同时存在时，曲线长端更需要宏观定价模块确认。`,
        en: `Policy Expectations Risk is ${policyRisk}, while Auction Risk is ${auctionRisk}. If policy and supply pressure coexist, the long end needs confirmation from Macro Pricing.`,
      },
      primaryKey: "policy-expectations",
      secondaryKey: "auction-risk",
      tone: metricTone(policyRisk) === "yellow" && ["orange", "red"].includes(metricTone(auctionRisk)) ? "orange" : metricTone(policyRisk),
    },
    {
      key: "macro-vs-supply",
      label: { zh: "宏观定价 vs 供给压力", en: "Macro pricing vs supply pressure" },
      detail: {
        zh: `Macro Pricing Signal 为 ${macroSignal}，Auction Risk 为 ${auctionRisk}。若宏观定价和供给压力同向，长端压力更可信；若一个来自日频价格、一个来自事件/周度数据，要降低同日归因强度。`,
        en: `Macro Pricing Signal is ${macroSignal}, while Auction Risk is ${auctionRisk}. Alignment strengthens long-end pressure, but mixed daily/event/weekly horizons should lower same-day attribution strength.`,
      },
      primaryKey: "macro-pricing",
      secondaryKey: "auction-risk",
      tone: ["orange", "red"].includes(metricTone(auctionRisk)) && ["yellow", "orange", "red"].includes(metricTone(macroSignal)) ? "orange" : metricTone(macroSignal),
    },
    {
      key: "real-vs-inflation",
      label: { zh: "实际利率 vs 通胀补偿", en: "Real yield vs inflation compensation" },
      detail: {
        zh: `Real Yield Pressure 为 ${realYieldPressure}，Breakeven Pressure 为 ${breakevenPressure}。这只是 nominal-real-breakeven decomposition；通胀冲击还需要 CPI/PCE、commodities 或通胀预期确认。`,
        en: `Real Yield Pressure is ${realYieldPressure}, and Breakeven Pressure is ${breakevenPressure}. This is nominal-real-breakeven decomposition; an inflation-shock label still needs CPI/PCE, commodities, or inflation-expectations confirmation.`,
      },
      primaryKey: "macro-pricing",
      secondaryKey: "macro-pricing",
      tone: metricTone(realYieldPressure) === "green" ? metricTone(breakevenPressure) : metricTone(realYieldPressure),
    },
    {
      key: "pricing-vs-conditions",
      label: { zh: "市场定价 vs 宏观确认", en: "Market pricing vs macro confirmation" },
      detail: {
        zh: `Macro Pricing Signal 为 ${macroSignal}，Macro Conditions Signal 为 ${macroConditions}。两者同向时，收益率叙事更稳；分歧或频率不一致时要降低置信度。`,
        en: `Macro Pricing Signal is ${macroSignal}, while Macro Conditions Signal is ${macroConditions}. Alignment strengthens the yield story; divergence or frequency mismatch lowers confidence.`,
      },
      primaryKey: "macro-pricing",
      secondaryKey: "macro-conditions",
      tone: ["yellow", "orange", "red"].includes(metricTone(macroSignal)) && ["yellow", "orange", "red"].includes(metricTone(macroConditions)) ? "orange" : metricTone(macroSignal),
    },
    {
      key: "financial-conditions-check",
      label: { zh: "金融条件确认", en: "Financial conditions confirmation" },
      detail: {
        zh: `Financial Conditions Signal 为 ${financialConditions}。NFCI/ANFCI 是周度背景：金融条件偏松而收益率承压时，长端压力可能更来自供给/实际利率，而不是信用压力。`,
        en: `Financial Conditions Signal is ${financialConditions}. NFCI/ANFCI are weekly context: loose conditions with pressured yields point more to supply/real yields than credit stress.`,
      },
      primaryKey: "macro-conditions",
      secondaryKey: "macro-pricing",
      tone: metricTone(financialConditions),
    },
    {
      key: "wage-vs-inflation",
      label: { zh: "工资压力 vs 通胀黏性", en: "Wage pressure vs inflation stickiness" },
      detail: {
        zh: `Wage Pressure Signal 为 ${wagePressure}，Inflation Signal 为 ${inflationSignal}。两者同向时才增强 higher-for-longer；工资是月度平滑确认层，不解释日内收益率。`,
        en: `Wage Pressure Signal is ${wagePressure}, while Inflation Signal is ${inflationSignal}. Alignment supports higher-for-longer; wage data is monthly smoothed confirmation, not an intraday yield driver.`,
      },
      primaryKey: "wage-pressure",
      secondaryKey: "macro-conditions",
      tone: metricTone(wagePressure),
    },
  ];
}

export const RESEARCH_PROMPTS: ResearchPrompt[] = [
  {
    key: "why-10y-move",
    question: { zh: "为什么 10Y 可能继续承压？", en: "Why might the 10Y stay under pressure?" },
    detail: {
      zh: "先看 auction risk、dealer inventory 和 post-auction 线索，再用 real yield / breakeven 与宏观确认层区分供给压力还是宏观定价。",
      en: "Start with auction risk, dealer inventory, and post-auction clues, then use real yields / breakevens plus macro confirmation to separate supply pressure from macro repricing.",
    },
    hrefKey: "auction-risk",
  },
  {
    key: "funding-stress",
    question: { zh: "资金压力是否真的上升？", en: "Is funding stress actually rising?" },
    detail: {
      zh: "把 SOFR-EFFR、TGCR/BGCR、repo financing、ON RRP/SRF 和 fails 放在一起看；SOFR 水平本身不等于 funding stress。",
      en: "Read SOFR-EFFR, TGCR/BGCR, repo financing, ON RRP/SRF, and fails together; SOFR level alone is not funding stress.",
    },
    hrefKey: "reference-rates",
  },
  {
    key: "auction-absorption",
    question: { zh: "拍卖风险是否压住久期？", en: "Is auction risk weighing on duration?" },
    detail: {
      zh: "看未来供给、bid-to-cover、dealer takedown、WI/tail 或 post-auction 表现是否互相确认；供给大本身只是背景。",
      en: "Check upcoming supply, bid-to-cover, dealer takedown, WI/tail or post-auction behavior for confirmation; size alone is context.",
    },
    hrefKey: "auction-risk",
  },
  {
    key: "macro-confirmation",
    question: { zh: "宏观定价还缺哪块？", en: "What is still missing from Macro Pricing?" },
    detail: {
      zh: "曲线、实际利率、breakeven、GDPNow、金融条件、就业、通胀和工资压力已接入；下一步补 Cleveland inflation nowcast 和更多跨资产确认。",
      en: "Curve, real yields, breakevens, GDPNow, financial conditions, labor, inflation, and wage pressure are connected; Cleveland inflation nowcast and more cross-asset confirmation come next.",
    },
    hrefKey: "wage-pressure",
  },
];

export const UPCOMING_MACRO_EVENTS: LocalText[] = [
  { zh: "CPI / Core CPI 发布", en: "CPI / Core CPI release" },
  { zh: "PCE / Core PCE 发布", en: "PCE / Core PCE release" },
  { zh: "Payrolls / Unemployment", en: "Payrolls / unemployment" },
  { zh: "FOMC statement / SEP / minutes", en: "FOMC statement / SEP / minutes" },
  { zh: "Treasury auction / refunding", en: "Treasury auction / refunding" },
  { zh: "Fed H.4.1 balance sheet", en: "Fed H.4.1 balance sheet" },
  { zh: "NY Fed Primary Dealer weekly data", en: "NY Fed Primary Dealer weekly data" },
];

export function buildLatestUpdates(data: DataPayload): LocalText[] {
  const items = ["reference-rates", "macro-pricing", "macro-conditions", "wage-pressure", "auction-risk", "soma", "dealer-inventory", "policy-expectations"]
    .map((key) => data.sections[key])
    .filter(Boolean)
    .map((section) => {
      const date = section.data_date ?? "n/a";
      return {
        zh: `${section.title_zh ?? section.title}：${section.freshness_status ?? section.mode ?? "Unavailable"}，数据日期 ${date}`,
        en: `${section.title}: ${section.freshness_status ?? section.mode ?? "Unavailable"}, data date ${date}`,
      };
    });
  return items;
}
