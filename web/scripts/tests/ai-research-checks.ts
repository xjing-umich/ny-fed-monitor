import assert from "node:assert/strict";
import {
  evidence_based_risk_check_prompt,
  evaluateDataQualityGate,
  fundamental_quality_check_prompt,
  growth_capacity_check_prompt,
  type DataQualityGateInput,
} from "../../src/lib/ai/researchChecks";

function assertForbidden(gate: ReturnType<typeof evaluateDataQualityGate>, words: string[]) {
  for (const word of words) {
    assert(
      gate.forbidden_ai_claims.includes(word),
      `Expected forbidden_ai_claims to include "${word}", got ${gate.forbidden_ai_claims.join(", ")}`,
    );
  }
}

function assertAllowed(gate: ReturnType<typeof evaluateDataQualityGate>, claim: string) {
  assert(
    gate.allowed_ai_claims.includes(claim as never),
    `Expected allowed_ai_claims to include "${claim}", got ${gate.allowed_ai_claims.join(", ")}`,
  );
}

function assertPromptContainsContract(input: DataQualityGateInput) {
  const prompts = [
    fundamental_quality_check_prompt(input),
    growth_capacity_check_prompt(input),
    evidence_based_risk_check_prompt(input),
  ];
  for (const prompt of prompts) {
    assert.equal(typeof prompt.system, "string");
    assert.equal(typeof prompt.user, "string");
    assert(prompt.user.includes("data_quality_gate"), `${prompt.skill} prompt must include gate output`);
    assert(prompt.user.includes("forbidden"), `${prompt.skill} prompt must include forbidden claim rules`);
    assert(prompt.user.includes("Required JSON output format"), `${prompt.skill} prompt must include output format`);
    assert(prompt.user.includes("next data needed"), `${prompt.skill} prompt must include next data needed section`);
    assert(prompt.label.length > 0, `${prompt.skill} prompt must have a UI label`);
  }
}

const scenarioAOnly13F: DataQualityGateInput = {
  thirteen_f_summary: {
    disclosed_holders: 4,
    overlapping_investors: ["Manager A", "Manager B"],
    position_changes: [{ investor: "Manager A", action: "increased", period: "2026 Q1" }],
    coverage_note: "Lagged public 13F coverage only.",
  },
};

const scenarioBFinancialNoValuation: DataQualityGateInput = {
  normalized_financials: {
    revenue: 100,
    gross_profit: 60,
    operating_income: 25,
    net_income: 18,
    operating_cash_flow: 22,
    free_cash_flow: 17,
    cash: 40,
    debt: 10,
  },
  calculated_metrics: {
    gross_margin: 0.6,
    operating_margin: 0.25,
    fcf_margin: 0.17,
    roic: 0.18,
  },
  growth_metrics: {
    revenue_growth: 0.12,
    profit_growth: 0.1,
    free_cash_flow_growth: 0.08,
  },
};

const scenarioCFinancialValuationNoPeers: DataQualityGateInput = {
  ...scenarioBFinancialNoValuation,
  valuation_metrics: {
    pe: 22,
    price_to_sales: 7,
    historical_range_note: "Above its three-year median multiple.",
  },
  peer_comparison_available: false,
};

const scenarioDNoExternalRisk: DataQualityGateInput = {
  ...scenarioCFinancialValuationNoPeers,
  risk_signals: {
    growth_risk: ["Revenue growth decelerated in the normalized metric set."],
    external_evidence: [],
  },
};

const gateA = evaluateDataQualityGate(scenarioAOnly13F);
assert.equal(gateA.analysis_level, "13f_only");
assertAllowed(gateA, "13f_disclosed_holdings");
assertForbidden(gateA, ["business quality", "undervalued", "overvalued", "cheap", "expensive"]);
assertForbidden(gateA, ["real-time holdings", "investor motivation", "full portfolio exposure"]);
assert.equal(gateA.data_coverage.fundamentals, "Missing");
assertPromptContainsContract(scenarioAOnly13F);

const gateB = evaluateDataQualityGate(scenarioBFinancialNoValuation);
assert.equal(gateB.analysis_level, "financial_supported");
assertAllowed(gateB, "profitability");
assertAllowed(gateB, "free_cash_flow_quality");
assertAllowed(gateB, "balance_sheet_strength");
assertForbidden(gateB, ["cheap", "expensive", "undervalued", "overvalued", "target price"]);
assertPromptContainsContract(scenarioBFinancialNoValuation);

const gateC = evaluateDataQualityGate(scenarioCFinancialValuationNoPeers);
assert.equal(gateC.data_coverage.valuation, "Available");
assertAllowed(gateC, "historical_valuation");
assertForbidden(gateC, ["better than peers", "best-in-class", "industry leader", "outperforming competitors"]);
assertPromptContainsContract(scenarioCFinancialValuationNoPeers);

const gateD = evaluateDataQualityGate(scenarioDNoExternalRisk);
assert.equal(gateD.data_coverage.external_risk_evidence, "Missing");
assertForbidden(gateD, ["regulatory risk", "litigation risk", "competition risk", "customer churn", "management problems"]);
assertPromptContainsContract(scenarioDNoExternalRisk);

console.log("AI research check quality gate scenarios passed.");
