import { buildTtm } from "./ttmBasis";
import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error(`FAIL: ${msg}`); failed++; } else console.log(`ok: ${msg}`);
};

// 最小合法行工厂:只填本模块消费的字段,其余 null。
const base: FundamentalPeriod = {
  ticker: "T", cik: "0", form: "10-K", fiscal_year: 2025, fiscal_period: "FY",
  period_end: "2025-12-31", filing_date: "2026-02-01", accession_number: null,
  revenue: 400, gross_profit: 200, operating_income: 100, net_income: 80, eps_diluted: null,
  shares_diluted: 10, operating_cash_flow: 120, capex: -20, free_cash_flow: null,
  d_and_a: 15, stock_based_comp: 5, rd_expense: 30, sga_expense: 50, interest_expense: null,
  pretax_income: 100, income_tax_expense: 20, dividends_paid: 8, share_repurchases: 12,
  cash_and_equivalents: 50, short_term_investments: null, current_assets: 90, current_liabilities: 60,
  total_assets: 500, total_liabilities: 300, total_debt: 100, ppe_net: 80,
  goodwill: 40, intangibles: 10, shareholders_equity: 200, minority_interest: null,
  preferred_equity: null, shares_outstanding: null, ebitda: null, working_capital: 30,
  effective_tax_rate: 0.2, revenue_yoy: null, net_income_yoy: null, fcf_yoy: null,
  gross_margin: null, operating_margin: 0.25, net_margin: null, fcf_margin: null, roe: null,
  debt_to_equity: null, net_debt: 50, is_derived: false, data_quality: "high",
  missing_fields: {}, raw_facts: {},
} as unknown as FundamentalPeriod;
const q = (end: string, over: Partial<FundamentalPeriod>): FundamentalPeriod =>
  ({ ...base, form: "10-Q", fiscal_period: "Q?", period_end: end, ...over }) as FundamentalPeriod;

// 正例:FY2025(400) + Q1'26(110) − Q1'25(90) = 420
const q1n = q("2026-03-31", { revenue: 110, net_income: 30, operating_income: 28, gross_profit: 55,
  pretax_income: 30, income_tax_expense: 6, d_and_a: 4, capex: -6, rd_expense: 8, sga_expense: 12,
  stock_based_comp: 2, operating_cash_flow: 35, share_repurchases: 3, dividends_paid: 2,
  shareholders_equity: 210, shares_diluted: 9.8 });
const q1o = q("2025-03-31", { revenue: 90, net_income: 20, operating_income: 22, gross_profit: 45,
  pretax_income: 25, income_tax_expense: 5, d_and_a: 3, capex: -4, rd_expense: 7, sga_expense: 11,
  stock_based_comp: 1, operating_cash_flow: 28, share_repurchases: 2, dividends_paid: 2 });
{
  const r = buildTtm([base], [q1n, q1o]);
  assert(r != null, "正例可合成");
  assert(r!.row.revenue === 420, `TTM revenue 420,得 ${r!.row.revenue}`);
  assert(r!.row.net_income === 90, `TTM NI 90,得 ${r!.row.net_income}`);
  assert(r!.row.shareholders_equity === 210, "存量取最新10-Q");
  assert(r!.row.shares_diluted === 9.8, "shares 取最新10-Q");
  assert(r!.period_end === "2026-03-31" && r!.row.fiscal_year === 2026, "期末/标签");
  assert(r!.degraded_fields.length === 0, "无 degraded");
}
// 闸1:无新季度
assert(buildTtm([base], [q1o]) === null, "闸1 无新季度→null");
// 闸2:缺去年同期配对(把旧季度期末挪出±45天窗)
assert(buildTtm([base], [q1n, q("2025-01-15", { revenue: 90 })]) === null, "闸2 缺配对→null");
// 闸2':配对不吃派生行
assert(buildTtm([base], [q1n, { ...q1o, is_derived: true } as FundamentalPeriod]) === null, "派生行不算配对→null");
// 闸4:新季度 revenue null → 核心 degraded → null
assert(buildTtm([base], [{ ...q1n, revenue: null } as FundamentalPeriod, q1o]) === null, "闸4 核心流量缺→null");
// 闸3:TTM revenue ≤ 0(400 + 10 − 500 = −90)
assert(buildTtm([base], [{ ...q1n, revenue: 10 } as FundamentalPeriod, { ...q1o, revenue: 500 } as FundamentalPeriod]) === null, "闸3 TTM营收≤0→null");
// 闸5:不变量 opInc > revenue(TTM opInc = 390+120−5 = 505 > TTM rev = 400+101−95 = 406)
assert(buildTtm(
  [{ ...base, operating_income: 390 } as FundamentalPeriod],
  [{ ...q1n, operating_income: 120, revenue: 101 } as FundamentalPeriod,
   { ...q1o, operating_income: 5, revenue: 95 } as FundamentalPeriod],
) === null, "闸5 opInc>rev 不变量→null");
// 单项 degraded:rd_expense 缺 → 回退 FY 值且记录
{
  const r = buildTtm([base], [{ ...q1n, rd_expense: null } as FundamentalPeriod, q1o]);
  assert(r != null && r.row.rd_expense === base.rd_expense && r.degraded_fields.includes("rd_expense"), "单项degraded回退FY并记录");
}
// 去重取 filing_date 最新一条(非入参顺序最后者):同一 period_end 两条重报,
// filing_date 更新、revenue 不同的正确候选排在数组前面,filing_date 更旧的错误候选故意排在后面。
{
  const dupCorrect = { ...q1n, filing_date: "2026-05-15", revenue: 111 } as FundamentalPeriod; // filing 更新→应选中
  const dupStale = { ...q1n, filing_date: "2026-04-01", revenue: 999 } as FundamentalPeriod;   // filing 更旧、但排在数组后面
  const r = buildTtm([base], [dupCorrect, dupStale, q1o]);
  assert(r != null && r.row.revenue === 421, `重报去重取 filing_date 最新一条,TTM revenue 421,得 ${r?.row.revenue}`);
}
// 闸1':新季度 >3 个 = 年报缺报,整体放弃(即便每个都有合法配对)
{
  const news = ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"].map((end) => q(end, {}));
  const matches = ["2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30"].map((end) => q(end, {}));
  assert(buildTtm([base], [...news, ...matches]) === null, "闸1' 新季度>3→null");
}
console.log(failed ? `\n${failed} failure(s)` : "\nttmBasis.check ALL GREEN");
if (failed) process.exit(1);
