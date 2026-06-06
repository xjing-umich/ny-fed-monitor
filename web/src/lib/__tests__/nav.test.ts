import { describe, it, expect } from "vitest";
import { TOP_NAV, MACRO_GROUPS, indicatorToGroup, navLabel } from "@/lib/nav";

describe("nav config", () => {
  it("exposes exactly three top-level entries", () => {
    expect(TOP_NAV.map((e) => e.key)).toEqual(["home", "investors", "macro"]);
  });
  it("maps every legacy section into one macro group", () => {
    const all = MACRO_GROUPS.flatMap((g) => g.indicators);
    for (const key of ["dealer-inventory", "repo-financing", "reference-rates", "auction-risk", "soma", "policy-expectations"]) {
      expect(all).toContain(key);
    }
  });
  it("resolves an indicator to its group key", () => {
    expect(indicatorToGroup("repo-financing")).toBe("funding");
    expect(indicatorToGroup("auction-risk")).toBe("supply");
  });
  it("localizes labels", () => {
    expect(navLabel("zh", "investors")).toBe("超级投资者");
    expect(navLabel("en", "investors")).toBe("Superinvestors");
  });
});
