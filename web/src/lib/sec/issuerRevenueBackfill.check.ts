import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractIssuerRevenue, injectIssuerRevenue, findIssuerRevenueFilings, backfillConsolidatedRevenue } from './issuerRevenueBackfill';
import type { CompanyFacts } from './company-facts';
import type { NormalizedFiling } from './company-submissions';
const filing = (cik='0001562401', form='10-Q', report='2026-06-30'): NormalizedFiling => ({cik,ticker:'AMH',form,report_date:report,filing_date:'2026-07-31',accession_number:'0001562401-26-000047',primary_document:'amh-20260630.htm',filing_url:'https://www.sec.gov/Archives/edgar/data/1562401/000156240126000047/amh-20260630.htm',sec_index_url:'',fiscal_year:2026,fiscal_period:'Q2'});
const datedFiling = (form:string,report:string) => ({...filing(undefined,form,report), filing_date:new Date(Date.parse(report)+60*86400000).toISOString().slice(0,10)});
const facts = (cik=1562401): CompanyFacts => ({cik,entityName:'AMH',facts:{'us-gaap':{}}});
// Source shape from AMH 2026 Q2 original consolidated income statement, SEC verified 2026-10-31.
const xml = (cik='0001562401',concept='us-gaap:OperatingLeaseLeaseIncome',dim='',unit='iso4217:USD',value='470104000',start='2026-04-01',end='2026-06-30') => `<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2026" xmlns:apa="http://www.apachecorp.com/20260630"><xbrli:unit id="usd"><xbrli:measure>${unit}</xbrli:measure></xbrli:unit><xbrli:context id="c"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">${cik}</xbrli:identifier>${dim}</xbrli:entity><xbrli:period><xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period></xbrli:context><${concept} contextRef="c" unitRef="usd">${value}</${concept}></xbrli:xbrl>`;
const amh=extractIssuerRevenue(xml(),filing(),'0001562401');
assert.equal(amh.reason,undefined);assert.equal(amh.facts[0]?.value,470104000);
const f=facts();assert.equal(injectIssuerRevenue(f,filing(),amh.facts),1);
assert.equal(injectIssuerRevenue(f,filing(),amh.facts),0,'idempotent missing-only injection');
const injected=f.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD[0];
assert.equal(injected.source_tag,'us-gaap:OperatingLeaseLeaseIncome');assert.equal(injected.filed,'2026-07-31');
assert.equal((injected as unknown as {source_url:string}).source_url,filing().filing_url);
const prior=facts();prior.facts['us-gaap'].Revenues={units:{USD:[{start:'2026-04-01',end:'2026-06-30',val:0}]}};
assert.equal(injectIssuerRevenue(prior,filing(),amh.facts),0,'zero is existing data, never overwrite lower-priority concept');
assert.equal(extractIssuerRevenue(xml('999'),filing(),'0001562401').facts.length,0,'wrong context CIK rejected');
assert.equal(extractIssuerRevenue(xml(),filing(),'0001841666').facts.length,0,'wrong requested issuer rejected');
assert.equal(extractIssuerRevenue(xml(undefined,undefined,'<xbrli:segment><xbrldi:explicitMember dimension="x:A">x:B</xbrldi:explicitMember></xbrli:segment>'),filing(),'0001562401').facts.length,0,'dimensions rejected');
assert.equal(extractIssuerRevenue(xml(undefined,undefined,'','iso4217:EUR'),filing(),'0001562401').facts.length,0,'non USD rejected');
assert.equal(extractIssuerRevenue(xml(undefined,undefined,'','iso4217:USD','470104000','2025-04-01','2025-06-30'),filing(),'0001562401').facts.length,0,'later comparative not relabelled original');
assert.equal(extractIssuerRevenue(xml(undefined,undefined,'','iso4217:USD','470104000','2026-06-18'),filing(),'0001562401').facts.length,0,'short successor period rejected');
const apa=filing('0001841666');assert.equal(extractIssuerRevenue(xml('0001841666','apa:RevenuesAndOther','','iso4217:USD','2399000000'),apa,'0001841666').facts[0]?.value,2399000000);
assert.equal(extractIssuerRevenue(xml('0001841666','apa:OtherSalesRevenueLossesNet'),apa,'0001841666').facts.length,0,'APA partial sales never treated as consolidated revenue');
assert.equal(extractIssuerRevenue(xml('0000833079'),filing('0000833079'),'0000833079').reason,'unsupported_dimensional_consolidation');
assert.equal(findIssuerRevenueFilings(facts(),Array.from({length:30},(_,i)=>datedFiling('10-Q',`${2026-Math.floor(i/4)}-${['12','09','06','03'][i%4]}-30`)),'0001562401').length,12,'bounded quarter retention');
assert.equal(findIssuerRevenueFilings(facts(),Array.from({length:9},(_,i)=>datedFiling('10-K',`${2025-i}-12-31`)),'0001562401').length,6,'bounded annual retention');
backfillConsolidatedRevenue(facts(833079),[filing('0000833079')],'0000833079').then(r => {
  assert.equal(r.failed[0]?.includes('unsupported_dimensional_consolidation'),true,'MTH reports unsupported without network');
  console.log('issuerRevenueBackfill.check OK');
}).catch(e=>{console.error(e);process.exit(1);});
// SWX original 2026 Q2 consolidated income statement (CIK1692115):
// Regulated operations revenues is the sole current operating revenue line.
const swxFiling={...filing('0001692115'),ticker:'SWX',accession_number:'0001692115-26-000112',filing_url:'https://www.sec.gov/Archives/edgar/data/1692115/000169211526000112/swx-20260630.htm'};
const swxXml=xml('0001692115','us-gaap:RegulatedOperatingRevenue','','iso4217:USD','358154000');
assert.equal(extractIssuerRevenue(swxXml,swxFiling,'0001692115').facts[0]?.value,358154000,'SWX verified sole consolidated regulated revenue');
const withUnregulated=(value:string)=>swxXml.replace('</xbrli:xbrl>',`<us-gaap:UnregulatedOperatingRevenue contextRef="c" unitRef="usd">${value}</us-gaap:UnregulatedOperatingRevenue></xbrli:xbrl>`);
assert.equal(extractIssuerRevenue(withUnregulated('100'),swxFiling,'0001692115').reason,'regulated_revenue_is_partial','nonzero consolidated unregulated revenue prevents subset alias');
assert.equal(extractIssuerRevenue(withUnregulated('0'),swxFiling,'0001692115').facts.length,1,'explicit zero extra unregulated revenue does not make regulated line partial');
const swxExisting=facts(1692115);swxExisting.facts['us-gaap'].RegulatedAndUnregulatedOperatingRevenue={units:{USD:[{start:'2026-04-01',end:'2026-06-30',val:500000000}]}};
assert.equal(injectIssuerRevenue(swxExisting,swxFiling,extractIssuerRevenue(swxXml,swxFiling,'0001692115').facts),0,'existing broader SWX total always wins');
const swxPartial=facts(1692115);swxPartial.facts['us-gaap'].UnregulatedOperatingRevenue={units:{USD:[{start:'2026-04-01',end:'2026-06-30',val:10}]}};
assert.equal(injectIssuerRevenue(swxPartial,swxFiling,extractIssuerRevenue(swxXml,swxFiling,'0001692115').facts),0,'companyfacts unregulated income also prevents regulated-only injection');
const broaderSource=swxXml.replace('</xbrli:xbrl>','<us-gaap:RegulatedAndUnregulatedOperatingRevenue contextRef="c" unitRef="usd">500000000</us-gaap:RegulatedAndUnregulatedOperatingRevenue></xbrli:xbrl>');
assert.equal(extractIssuerRevenue(broaderSource,swxFiling,'0001692115').reason,'broader_revenue_total_available','raw source broader total cannot be displaced');

// Actual 2026 source excerpts retain every monetary Revenue context, including
// DNTH's rounded related-party notes and explicit zero royalty income.
const dnthXml=readFileSync(new URL('./fixtures/issuer-revenue-dnth-2026.xml',import.meta.url),'utf8');
const dnthHtml=readFileSync(new URL('./fixtures/issuer-revenue-dnth-statement-2026.html',import.meta.url),'utf8');
const dnthFiling:NormalizedFiling={...filing('0001690585'),ticker:'DNTH',filing_date:'2026-08-04',accession_number:'0001690585-26-000034',filing_url:'https://www.sec.gov/Archives/edgar/data/1690585/000169058526000034/dnth-20260630.htm'};
const dnth=extractIssuerRevenue(dnthXml,dnthFiling,'0001690585',dnthHtml);
assert.deepEqual(dnth.facts.map(r=>[r.start,r.end,r.value]),[['2026-04-01','2026-06-30',761000],['2026-01-01','2026-06-30',1224000]],'DNTH sole consolidated license revenue is available despite dimensioned standard tags');
assert.equal(injectIssuerRevenue(facts(1690585),dnthFiling,dnth.facts),2);
const dnthExisting=facts(1690585);dnthExisting.facts['us-gaap'].Revenues={units:{USD:[{start:'2026-04-01',end:'2026-06-30',val:0}]}};
assert.equal(injectIssuerRevenue(dnthExisting,dnthFiling,dnth.facts),1,'existing finite zero quarter wins; only absent YTD is injected');
assert.equal(extractIssuerRevenue(dnthXml.replaceAll('us-gaap:LicenseMember','us-gaap:ProductMember'),dnthFiling,'0001690585',dnthHtml).facts.length,0,'license-only exception never permits another product member');
assert.equal(extractIssuerRevenue(dnthXml.replaceAll('iso4217:USD','iso4217:EUR'),dnthFiling,'0001690585',dnthHtml).facts.length,0,'native EUR cannot leak into USD');
assert.equal(extractIssuerRevenue(dnthXml.replaceAll('0001690585','0000000999'),dnthFiling,'0001690585',dnthHtml).facts.length,0,'entity identity must match exact issuer');
const royalty=dnthXml.replace(/(<us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax\b[^>]*contextRef="C_6402ea27-b73c-46fa-8fb8-15360f7350d0"[^>]*>)0(<\/us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax>)/,(_whole,a,b)=>a+'100'+b);
assert.notEqual(royalty,dnthXml,'adversarial fixture changes actual zero royalty fact');
assert.equal(extractIssuerRevenue(royalty,dnthFiling,'0001690585',dnthHtml).facts.length,0,'another nonzero revenue product makes license line partial');
const additionalDimension=dnthXml.replaceAll('us-gaap:LicenseMember</xbrldi:explicitMember>','us-gaap:LicenseMember</xbrldi:explicitMember><xbrldi:explicitMember dimension="srt:StatementGeographicalAxis">us-gaap:UnitedStatesMember</xbrldi:explicitMember>');
assert.equal(extractIssuerRevenue(additionalDimension,dnthFiling,'0001690585',dnthHtml).facts.length,0,'multiple axes cannot qualify as the sole license total');
const unqualifiedTotal=dnthXml.replace('</xbrl>','<context id="new-unqualified"><entity><identifier scheme="http://www.sec.gov/CIK">0001690585</identifier></entity><period><startDate>2026-01-01</startDate><endDate>2026-06-30</endDate></period></context><us-gaap:Revenues contextRef="new-unqualified" unitRef="U_USD">1224000</us-gaap:Revenues></xbrl>');
assert.equal(extractIssuerRevenue(unqualifiedTotal,dnthFiling,'0001690585',dnthHtml).facts.length,0,'available unqualified source total must not be replaced by a dimensional line');
const ilptXml=readFileSync(new URL('./fixtures/issuer-revenue-ilpt-2026.xml',import.meta.url),'utf8');
const ilptFiling:NormalizedFiling={...filing('0001717307','10-Q','2026-09-30'),ticker:'ILPT',filing_date:'2026-10-28',accession_number:'0001717307-26-000052',filing_url:'https://www.sec.gov/Archives/edgar/data/1717307/000171730726000052/ilpt-20260930.htm'};
const ilpt=extractIssuerRevenue(ilptXml,ilptFiling,'0001717307');
assert.deepEqual(ilpt.facts.map(r=>[r.start,r.end,r.value]),[['2026-07-01','2026-09-30',116805000],['2026-01-01','2026-09-30',347347000]],'ILPT verified sole rental-income total uses issuer-only lease revenue mapping');
assert.equal(injectIssuerRevenue(facts(1717307),ilptFiling,ilpt.facts),2);

assert.equal(extractIssuerRevenue(dnthXml,dnthFiling,'0001690585').facts.length,0,'DNTH dimensions never qualify without current primary statement proof');
const extraPrimaryRevenue=dnthHtml.replace(/<\/table>/i,'<tr><td>Product revenue</td><td>100</td><td>0</td><td>100</td><td>0</td></tr></table>');
assert.equal(extractIssuerRevenue(dnthXml,dnthFiling,'0001690585',extraPrimaryRevenue).facts.length,0,'another actual primary revenue row prevents sole-license total mapping');
assert.equal(extractIssuerRevenue(dnthXml,dnthFiling,'0001690585',dnthHtml.replaceAll('2025','2024')).facts.length,0,'primary comparison years must match exact source context periods');
assert.equal(injectIssuerRevenue(facts(1690585),dnthFiling,dnth.facts.map(r=>({...r,statement_bound:false}))),0,'injection also requires statement-bound proof marker');
