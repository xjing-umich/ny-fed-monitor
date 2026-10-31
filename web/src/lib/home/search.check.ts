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
const crowded = Array.from({ length: 12 }, (_, i) => ({
  label: "Contains T " + i,
  href: "/stocks/TEST" + i,
}));
assert.equal(
  landingMatches([...crowded, { label: "AT&T T", href: "/stocks/T" }], "t")[0]
    .href,
  "/stocks/T",
);
assert.equal(
  landingMatches(
    [
      { label: "Amazon AMZN", href: "/stocks/AMZN" },
      { label: "Mastercard MA", href: "/stocks/MA" },
    ],
    "ma",
  )[0].href,
  "/stocks/MA",
);
console.log("search.check OK");
