/**
 * company_fundamentals_periods 的显式读取列 —— egress 护栏。
 *
 * 这张表有 62 列，其中 `raw_facts`(XBRL 原始事实 jsonb) 独占单行约 61% 字节，
 * 而读取侧没有任何消费者：生产路径上唯一 patch 它的 applyClassSharesFallback
 * (sec/ingest.ts:194) 作用于 normalize 产出的内存对象，不是 DB 读回的行。
 * 用 `select("*")` 拉它，等于每次查询多付约 3 倍流量。
 *
 * 列表刻意是「除 raw_facts 外的全部列」，不做业务裁剪，保证与 select("*") 语义等价。
 * 新增表列时必须同步加进来，否则读取侧会静默缺字段 —— columns.check.ts 对着线上表校验。
 */

/**
 * 供 supabase-js 的 .select() 使用。必须写成**单个字符串字面量**：拼接(`"a" + "b"`)或
 * 数组 join 得到的都是 `string`，会让 supabase-js 的行类型推导退化成 GenericStringError。
 * 所以这里刻意不换行、不拆分；与下面 CFP_COLUMNS 的一致性由 columns.check.ts 断言。
 */
// prettier-ignore
export const CFP_SELECT = "id,ticker,cik,form,fiscal_year,fiscal_period,period_end,filing_date,accession_number,revenue,gross_profit,operating_income,net_income,eps_diluted,shares_diluted,operating_cash_flow,capex,free_cash_flow,cash_and_equivalents,total_assets,total_liabilities,total_debt,shareholders_equity,revenue_yoy,net_income_yoy,fcf_yoy,gross_margin,operating_margin,net_margin,fcf_margin,roe,debt_to_equity,net_debt,data_quality,missing_fields,created_at,updated_at,d_and_a,stock_based_comp,rd_expense,sga_expense,interest_expense,pretax_income,income_tax_expense,dividends_paid,share_repurchases,short_term_investments,current_assets,current_liabilities,ppe_net,goodwill,intangibles,minority_interest,preferred_equity,shares_outstanding,ebitda,working_capital,effective_tax_rate,is_derived,investment_fv_gain_loss,equity_securities_fv";

/** 同一份列清单的数组形态,供校验与遍历使用。 */
export const CFP_COLUMNS = [
  "id", "ticker", "cik", "form", "fiscal_year", "fiscal_period", "period_end", 
  "filing_date", "accession_number", "revenue", "gross_profit", "operating_income", 
  "net_income", "eps_diluted", "shares_diluted", "operating_cash_flow", "capex", 
  "free_cash_flow", "cash_and_equivalents", "total_assets", "total_liabilities", 
  "total_debt", "shareholders_equity", "revenue_yoy", "net_income_yoy", "fcf_yoy", 
  "gross_margin", "operating_margin", "net_margin", "fcf_margin", "roe", "debt_to_equity", 
  "net_debt", "data_quality", "missing_fields", "created_at", "updated_at", "d_and_a", 
  "stock_based_comp", "rd_expense", "sga_expense", "interest_expense", "pretax_income", 
  "income_tax_expense", "dividends_paid", "share_repurchases", "short_term_investments", 
  "current_assets", "current_liabilities", "ppe_net", "goodwill", "intangibles", 
  "minority_interest", "preferred_equity", "shares_outstanding", "ebitda", 
  "working_capital", "effective_tax_rate", "is_derived", "investment_fv_gain_loss", 
  "equity_securities_fv",
] as const;

/** 表里存在、但刻意不读的列。columns.check.ts 断言线上表列集恰好 = CFP_COLUMNS ∪ 这里。 */
export const CFP_OMITTED_COLUMNS = ["raw_facts"] as const;
