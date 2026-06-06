import { describe, it, expect } from "vitest";
import { investorPath, stockPath, macroPath, legacyRedirect } from "@/lib/urls";

describe("url builders", () => {
  it("builds localized entity paths", () => {
    expect(investorPath("zh", "warren-buffett-berkshire")).toBe("/zh/investors/warren-buffett-berkshire");
    expect(stockPath("en", "037833100")).toBe("/en/stocks/037833100");
    expect(macroPath("zh", "repo-financing")).toBe("/zh/macro/repo-financing");
  });
  it("maps legacy managers list to investors", () => {
    expect(legacyRedirect("/zh/managers")).toBe("/zh/investors");
  });
  it("maps legacy section to macro indicator", () => {
    expect(legacyRedirect("/en/repo-financing")).toBe("/en/macro/repo-financing");
  });
  it("returns null for non-legacy paths", () => {
    expect(legacyRedirect("/zh/investors")).toBeNull();
  });
});
