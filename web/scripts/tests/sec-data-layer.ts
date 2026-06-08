import assert from "node:assert/strict";
import {
  buildResearchDataFromCompanyFacts,
  buildTickerMap,
  normalizeAnnualCompanyFacts,
  runResearchWorkflow,
  tickerToCik,
  type SecCompanyFactsJson,
  type SecCompanyTickersResponse,
} from "../../src/lib/research";

const tickerPayload: SecCompanyTickersResponse = {
  "0": { cik_str: 789019, ticker: "MSFT", title: "MICROSOFT CORP" },
};

const fetchMock = async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("company_tickers.json")) {
    return Response.json(tickerPayload);
  }
  throw new Error(`Unexpected fetch URL ${url}`);
};

function nearlyEqual(actual: number | undefined, expected: number, epsilon = 1e-9) {
  assert(actual != null, `Expected a number close to ${expected}, got ${actual}`);
  assert(Math.abs(actual - expected) < epsilon, `Expected ${actual} to be close to ${expected}`);
}

const companyFacts: SecCompanyFactsJson = {
  cik: 789019,
  entityName: "Microsoft Corporation",
  facts: {
    "us-gaap": {
      Revenues: {
        units: {
          USD: [
            { fy: 2021, fp: "FY", form: "10-K", filed: "2021-07-29", end: "2021-06-30", val: 1000 },
            { fy: 2022, fp: "FY", form: "10-K", filed: "2022-07-28", end: "2022-06-30", val: 1200 },
            { fy: 2023, fp: "FY", form: "10-K", filed: "2023-07-27", end: "2023-06-30", val: 1500 },
            { fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 1800 },
          ],
        },
      },
      GrossProfit: {
        units: { USD: [{ fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 1260 }] },
      },
      OperatingIncomeLoss: {
        units: { USD: [{ fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 800 }] },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            { fy: 2023, fp: "FY", form: "10-K", filed: "2023-07-27", end: "2023-06-30", val: 620 },
            { fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 700 },
          ],
        },
      },
      EarningsPerShareDiluted: {
        units: {
          "USD/shares": [
            { fy: 2023, fp: "FY", form: "10-K", filed: "2023-07-27", end: "2023-06-30", val: 8.2 },
            { fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 9.3 },
          ],
        },
      },
      NetCashProvidedByUsedInOperatingActivities: {
        units: {
          USD: [
            { fy: 2023, fp: "FY", form: "10-K", filed: "2023-07-27", end: "2023-06-30", val: 760 },
            { fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 900 },
          ],
        },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: {
          USD: [
            { fy: 2023, fp: "FY", form: "10-K", filed: "2023-07-27", end: "2023-06-30", val: 200 },
            { fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 250 },
          ],
        },
      },
      CashAndCashEquivalentsAtCarryingValue: {
        units: { USD: [{ fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 300 }] },
      },
      Assets: {
        units: { USD: [{ fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 3000 }] },
      },
      Liabilities: {
        units: { USD: [{ fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 1300 }] },
      },
      StockholdersEquity: {
        units: { USD: [{ fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 1700 }] },
      },
      DebtCurrent: {
        units: { USD: [{ fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 100 }] },
      },
      LongTermDebt: {
        units: { USD: [{ fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 400 }] },
      },
      WeightedAverageNumberOfDilutedSharesOutstanding: {
        units: {
          shares: [
            { fy: 2023, fp: "FY", form: "10-K", filed: "2023-07-27", end: "2023-06-30", val: 76 },
            { fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 74 },
          ],
        },
      },
      PaymentsForRepurchaseOfCommonStock: {
        units: { USD: [{ fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 80 }] },
      },
      PaymentsOfDividends: {
        units: { USD: [{ fy: 2024, fp: "FY", form: "10-K", filed: "2024-07-30", end: "2024-06-30", val: 60 }] },
      },
    },
  },
};

async function main() {
  assert.equal(buildTickerMap(tickerPayload).get("MSFT")?.cik_str, 789019);
  assert.equal(await tickerToCik("msft", fetchMock as typeof fetch), "0000789019");

  const normalized = normalizeAnnualCompanyFacts("MSFT", "0000789019", companyFacts);
  assert.equal(normalized.latest_fiscal_year, 2024);
  assert.equal(normalized.facts.revenue?.at(-1)?.source_tag, "Revenues");
  assert.equal(normalized.facts.free_cash_flow?.at(-1)?.value, 650);
  assert.equal(normalized.facts.total_debt?.at(-1)?.value, 500);
  assert.equal(normalized.facts.net_debt?.at(-1)?.value, 200);

  const secResearch = buildResearchDataFromCompanyFacts("MSFT", "0000789019", companyFacts);
  assert.equal(secResearch.normalizedData.period, "FY2024");
  assert.equal(secResearch.normalizedData.normalized_financials?.revenue, 1800);
  assert.equal(secResearch.normalizedData.normalized_financials?.debt, 500);
  assert.equal(secResearch.normalizedData.financial_metrics?.gross_margin, 0.7);
  assert.equal(secResearch.normalizedData.financial_metrics?.free_cash_flow, 650);
  assert.equal(secResearch.normalizedData.financial_metrics?.debt_to_equity, 500 / 1700);
  nearlyEqual(secResearch.normalizedData.growth_metrics?.revenue_growth, 0.2);
  nearlyEqual(secResearch.normalizedData.growth_metrics?.free_cash_flow_growth, 90 / 560);

  const workflow = runResearchWorkflow("MSFT", secResearch.normalizedData);
  assert.equal(workflow.ticker, "MSFT");
  assert.equal(workflow.data_quality_gate.available_data.normalized_financials, "Available");
  assert.equal(workflow.data_quality_gate.available_data.valuation_metrics, "Missing");
  assert(workflow.data_quality_gate.missing_data.includes("valuation_metrics"));
  assert(workflow.ui_ready.forbidden_claims.includes("target price"));
  assert(!JSON.stringify(workflow).includes("us-gaap"));
  assert(!JSON.stringify(workflow).includes("RevenueFromContractWithCustomerExcludingAssessedTax"));

  console.log("SEC data layer tests passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
