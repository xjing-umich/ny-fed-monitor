import type { PdfPage } from './document';
import { block, calendarDate, columns, contents, fail, moneyHeader, norm, periods, row } from './rows';

export function trmlfAuthorizedAt(pages: PdfPage[]): string {
  const basis = block(pages,/^1\. BASIS OF PREPARATION$/);
  const date = contents(basis).match(/authorized for issue by the Board of Directors on ([A-Za-z]+) (\d{1,2}), (20\d{2})\./);
  if (!date || !contents(basis).includes('IFRS Accounting Standards as issued by the IASB')
    || !contents(basis).includes('These consolidated financial statements are presented in Canadian dollars.')) fail('TRMLF IFRS/CAD or authorization unavailable');
  return calendarDate(date[1],date[2],date[3]);
}
export function parseTrmlfAnnual(pages: PdfPage[], reportEnd: string) {
  if (!/^20\d{2}-12-31$/.test(reportEnd)) fail('TRMLF annual period');
  const year=Number(reportEnd.slice(0,4)),cover=pages.find(p=>p.number===1)?.lines.map(norm).join(' ')??'';
  if (!cover.includes("MANAGEMENT'S DISCUSSION AND ANALYSIS AND CONSOLIDATED FINANCIAL STATEMENTS")
    || !cover.includes(`For the years ended December 31, ${year} and December 31, ${year-1}`)) fail('TRMLF full annual cover period');
  const corporate=pages.map(p=>p.lines.map(norm).join(' ')).filter(t=>t.includes('Corporate Information:'));
  if (corporate.length!==1 || !corporate[0].includes('Tourmaline Oil Corp. (the "Company")')
    || !corporate[0].includes('(tabular amounts in thousands of dollars, unless otherwise noted)')) fail('TRMLF issuer or original monetary units');
  const auditBlock=block(pages,/^INDEPENDENT AUDITOR'S REPORT$/);
  const audit=contents(auditBlock).includes('We have audited the consolidated financial statements of Tourmaline Oil Corp.');
  const authorized=trmlfAuthorizedAt(pages); if(!audit||authorized<reportEnd||authorized>new Date().toISOString().slice(0,10))fail('TRMLF audited annual availability');
  const out=periods(year),balance=block(pages,/^CONSOLIDATED STATEMENTS OF FINANCIAL POSITION$/,undefined,true),
    income=block(pages,/^CONSOLIDATED STATEMENTS OF INCOME AND COMPREHENSIVE INCOME$/,undefined,true),
    cash=block(pages,/^CONSOLIDATED STATEMENTS OF CASH FLOW$/,undefined,true),
    revenue=block(pages,/^13\. REVENUE$/,/^14\./),debt=block(pages,/^10\. DEBT$/,/^11\./),
    shares=block(pages,/^12\. SHARE CAPITAL$/,/^13\./),eps=block(pages,/^15\. EARNINGS PER SHARE$/,/^16\./),
    basicEps=block([eps.page],/^Basic earnings per share was calculated as follows:$/,/^Diluted earnings per share was calculated as follows:$/),
    dilutedEps=block([eps.page],/^Diluted earnings per share was calculated as follows:$/,/^16\./);
  for(const b of [balance,income,cash]){columns(b,year,2,b!==balance);moneyHeader(b,'TRMLF');}
  columns(revenue,year,2);moneyHeader(revenue,'TRMLF');
  columns(debt,year,2,false);moneyHeader(debt,'TRMLF');
  const shareText=contents(shares); if(!shareText.includes('(b) Common Shares Issued')||!shareText.includes('(000s) except share amounts Shares Amount Shares Amount'))fail('TRMLF share count/amount columns');
  columns(shares,year,2);columns(basicEps,year,2);columns(dilutedEps,year,2);
  for(const [metric,label]of[['total_assets','Total Assets'],['equity',"Total shareholders' equity"],['current_assets','Total current assets'],['current_liabilities','Total current liabilities']])row(out,metric,balance,label,2,'CAD');
  row(out,'current_debt',balance,'Current debt (note 10)',2,'CAD',1000,true);
  row(out,'long_term_debt',balance,'Long-term debt (note 10)',2,'CAD');
  row(out,'total_debt',debt,'Total debt',2,'CAD');
  row(out,'revenue',revenue,'Revenue from contracts with customers',2,'CAD');
  row(out,'profit_loss',income,'Net income and comprehensive income',2,'CAD');
  row(out,'operating_profit',income,'Income from operations',2,'CAD');
  row(out,'operating_cash_flow',cash,'Total cash flow from operating activities',2,'CAD');
  row(out,'purchases_of_ppe_cash_flow',cash,'Property, plant and equipment (note 7)',2,'CAD');
  row(out,'property_acquisitions_cash_flow',cash,'Property acquisitions (note 7)',2,'CAD');
  row(out,'corporate_acquisitions_cash_flow',cash,'Corporate acquisitions (note 7)',2,'CAD',1000,true);
  if(!contents(cash).includes('Cash is defined as cash and cash equivalents.'))fail('TRMLF cash definition missing');
  row(out,'cash_and_equivalents',cash,'Cash, end of period',2,'CAD',1000,true);
  row(out,'common_shares_issued',shares,'Balance, end of year',4,'shares',1,false,[0,2]);
  row(out,'basic_eps',basicEps,'Earnings per share - basic',2,'CAD/shares',1);
  row(out,'diluted_eps',dilutedEps,'Earnings per share - fully diluted',2,'CAD/shares',1);
  row(out,'weighted_average_shares',basicEps,'Weighted average number of common shares - basic',2,'shares',1);
  row(out,'diluted_weighted_average_shares',dilutedEps,'Weighted average number of common shares - diluted',2,'shares',1);
  for(const p of out)if(p.metrics.current_debt+p.metrics.long_term_debt!==p.metrics.total_debt)fail('TRMLF debt statement/note mismatch');
  return out;
}
