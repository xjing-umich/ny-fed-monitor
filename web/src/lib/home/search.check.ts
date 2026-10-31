import assert from "node:assert/strict";
import { landingMatches } from "./search";
const items = [
  {
    label: "Warren Buffett",
    href: "/investors/berkshire-hathaway",
    keywords: "巴菲特",
  },
  { label: "Apple AAPL", href: "/stocks/AAPL", keywords: "苹果" },
  { label: "Berkshire BRK.B", href: "/stocks/BRK.B", keywords: "伯克希尔" },
];
assert.equal(landingMatches(items, "苹果")[0].href, "/stocks/AAPL");
assert.equal(landingMatches(items, " aapl ")[0].kind, "company");
assert.equal(landingMatches(items, "巴菲特")[0].kind, "investor");
assert.equal(landingMatches(items, "brk.b")[0].href, "/stocks/BRK.B");
assert.deepEqual(landingMatches(items, "unknown"), []);
assert.deepEqual(landingMatches(items, ""), []);
console.log("search.check OK");
