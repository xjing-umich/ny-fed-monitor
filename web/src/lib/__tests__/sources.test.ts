import { describe, it, expect, vi } from "vitest";
import { fetchJsonWithRetry } from "@/lib/sources/nyfed";
describe("fetchJsonWithRetry", () => {
  it("retries on 503 then succeeds", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response("x", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const out = await fetchJsonWithRetry("http://x", { tag: "t", fetchImpl: f as any, backoffMs: 0 });
    expect(out).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("does not retry on 404", async () => {
    const f = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    await expect(fetchJsonWithRetry("http://x", { tag: "t", fetchImpl: f as any, backoffMs: 0 })).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });
});
