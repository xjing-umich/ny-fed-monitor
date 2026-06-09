export type FundamentalField =
  | "revenue"
  | "gross_profit"
  | "operating_income"
  | "net_income"
  | "eps_diluted"
  | "shares_diluted"
  | "operating_cash_flow"
  | "capex"
  | "cash_and_equivalents"
  | "total_assets"
  | "total_liabilities"
  | "total_debt"
  | "shareholders_equity";

export const FUNDAMENTAL_TAGS: Record<FundamentalField, string[]> = {
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
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
  cash_and_equivalents: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"
  ],
  total_assets: ["Assets"],
  total_liabilities: ["Liabilities"],
  total_debt: [
    "LongTermDebtAndFinanceLeaseObligationsCurrent",
    "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
    "ShortTermBorrowings",
    "LongTermDebtCurrent",
    "LongTermDebtNoncurrent"
  ],
  shareholders_equity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"
  ]
};

export const INSTANT_FIELDS = new Set<FundamentalField>([
  "cash_and_equivalents",
  "total_assets",
  "total_liabilities",
  "total_debt",
  "shareholders_equity"
]);
