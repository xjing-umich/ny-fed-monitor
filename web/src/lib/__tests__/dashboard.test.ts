import { describe, it, expect } from "vitest";
import { badgeTone } from "@/lib/dashboard";

describe("badgeTone", () => {
  it("red for Extreme", () => expect(badgeTone("Extreme")).toBe("red"));
  it("orange for Elevated", () => expect(badgeTone("Elevated")).toBe("orange"));
  it("yellow for Watch", () => expect(badgeTone("Watch")).toBe("yellow"));
  it("gray for Unavailable", () => expect(badgeTone("Unavailable")).toBe("gray"));
  it("green for Normal", () => expect(badgeTone("Normal")).toBe("green"));
});
