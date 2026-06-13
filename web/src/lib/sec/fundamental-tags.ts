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
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet"
  ],
  gross_profit: ["GrossProfit"],
  operating_income: ["OperatingIncomeLoss"],
  net_income: ["NetIncomeLoss", "ProfitLoss"],
  eps_diluted: ["EarningsPerShareDiluted"],
  shares_diluted: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  operating_cash_flow: [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"
  ],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
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
    "LongTermDebtAndFinanceLeaseObligationsCurrent",
    "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
    "ShortTermBorrowings",
    "LongTermDebtCurrent",
    "LongTermDebtNoncurrent"
  ],
  ppe_net: ["PropertyPlantAndEquipmentNet"],
  goodwill: ["Goodwill"],
  intangibles: ["IntangibleAssetsNetExcludingGoodwill", "FiniteLivedIntangibleAssetsNet"],
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
  "shareholders_equity",
  "minority_interest",
  "preferred_equity",
  "shares_outstanding"
]);
