import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/managers/db", () => ({ hasSupabaseEnv: vi.fn() }));
vi.mock("@/lib/managers/supabase", () => ({
  getManagerIndex: vi.fn(async () => ({ generatedAt: "db", managers: [] })),
  getManagerDetail: vi.fn(async () => ({ manager: { cik: "1", slug: "a", name: "A", person: "P" }, latest: { period: "p", filedAt: "f", accession: "x", totalValue: 0, holdings: [] }, changes: [] })),
}));

import { hasSupabaseEnv } from "@/lib/managers/db";
import * as source from "@/lib/managers/source";

describe("source routing", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses Supabase when env present", async () => {
    (hasSupabaseEnv as any).mockReturnValue(true);
    const idx = await source.getManagerIndex();
    expect(idx.generatedAt).toBe("db");
  });
  it("falls back to bundled JSON when env absent", async () => {
    (hasSupabaseEnv as any).mockReturnValue(false);
    const idx = await source.getManagerIndex();
    // JSON index has real managers (>0) and generatedAt !== "db"
    expect(idx.generatedAt).not.toBe("db");
    expect(idx.managers.length).toBeGreaterThan(0);
  });
});
