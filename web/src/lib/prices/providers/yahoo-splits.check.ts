/**
 * yahoo-splits.check.ts — Yahoo chart events.splits 解析自检。
 * Run: cd web && npx tsx src/lib/prices/providers/yahoo-splits.check.ts
 */
import assert from "node:assert";
import { parseYahooSplits } from "./yahoo";

// KLAC 10-for-1,生效 2026-06-12(epoch 1781222400 = 2026-06-12T00:00:00Z)。
const withSplit = {
  chart: {
    result: [
      {
        meta: { currency: "USD" },
        events: {
          splits: {
            "1781222400": { date: 1781222400, numerator: 10, denominator: 1, splitRatio: "10:1" },
          },
        },
      },
    ],
  },
};

const parsed = parseYahooSplits(withSplit, "klac");
assert.strictEqual(parsed.length, 1, "应解析出 1 个拆股事件");
assert.strictEqual(parsed[0].ticker, "KLAC", "ticker 归一为大写");
assert.strictEqual(parsed[0].split_date, "2026-06-12", "split_date 由 epoch 转 ISO");
assert.strictEqual(parsed[0].ratio, 10, "ratio = numerator/denominator");

// 无 events → 空数组(不抛)。
assert.deepStrictEqual(parseYahooSplits({ chart: { result: [{ meta: {} }] } }, "AAPL"), []);
// 退化输入 → 空数组。
assert.deepStrictEqual(parseYahooSplits({}, "AAPL"), []);
assert.deepStrictEqual(parseYahooSplits(null, "AAPL"), []);

console.log("yahoo-splits.check.ts ✓");
