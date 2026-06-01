import { describe, it, expect } from "vitest";
import { changeFromWeeks, rollingZScore, historicalPercentile, freshnessStatus, finalizeLiveMode } from "@/lib/analyzers/common";
const series = Array.from({ length: 60 }, (_, i) => ({ date: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`, value: 100 + i }));
describe("common analyzers", () => {
  it("changeFromWeeks computes a number", () => { expect(typeof changeFromWeeks(series, 1).change).toBe("number"); });
  it("rollingZScore returns number for enough points", () => { expect(typeof rollingZScore(series, 52)).toBe("number"); });
  it("historicalPercentile returns Limited sample under 52 pts", () => { expect(historicalPercentile(series.slice(0, 10))).toBe("Limited sample"); });
  it("freshnessStatus: today is Fresh", () => { expect(freshnessStatus(new Date().toISOString().slice(0, 10))).toBe("Fresh"); });
  it("finalizeLiveMode downgrades empty section", () => { expect(finalizeLiveMode({ mode: "live", data_date: null, freshness_status: "Missing" } as any).mode).toBe("unavailable"); });
});
