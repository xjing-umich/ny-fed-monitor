import type { GrowthCapacityCheckResult, SkillInput } from "../schemas/researchSchemas";
import { coverageBlock, disclaimer, formatPct, hasAny, unavailable } from "./skillHelpers";

export function runGrowthCapacityCheck(input: SkillInput): GrowthCapacityCheckResult {
  const growth = input.growth_metrics;
  const hasGrowth = hasAny(growth);
  const hasForward =
    Boolean(growth?.guidance || growth?.analyst_estimates) ||
    growth?.backlog != null ||
    growth?.bookings != null ||
    growth?.rpo != null ||
    growth?.deferred_revenue != null;
  const cannotConclude: string[] = [];
  if (input.data_quality_gate.missing_data.includes("peer_comparison")) {
    cannotConclude.push("Cannot determine whether the company is better than peers because peer comparison is missing.");
  }
  if (input.data_quality_gate.missing_data.includes("external_evidence")) {
    cannotConclude.push(
      "Cannot assess regulatory, litigation, competition, management, customer churn, or geopolitical risks because external evidence is missing.",
    );
  }

  if (!hasGrowth) {
    return {
      data_coverage: coverageBlock(input, "Missing"),
      revenue_growth: unavailable("revenue growth metrics are missing."),
      growth_drivers: unavailable("growth driver data is missing."),
      profit_growth: unavailable("profit or EPS growth metrics are missing."),
      free_cash_flow_growth: unavailable("free cash flow growth is missing."),
      margin_operating_leverage: unavailable("margin change data is missing."),
      reinvestment_efficiency: unavailable("reinvestment and growth efficiency metrics are missing."),
      forward_growth_visibility: unavailable("guidance, estimates, backlog, bookings, RPO, and deferred revenue are missing."),
      growth_quality_assessment: unavailable("growth quality cannot be assessed without growth metrics."),
      growth_risk_flags: [],
      supported_conclusions: [],
      cannot_conclude: ["Historical growth quality", "Future growth visibility", "Growth drivers"],
      next_data_needed: ["growth metrics", "growth drivers", "profit growth", "FCF growth", "forward-looking indicators"],
      disclaimer: disclaimer(),
    };
  }

  return {
    data_coverage: coverageBlock(input, "Available"),
    revenue_growth:
      growth?.revenue_growth != null
        ? `Revenue growth from normalized metrics is ${formatPct(growth.revenue_growth)}.`
        : unavailable("revenue growth is missing."),
    growth_drivers:
      growth?.growth_drivers?.length
        ? `Provided growth drivers: ${growth.growth_drivers.join("; ")}.`
        : unavailable("specific growth driver data is missing."),
    profit_growth:
      growth?.profit_growth != null || growth?.eps_growth != null
        ? `Provided profit growth evidence: profit growth ${formatPct(growth.profit_growth) ?? "missing"}, EPS growth ${formatPct(growth.eps_growth) ?? "missing"}.`
        : unavailable("profit and EPS growth are missing."),
    free_cash_flow_growth:
      growth?.free_cash_flow_growth != null
        ? `Free cash flow growth from normalized metrics is ${formatPct(growth.free_cash_flow_growth)}.`
        : unavailable("free cash flow growth is missing."),
    margin_operating_leverage:
      growth?.margin_change != null
        ? `Margin change from normalized metrics is ${formatPct(growth.margin_change)}.`
        : unavailable("margin change data is missing."),
    reinvestment_efficiency:
      growth?.reinvestment_rate != null || growth?.growth_efficiency != null
        ? `Provided reinvestment evidence: reinvestment rate ${formatPct(growth.reinvestment_rate) ?? "missing"}, growth efficiency ${growth.growth_efficiency ?? "missing"}.`
        : unavailable("reinvestment and growth efficiency data are missing."),
    forward_growth_visibility: hasForward
      ? `Forward-looking visibility is limited to supplied indicators: guidance ${growth?.guidance ?? "missing"}, estimates ${growth?.analyst_estimates ?? "missing"}, backlog ${growth?.backlog ?? "missing"}, bookings ${growth?.bookings ?? "missing"}, RPO ${growth?.rpo ?? "missing"}, deferred revenue ${growth?.deferred_revenue ?? "missing"}.`
      : unavailable("guidance, estimates, backlog, bookings, RPO, and deferred revenue are missing; future growth cannot be assumed."),
    growth_quality_assessment: "Growth quality assessment is limited to the provided historical growth, margin, cash-flow, and reinvestment metrics.",
    growth_risk_flags: (input.risk_signals?.signals ?? [])
      .filter((signal) => signal.category === "Growth Risk")
      .map((signal) => `${signal.id}: ${signal.evidence}`),
    supported_conclusions: ["Historical growth can be discussed only where normalized growth metrics are present."],
    cannot_conclude: hasForward
      ? cannotConclude
      : ["Future growth trajectory or durability cannot be concluded without forward-looking indicators.", ...cannotConclude],
    next_data_needed: input.data_quality_gate.missing_data,
    disclaimer: disclaimer(),
  };
}
