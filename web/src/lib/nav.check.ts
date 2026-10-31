import assert from "node:assert/strict";
import { PRIMARY_NAV, isNavActive } from "./nav";
assert.deepEqual(
  PRIMARY_NAV.map((x) => x.key),
  ["investors", "stocks", "strike", "learn"],
);
assert.equal(PRIMARY_NAV[0].zh, "投资人");
assert.equal(
  isNavActive("investors", "/investors", "/investors/berkshire-hathaway"),
  true,
);
assert.equal(
  isNavActive(
    "strike",
    "/stocks/screener?view=strike_zone",
    "/stocks/screener",
  ),
  true,
);
assert.equal(
  isNavActive("stocks", "/stocks", "/stocks/screener/strike_zone-holders"),
  false,
);
console.log("shared nav: primary labels and parent-route selection OK");
