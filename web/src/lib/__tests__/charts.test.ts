import { describe, it, expect } from "vitest";
import { buildChartSpec, hasChartData } from "@/lib/charts";
import type { Section } from "@/lib/types";

const referenceRatesSection: Section = {
  title: "Reference Rates",
  mode: "live",
  normalized_data: [
    { date: "2024-01-02", rate_name: "SOFR", rate_percent: 5.30 },
    { date: "2024-01-03", rate_name: "SOFR", rate_percent: 5.31 },
    { date: "2024-01-04", rate_name: "SOFR", rate_percent: 5.29 },
    { date: "2024-01-02", rate_name: "EFFR", rate_percent: 5.33 },
    { date: "2024-01-03", rate_name: "EFFR", rate_percent: 5.33 },
    { date: "2024-01-04", rate_name: "EFFR", rate_percent: 5.33 },
  ],
};

describe("buildChartSpec - reference-rates", () => {
  it("pivots into series containing SOFR and EFFR", () => {
    const spec = buildChartSpec("reference-rates", referenceRatesSection, "en");
    expect(spec).not.toBeNull();
    const keys = spec!.series.map((s) => s.key);
    expect(keys).toContain("SOFR");
    expect(keys).toContain("EFFR");
  });

  it("data rows have date + rate keys", () => {
    const spec = buildChartSpec("reference-rates", referenceRatesSection, "en");
    expect(spec!.data.length).toBeGreaterThan(0);
    expect(spec!.data[0]).toHaveProperty("date");
  });
});

describe("buildChartSpec - empty normalized_data", () => {
  it("returns null when normalized_data is empty", () => {
    const emptySection: Section = { title: "Reference Rates", normalized_data: [] };
    expect(buildChartSpec("reference-rates", emptySection, "en")).toBeNull();
  });

  it("returns null for null section", () => {
    expect(buildChartSpec("reference-rates", null as unknown as Section, "en")).toBeNull();
  });
});

describe("hasChartData", () => {
  it("returns true for valid section", () => {
    expect(hasChartData("reference-rates", referenceRatesSection)).toBe(true);
  });

  it("returns false for empty section", () => {
    const emptySection: Section = { title: "Reference Rates", normalized_data: [] };
    expect(hasChartData("reference-rates", emptySection)).toBe(false);
  });
});
