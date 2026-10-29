import assert from "node:assert/strict";
import { TOP_NAV, isNavActive } from "./nav";
import { localePath } from "./urls";

const activeKeys = (path: string) => TOP_NAV.filter((e) => isNavActive(e.key, e.href, path)).map((e) => e.key);
for (const path of ["/stocks/screener", "/stocks/screener?view=strike_zone", "/stocks/screener/strike_zone-holders"]) {
  assert.deepEqual(activeKeys(path), ["strike"], `${path}: 筛选器只高亮击球区`);
}
assert.deepEqual(activeKeys("/stocks/AAPL"), ["stocks"]);
assert.deepEqual(activeKeys("/stocks"), ["stocks"]);
assert.deepEqual(activeKeys("/stocks/screener-example"), ["stocks"], "路径前缀相似不属于筛选器");
assert.deepEqual(activeKeys("/investors/berkshire-hathaway"), ["investors"]);
assert.deepEqual(activeKeys("/"), ["home"]);
assert.deepEqual(activeKeys(""), ["home"]);
const strike = TOP_NAV.find((entry) => entry.key as string === "strike");
assert.ok(strike, "桌面与移动导航共同提供击球区入口");
assert.equal(localePath("zh", strike.href), "/zh/stocks/screener?view=strike_zone");
assert.equal(localePath("en", strike.href), "/stocks/screener?view=strike_zone");
console.log("nav.check OK");
