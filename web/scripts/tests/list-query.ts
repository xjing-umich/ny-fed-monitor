/** 列表 URL/筛选/分页纯函数测试。用法: npm run test:list-query */
import {
  LIST_PAGE_SIZE,
  parseListParams,
  serializeListParams,
  clampPage,
  nextSortState,
} from "../../src/components/list/listQuery";
import {
  filterInvestors,
  filterStocks,
  sortByKey,
  visibleSlice,
} from "../../src/components/list/listRows";

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) {
    failed++;
    console.error(`FAIL ${label}: got ${a}, want ${e}`);
  } else console.log(`ok   ${label}`);
}

// defaults omit from URL
eq(
  serializeListParams(
    { q: "", sort: "value", dir: "desc", page: 1, vf: "all" },
    { defaultSort: "value", hasVf: true }
  ),
  "",
  "serialize omits defaults"
);

eq(
  parseListParams(new URLSearchParams("q=buff&sort=count&dir=asc&page=2&vf=buying"), {
    defaultSort: "value",
    allowedSorts: ["value", "count"],
    hasVf: true,
  }),
  { q: "buff", sort: "count", dir: "asc", page: 2, vf: "buying" },
  "parse happy path"
);

eq(
  parseListParams(new URLSearchParams("q=" + "x".repeat(80) + "&sort=nope&dir=up&page=0&vf=zzz"), {
    defaultSort: "holders",
    allowedSorts: ["holders", "value"],
    hasVf: false,
  }),
  { q: "x".repeat(64), sort: "holders", dir: "desc", page: 1, vf: "all" },
  "parse clamps q + invalid fallbacks"
);

eq(clampPage(9, 3), 3, "clamp page high");
eq(clampPage(2, 0), 1, "clamp empty → 1");

eq(nextSortState("value", "desc", "value"), { sort: "value", dir: "asc" }, "toggle same field");
eq(nextSortState("value", "asc", "count"), { sort: "count", dir: "desc" }, "new field → desc");

// Spec: changing sort resets page — callers always pass page: 1 with nextSortState result.
eq(
  serializeListParams(
    { q: "x", sort: "count", dir: "desc", page: 1, vf: "all" },
    { defaultSort: "value", hasVf: true }
  ),
  "q=x&sort=count",
  "sort change URL drops page=1"
);

const managers = [
  { slug: "berkshire-hathaway", person: "Warren Buffett", name: "Berkshire", totalValue: 100, holdingCount: 2 },
  { slug: "daily-journal", person: "Charlie Munger", name: "Daily Journal", totalValue: 50, holdingCount: 5 },
];
eq(filterInvestors(managers, "巴菲特").map((m) => m.slug), ["berkshire-hathaway"], "alias match");
eq(filterInvestors(managers, "munger").map((m) => m.slug), ["daily-journal"], "person substring");

const stocks = [
  { ticker: "AAPL", issuer: "Apple Inc", holderCount: 10, totalValue: 1 },
  { ticker: "MSFT", issuer: "Microsoft", holderCount: 8, totalValue: 9 },
];
eq(filterStocks(stocks, "msft").map((s) => s.ticker), ["MSFT"], "ticker search");
eq(
  sortByKey(stocks, "value", "desc", { value: (s) => s.totalValue, holders: (s) => s.holderCount }).map(
    (s) => s.ticker
  ),
  ["MSFT", "AAPL"],
  "sort value desc"
);

const nums = Array.from({ length: 60 }, (_, i) => i + 1);
eq(visibleSlice(nums, 2, "desktop"), nums.slice(25, 50), "desktop page 2");
eq(visibleSlice(nums, 2, "mobile"), nums.slice(0, 50), "mobile prefix page 2");
eq(LIST_PAGE_SIZE, 25, "page size lock");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall ok");
