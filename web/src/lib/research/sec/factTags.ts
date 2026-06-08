import type { SecNormalizedField } from "./types";

export const SEC_FACT_TAGS: Record<SecNormalizedField, string[]> = {
  revenue: ["Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerExcludingAssessedTax"],
  gross_profit: ["GrossProfit"],
  operating_income: ["OperatingIncomeLoss"],
  net_income: ["NetIncomeLoss", "ProfitLoss"],
  eps_basic: ["EarningsPerShareBasic"],
  eps_diluted: ["EarningsPerShareDiluted"],
  r_and_d: ["ResearchAndDevelopmentExpense"],
  sga: ["SellingGeneralAndAdministrativeExpense"],
  operating_cash_flow: ["NetCashProvidedByUsedInOperatingActivities"],
  capital_expenditure: ["PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditures"],
  free_cash_flow: [],
  buybacks: ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfCommonStock"],
  dividends: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  total_assets: ["Assets"],
  total_liabilities: ["Liabilities"],
  shareholders_equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  short_term_debt: ["ShortTermBorrowings", "DebtCurrent", "LongTermDebtCurrent"],
  long_term_debt: ["LongTermDebt", "LongTermDebtNoncurrent"],
  total_debt: [],
  net_debt: [],
  shares_basic: ["WeightedAverageNumberOfSharesOutstandingBasic"],
  shares_diluted: ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfDilutedSharesOutstandingBasic"],
  shares_outstanding: ["EntityCommonStockSharesOutstanding"],
};

export const SEC_NORMALIZED_FIELDS = Object.keys(SEC_FACT_TAGS) as SecNormalizedField[];
