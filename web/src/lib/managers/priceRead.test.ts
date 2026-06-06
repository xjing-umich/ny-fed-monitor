import { describe, it, expect } from "vitest";
import { fmtPriceFact } from "./priceRead";

describe("fmtPriceFact", () => {
  it("有价 → 显示现价 + 货币", () => {
    expect(fmtPriceFact({ close: 307.36, date: "2026-06-05", currency: "USD" })).toBe("$307.36");
  });
  it("无价 → 占位符", () => {
    expect(fmtPriceFact(null)).toBe("—");
  });
});
