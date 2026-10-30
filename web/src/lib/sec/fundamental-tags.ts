export type FundamentalField =
  // flow (income statement / cash flow — identified by a start→end duration)
  | "revenue"
  | "gross_profit"
  | "operating_income"
  | "net_income"
  | "eps_diluted"
  | "shares_diluted"
  | "operating_cash_flow"
  | "capex"
  | "d_and_a"
  | "stock_based_comp"
  | "rd_expense"
  | "sga_expense"
  | "interest_expense"
  | "pretax_income"
  | "income_tax_expense"
  | "dividends_paid"
  | "share_repurchases"
  | "investment_fv_gain_loss"
  // instant (balance sheet — a point-in-time value, no duration)
  | "cash_and_equivalents"
  | "short_term_investments"
  | "current_assets"
  | "current_liabilities"
  | "total_assets"
  | "total_liabilities"
  | "total_debt"
  | "ppe_net"
  | "goodwill"
  | "intangibles"
  | "equity_securities_fv"
  | "shareholders_equity"
  | "minority_interest"
  | "preferred_equity"
  | "shares_outstanding";

// Priority-ordered XBRL concept fallbacks per normalized field. SEC filers tag
// the same economic line under different us-gaap concepts (and change over
// time), so each field tries several concepts; the first that yields a value
// for a period wins. Banks/insurers use a different concept universe entirely —
// those tickers are expected to come back sparse (quality_status reflects it).
export const FUNDAMENTAL_TAGS: Record<FundamentalField, string[]> = {
  // --- flow ---
  revenue: [
    // 银行/券商总营收(净利息收入 + 非利息收入)。排第一:银行常把手续费子项标成
    // RevenueFromContract…(COLB FY2025 $1.77 亿 vs 真实 $23 亿),不能让子项抢先。
    // 自标者(JPM/GS/MS/WFC)直取;其余银行由 bank-revenue.ts 合成注入。非金融公司不用此概念。
    "RevenuesNetOfInterestExpense",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    // 公用事业(DTE/SWX 只标这一个)
    "RegulatedAndUnregulatedOperatingRevenue",
    // BDC(OBDC/OCSL/RWAY):总投资收益即营收
    "GrossInvestmentIncomeOperating"
  ],
  gross_profit: ["GrossProfit"],
  operating_income: ["OperatingIncomeLoss"],
  // 末位兜底:部分公司季报只标归属普通股净利(BKNG 2025–2026 全部 10-Q;37/53 家受影响金融股同样)。
  // 与 NetIncomeLoss 只差优先股股息,仅在前两个概念都没有时才用。
  net_income: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
  eps_diluted: ["EarningsPerShareDiluted"],
  shares_diluted: [
    "WeightedAverageNumberOfDilutedSharesOutstanding",
    "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
    "WeightedAverageNumberOfSharesOutstandingBasic",
  ],
  operating_cash_flow: [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"
  ],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets", "PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets"],
  d_and_a: [
    "DepreciationDepletionAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortization",
    "Depreciation"
  ],
  stock_based_comp: ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
  rd_expense: ["ResearchAndDevelopmentExpense"],
  sga_expense: ["SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense"],
  interest_expense: ["InterestExpense", "InterestExpenseNonoperating", "InterestAndDebtExpense"],
  pretax_income: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"
  ],
  income_tax_expense: ["IncomeTaxExpenseBenefit"],
  dividends_paid: ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"],
  share_repurchases: ["PaymentsForRepurchaseOfCommonStock"],
  // 投资性重估损益(税前):GainLossOnInvestments 含衍生品口径更完整(BRK 实测两 tag 几乎同值,
  // FY2023 74.9B vs 71.8B),优先;EquitySecuritiesFvNiGainLoss(ASU 2016-01 权益证券 FV-NI)兜底。
  investment_fv_gain_loss: ["GainLossOnInvestments", "EquitySecuritiesFvNiGainLoss"],
  // --- instant ---
  cash_and_equivalents: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"
  ],
  short_term_investments: ["ShortTermInvestments", "AvailableForSaleSecuritiesCurrent", "MarketableSecuritiesCurrent"],
  current_assets: ["AssetsCurrent"],
  current_liabilities: ["LiabilitiesCurrent"],
  total_assets: ["Assets"],
  total_liabilities: ["Liabilities"],
  total_debt: [
    // 总额 tag(含全部,优先直取)
    "DebtAndCapitalLeaseObligations",
    // 非流动(越靠前越含租赁)
    "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
    "LongTermDebtAndCapitalLeaseObligations",
    "LongTermDebtNoncurrent",
    // 流动
    "LongTermDebtAndFinanceLeaseObligationsCurrent",
    "LongTermDebtCurrent",
    "DebtCurrent",
    // 合并 LongTermDebt(含流动+非流动)= 无分项非流动 tag 时的兜底
    "LongTermDebt",
    // 短期借款(独立)
    "ShortTermBorrowings"
  ],
  ppe_net: ["PropertyPlantAndEquipmentNet"],
  goodwill: ["Goodwill"],
  intangibles: ["IntangibleAssetsNetExcludingGoodwill", "FiniteLivedIntangibleAssetsNet"],
  // 权益证券公允价值(BRK FY2025 实测 $297.8B,标准无维度 tag)。件④:marks 生效时同步从
  // EPV/AV 资产分母剔除 —— 组合的重置成本就是它的市价,持有它不构成竞争壁垒。
  equity_securities_fv: ["EquitySecuritiesFvNi"],
  shareholders_equity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"
  ],
  minority_interest: ["MinorityInterest"],
  preferred_equity: ["PreferredStockValue", "PreferredStockValueOutstanding"],
  shares_outstanding: ["CommonStockSharesOutstanding"]
};

// Balance-sheet (point-in-time) fields. Everything else is a flow measured over
// a start→end duration. This split drives how a fact's reporting period is
// identified: instant facts key on `end` only; flow facts must also match a
// duration window (≈90 days for a quarter, ≈365 for a year).
export const INSTANT_FIELDS = new Set<FundamentalField>([
  "cash_and_equivalents",
  "short_term_investments",
  "current_assets",
  "current_liabilities",
  "total_assets",
  "total_liabilities",
  "total_debt",
  "ppe_net",
  "goodwill",
  "intangibles",
  "equity_securities_fv",
  "shareholders_equity",
  "minority_interest",
  "preferred_equity",
  "shares_outstanding"
]);
