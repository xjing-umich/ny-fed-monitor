import { pickDebtTags } from "./normalize-facts";

function assert(c: boolean, m: string) {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
}
const eq = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

// 两个 noncurrent 重叠 tag 并存 → 只取合并租赁那个(原始去重不变)
const picked = pickDebtTags(
  new Set(["LongTermDebtAndFinanceLeaseObligationsNoncurrent", "LongTermDebtNoncurrent", "ShortTermBorrowings"])
);
assert(picked.includes("LongTermDebtAndFinanceLeaseObligationsNoncurrent"), "合并租赁tag优先");
assert(!picked.includes("LongTermDebtNoncurrent"), "纯LongTermDebt被去重");
assert(picked.includes("ShortTermBorrowings"), "短期借款独立组保留");

// 只报纯 tag → 退纯 tag
const picked2 = pickDebtTags(new Set(["LongTermDebtNoncurrent"]));
assert(picked2.includes("LongTermDebtNoncurrent"), "无合并tag时退纯tag");

// ── 覆盖缺口回归用例(真实公司 tag 形态,SEC companyfacts 实测)──

// HD/FDX/CMCSA: 有总额 tag → 直取,不叠加分项(否则双算)
assert(
  eq(pickDebtTags(new Set(["DebtAndCapitalLeaseObligations", "LongTermDebtAndCapitalLeaseObligations", "DebtCurrent", "ShortTermBorrowings"])),
     ["DebtAndCapitalLeaseObligations"]),
  "总额tag直取、分项不叠加(HD/FDX/CMCSA 曾算成$0)"
);

// KO: 仅 LTD&CapitalLease(老口径,非流动) → 取它(曾算成$0)
assert(
  eq(pickDebtTags(new Set(["LongTermDebtAndCapitalLeaseObligations"])),
     ["LongTermDebtAndCapitalLeaseObligations"]),
  "仅资本租赁老tag → 取它,不再归零(KO)"
);

// LUV: LTD&CapitalLease + 合并LongTermDebt(无分项非流动) → 非流动桶命中CapLease,不用合并(曾算成null)
assert(
  eq(pickDebtTags(new Set(["LongTermDebtAndCapitalLeaseObligations", "LongTermDebt"])),
     ["LongTermDebtAndCapitalLeaseObligations"]),
  "资本租赁非流动优先于合并LongTermDebt(LUV)"
);

// 纯合并LongTermDebt(无任何分项非流动)→ 兜底取合并(含流动),不再归零
assert(
  eq(pickDebtTags(new Set(["LongTermDebt", "ShortTermBorrowings"])),
     ["LongTermDebt", "ShortTermBorrowings"]),
  "无分项非流动时兜底用合并LongTermDebt+短期"
);

// ── 防 regression:既有正确的票不能被改坏 ──

// WMT: 分项齐全 + 合并LongTermDebt 并存 → 用分项三件,绝不带合并(否则双算)
assert(
  eq(pickDebtTags(new Set(["LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtCurrent", "ShortTermBorrowings"])),
     ["LongTermDebtNoncurrent", "LongTermDebtCurrent", "ShortTermBorrowings"]),
  "WMT: 有分项则弃合并LongTermDebt防双算(维持$51.5B)"
);

// CHTR: 分项非流动+流动,合并并存 → 分项,不带合并
assert(
  eq(pickDebtTags(new Set(["LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtCurrent"])),
     ["LongTermDebtNoncurrent", "LongTermDebtCurrent"]),
  "CHTR: 分项优先于合并(维持$94.4B)"
);

console.log("normalize-facts.check OK");
