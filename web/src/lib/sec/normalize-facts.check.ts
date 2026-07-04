import { pickDebtTags } from "./normalize-facts";

function assert(c: boolean, m: string) {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
}

// 两个 noncurrent 重叠 tag 并存 → 只取合并租赁那个
const picked = pickDebtTags(
  new Set(["LongTermDebtAndFinanceLeaseObligationsNoncurrent", "LongTermDebtNoncurrent", "ShortTermBorrowings"])
);
assert(picked.includes("LongTermDebtAndFinanceLeaseObligationsNoncurrent"), "合并租赁tag优先");
assert(!picked.includes("LongTermDebtNoncurrent"), "纯LongTermDebt被去重");
assert(picked.includes("ShortTermBorrowings"), "短期借款独立组保留");

// 只报纯 tag → 退纯 tag
const picked2 = pickDebtTags(new Set(["LongTermDebtNoncurrent"]));
assert(picked2.includes("LongTermDebtNoncurrent"), "无合并tag时退纯tag");

console.log("normalize-facts.check OK");
