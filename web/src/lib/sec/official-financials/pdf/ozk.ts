import type { PdfPage } from './document';
import { block, cells, columns, contents, fail, moneyHeader, norm, periods, row, save } from './rows';

export function ozkReportEnd(pages: PdfPage[]): string {
  const cover = pages.find(p => p.number === 1)?.lines.map(norm).join(' ') ?? '';
  if (!cover.includes('FEDERAL DEPOSIT INSURANCE CORPORATION') || !cover.includes('FORM 10-K') || !cover.includes('BANK OZK')
    || !cover.includes('FDIC Certificate No. 110') || !/Common Stock,.*?\bOZK Nasdaq/.test(cover)) fail('OZK corporate issuer/common share identity');
  const years = [...cover.matchAll(/For the fiscal year ended December 31, (20\d{2})/g)];
  if (years.length !== 1) fail('OZK annual cover period unavailable');
  return years[0][1] + '-12-31';
}
export function parseOzkAnnual(pages: PdfPage[], reportEnd: string) {
  if (!/^20\d{2}-12-31$/.test(reportEnd) || ozkReportEnd(pages) !== reportEnd) fail('OZK annual period mismatch');
  const audit = block(pages, /^Report of Independent Registered Public Accounting Firm$/);
  if (!contents(audit).includes('consolidated balance sheets of Bank OZK and its subsidiaries')
    || !contents(audit).includes('accounting principles generally accepted in the United States of America')) fail('OZK consolidated US-GAAP audit unavailable');
  const year = Number(reportEnd.slice(0,4)), out = periods(year);
  const balance = block(pages, /^CONSOLIDATED BALANCE SHEETS$/, undefined, true);
  const income = block(pages, /^CONSOLIDATED STATEMENTS OF INCOME$/, undefined, true);
  const cash = block(pages, /^CONSOLIDATED STATEMENTS OF CASH FLOWS$/, undefined, true);
  const eps = block(pages, /^21\s*\. Earnings Per Common Share/, /^22\./);
  columns(balance,year,2,false);
  for (const b of [income,cash,eps]) columns(b,year,3);
  for (const b of [balance,income,cash,eps]) moneyHeader(b,'OZK');
  for (const [metric,label] of [['total_assets','Total assets'],['total_liabilities','Total liabilities'],['equity','Total stockholders\' equity'],['equity_before_noncontrolling_interest','Total stockholders\' equity before noncontrolling interest'],['noncontrolling_interest_balance','Noncontrolling interest']])
    row(out,metric,balance,label,2,'USD',1000,metric==='noncontrolling_interest_balance');
  for (const [metric,label] of [['interest_income','Total interest income'],['interest_expense','Total interest expense'],['net_interest_income','Net interest income'],['noninterest_income','Total non-interest income'],['profit_loss','Net income'],['noncontrolling_interest_adjustment','Earnings attributable to noncontrolling interest'],['preferred_stock_dividends','Preferred stock dividends'],['net_income_available_to_common','Net income available to common stockholders']])
    row(out,metric,income,label,3,'USD');
  row(out,'basic_eps',income,'Basic earnings per common share',3,'USD/shares',1);
  row(out,'diluted_eps',income,'Diluted earnings per common share',3,'USD/shares',1);
  row(out,'operating_cash_flow',cash,'Net cash provided by operating activities',3,'USD');
  row(out,'purchases_of_ppe_cash_flow',cash,'Purchases of premises and equipment',3,'USD');
  row(out,'cash_and_equivalents',cash,'Cash and cash equivalents - end of period',3,'USD');
  row(out,'weighted_average_shares',eps,'Denominator for basic EPS - weighted-average common shares',3,'shares');
  row(out,'diluted_weighted_average_shares',eps,'Denominator for diluted EPS - weighted-average common shares and',3,'shares',1000,false,[0,1],'assumed conversions');
  const shares = balance.page.lines.flatMap((line, i) => norm(line).startsWith('Common stock,') ? [{ line: i, text: balance.page.lines.slice(i,i+3).map(norm).join(' ') }] : []);
  const match = shares.length === 1 && shares[0].text.match(new RegExp('^Common stock, \\$0\\.01 par value; [\\d,]+ shares authorized; ([\\d,]+) and ([\\d,]+) shares issued and outstanding at December 31, '+year+' and '+(year-1)+', respectively [\\d,]+ [\\d,]+$'));
  if (!match) fail('OZK actual common-share narrative unavailable');
  save(out,'common_shares_issued_and_outstanding',balance,shares[0].line,shares[0].text,cells(match[1]+' '+match[2],2),'shares',1,[0,1],shares[0].line+2);
  // The EPS denominator is rounded thousand shares; retain the report's precision evidence.
  const precision = pages.some(p => p.lines.some(l => /Weighted-average diluted shares outstanding \(thousands\)/.test(norm(l))));
  if (!precision) fail('OZK weighted share scale not corroborated');
  for (const p of out) {
    if (p.metrics.interest_income-p.metrics.interest_expense!==p.metrics.net_interest_income
      || p.metrics.profit_loss+p.metrics.noncontrolling_interest_adjustment-p.metrics.preferred_stock_dividends!==p.metrics.net_income_available_to_common
      || p.metrics.total_liabilities+p.metrics.equity!==p.metrics.total_assets) fail('OZK primary statements fail reconciliation');
  }
  return out;
}
