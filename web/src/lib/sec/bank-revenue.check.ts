/**
 * bank-revenue 校验。跑法: npx tsx src/lib/sec/bank-revenue.check.ts
 * 数值取自 SEC companyfacts(2026-10-19 拉取):BNY FY2025 NII 4,861M + 非利息收入 15,219M = Revenues 20,080M。
 */
import assert from "node:assert/strict";
import { synthesizeBankRevenue, BANK_TOTAL } from "./bank-revenue";
import type { CompanyFacts } from "./company-facts";
import { normalizeCompanyFacts } from "./normalize-facts";

const u = (start: string, end: string, val: number, accn: string, form = "10-Q", filed = "2026-08-01") => ({ start, end, val, accn, form, filed });
const mk = (gaap: Record<string, ReturnType<typeof u>[]>): CompanyFacts => ({
  cik: 1, entityName: "X",
  facts: { "us-gaap": Object.fromEntries(Object.entries(gaap).map(([k, v]) => [k, { units: { USD: v } }])) },
});

// 1) 同 accn 同期间两项都有 → 合成 = 和;YTD 期间一并合成
{
  const f = mk({
    InterestIncomeExpenseNet: [u("2025-01-01", "2025-12-31", 4_861e6, "K25", "10-K"), u("2026-04-01", "2026-06-30", 1_300e6, "Q226"), u("2026-01-01", "2026-06-30", 2_550e6, "Q226")],
    NoninterestIncome: [u("2025-01-01", "2025-12-31", 15_219e6, "K25", "10-K"), u("2026-04-01", "2026-06-30", 4_398e6, "Q226"), u("2026-01-01", "2026-06-30", 8_600e6, "Q226")],
  });
  assert.equal(synthesizeBankRevenue(f), 3);
  const tot = f.facts["us-gaap"][BANK_TOTAL].units.USD;
  assert.equal(tot.find((x) => x.end === "2025-12-31")!.val, 20_080e6, "BNY FY2025 = Revenues 20,080M");
  assert.equal(tot.find((x) => x.start === "2026-04-01")!.val, 5_698e6);
  assert.equal(tot.find((x) => x.start === "2026-01-01" && x.end === "2026-06-30")!.val, 11_150e6, "YTD 也合成");
  assert.equal(tot[0].accn, "K25"); assert.equal(tot[0].form, "10-K");
}
// 2) 不同 accn(只在比较期出现一项)→ 不配对
{
  const f = mk({ InterestIncomeExpenseNet: [u("2026-04-01", "2026-06-30", 1, "A")], NoninterestIncome: [u("2026-04-01", "2026-06-30", 2, "B")] });
  assert.equal(synthesizeBankRevenue(f), 0);
}
// 3) 已有真实 RevenuesNetOfInterestExpense 的期间不覆盖(JPM/GS 自标)
{
  const f = mk({
    InterestIncomeExpenseNet: [u("2026-04-01", "2026-06-30", 1, "A"), u("2026-01-01", "2026-03-31", 1, "B")],
    NoninterestIncome: [u("2026-04-01", "2026-06-30", 2, "A"), u("2026-01-01", "2026-03-31", 2, "B")],
    RevenuesNetOfInterestExpense: [u("2026-04-01", "2026-06-30", 99, "A")],
  });
  assert.equal(synthesizeBankRevenue(f), 1, "只补没有真实值的 Q1");
  assert.equal(f.facts["us-gaap"][BANK_TOTAL].units.USD.find((x) => x.start === "2026-04-01")!.val, 99);
}
// 4) 非银行(缺任一项)→ 不动
assert.equal(synthesizeBankRevenue(mk({ Revenues: [u("2026-04-01", "2026-06-30", 5, "A")] })), 0);
// 5) 端到端:COLB 型——FY 只把手续费子项标成 RevenueFromContract…,合成总营收须优先于它
{
  const f = mk({
    RevenueFromContractWithCustomerExcludingAssessedTax: [u("2025-01-01", "2025-12-31", 177e6, "K25", "10-K", "2026-02-20")],
    InterestIncomeExpenseNet: [u("2025-01-01", "2025-12-31", 2_000e6, "K25", "10-K", "2026-02-20")],
    NoninterestIncome: [u("2025-01-01", "2025-12-31", 301e6, "K25", "10-K", "2026-02-20")],
    NetIncomeLoss: [u("2025-01-01", "2025-12-31", 700e6, "K25", "10-K", "2026-02-20")],
  });
  synthesizeBankRevenue(f);
  const n = normalizeCompanyFacts("COLB", "1", f, [], "1231");
  assert.equal(n.annual[0].revenue, 2_301e6, "总营收 2,301M,不是手续费子项 177M");
}
console.log("bank-revenue.check OK");
