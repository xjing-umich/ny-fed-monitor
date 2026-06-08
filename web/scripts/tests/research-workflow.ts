import assert from "node:assert/strict";
import { researchScenarioMocks, runResearchWorkflow } from "../../src/lib/research";

function includesAll(actual: string[], expected: string[]) {
  for (const item of expected) {
    assert(actual.includes(item), `Expected "${item}" in ${JSON.stringify(actual)}`);
  }
}

const scenarioA = runResearchWorkflow("MSFT", researchScenarioMocks.scenarioAOnly13F);
assert.equal(scenarioA.data_quality_gate.analysis_level, "13f_only");
includesAll(scenarioA.data_quality_gate.allowed_claims, ["disclosed 13F holding interpretation"]);
includesAll(scenarioA.data_quality_gate.forbidden_claims, [
  "business quality",
  "profitability",
  "undervalued",
  "overvalued",
  "real-time holdings",
  "investor motivation",
]);
assert(scenarioA.skill_results.fundamental_quality_check.business_quality.startsWith("Cannot assess"));

const scenarioB = runResearchWorkflow("MSFT", researchScenarioMocks.scenarioBFinancialNoValuation);
assert.equal(scenarioB.data_quality_gate.analysis_level, "core_financial_supported");
includesAll(scenarioB.data_quality_gate.allowed_claims, [
  "fundamental quality discussion supported by normalized financials",
  "historical growth discussion supported by growth metrics",
]);
includesAll(scenarioB.data_quality_gate.forbidden_claims, [
  "cheap",
  "expensive",
  "undervalued",
  "overvalued",
  "fair value",
  "target price",
]);
assert(!scenarioB.skill_results.fundamental_quality_check.profitability.startsWith("Cannot assess"));

const scenarioC = runResearchWorkflow("MSFT", researchScenarioMocks.scenarioCFinancialValuationNoPeer);
assert.equal(scenarioC.data_quality_gate.analysis_level, "financial_and_valuation_supported_peer_external_missing");
assert.equal(scenarioC.data_quality_gate.available_data.valuation_metrics, "Available");
includesAll(scenarioC.data_quality_gate.allowed_claims, ["historical valuation metric discussion"]);
includesAll(scenarioC.data_quality_gate.forbidden_claims, ["best-in-class", "market leader", "better than peers", "industry leader"]);

const scenarioD = runResearchWorkflow("MSFT", researchScenarioMocks.scenarioDExternalRiskMissing);
assert.equal(scenarioD.data_quality_gate.analysis_level, "financial_and_valuation_supported_peer_external_missing");
assert.equal(scenarioD.data_quality_gate.available_data.external_evidence, "Missing");
includesAll(scenarioD.data_quality_gate.forbidden_claims, [
  "regulatory risk",
  "litigation risk",
  "competition risk",
  "customer churn",
  "management risk",
  "geopolitical risk",
]);
assert(scenarioD.skill_results.evidence_based_risk_check.external_evidence_risk.startsWith("Cannot assess"));
assert(
  scenarioD.skill_results.fundamental_quality_check.business_quality.includes(
    "Business quality cannot be fully assessed from returns alone.",
  ),
);
assert(
  scenarioD.skill_results.growth_capacity_check.growth_risk_flags[0].includes(
    "cannot assess future cloud demand without guidance, segment trend, or external evidence",
  ),
);
assert(
  scenarioD.skill_results.fundamental_quality_check.cannot_conclude.includes(
    "Cannot determine whether the company is better than peers because peer comparison is missing.",
  ),
);
assert(
  scenarioD.skill_results.growth_capacity_check.cannot_conclude.includes(
    "Cannot assess regulatory, litigation, competition, management, customer churn, or geopolitical risks because external evidence is missing.",
  ),
);

console.log("Research workflow scenarios passed.");
