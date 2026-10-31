import assert from "node:assert/strict";
import { matchSearch, nextSearchOption } from "./match";
const items = [
  {
    label: "Warren Buffett",
    href: "/investors/berkshire-hathaway",
    keywords: "巴菲特",
  },
  ...Array.from({ length: 15 }, (_, i) => ({
    label: "Contains T " + i,
    href: "/stocks/TEST" + i,
  })),
  { label: "Ford", href: "/stocks/F", keywords: "F" },
  { label: "ON Semiconductor", href: "/stocks/ON", keywords: "ON" },
  { label: "AT&T T", href: "/stocks/T" },
  { label: "Amazon AMZN", href: "/stocks/AMZN" },
  { label: "Mastercard MA", href: "/stocks/MA" },
  { label: "Apple AAPL", href: "/stocks/AAPL", keywords: "苹果" },
];
for (const [q, href] of [
  ["t", "/stocks/T"],
  ["F", "/stocks/F"],
  ["ON", "/stocks/ON"],
  [" MA ", "/stocks/MA"],
  ["苹果", "/stocks/AAPL"],
  ["巴菲特", "/investors/berkshire-hathaway"],
])
  assert.equal(matchSearch(items, q)[0].href, href);
assert.equal(matchSearch(items, "t").length, 8);
assert.equal(matchSearch(items, "巴菲特")[0].kind, "investor");
assert.deepEqual(matchSearch(items, " "), []);
assert.deepEqual(matchSearch(items, "<unmatched>"), []);
assert.equal(nextSearchOption(-1, 1, 8), 0);
assert.equal(nextSearchOption(-1, -1, 8), 7);
assert.equal(nextSearchOption(7, 1, 8), 0);
assert.equal(nextSearchOption(0, -1, 8), 7);
assert.equal(nextSearchOption(1, 1, 0), -1);
console.log(
  "shared search: exact/alias/limit/empty and keyboard boundaries OK",
);
