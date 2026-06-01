import { describe, it, expect } from "vitest";
import { trendDirection } from "@/lib/format";

describe("trendDirection", () => {
  it("up", () => expect(trendDirection("+$1.2 billion")).toBe("up"));
  it("down", () => expect(trendDirection("-$3.4 billion")).toBe("down"));
  it("null unsigned", () => expect(trendDirection("$284 billion")).toBeNull());
  it("null unavailable", () => expect(trendDirection("Unavailable")).toBeNull());
});
