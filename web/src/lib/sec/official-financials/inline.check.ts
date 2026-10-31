import assert from "node:assert/strict";
import fs from "node:fs";
import { parseOfficialInlineAnnual } from "./inline";
const expected=JSON.parse(fs.readFileSync(new URL('./fixtures/expected.json',import.meta.url),'utf8'));
for(const [ticker,end,lei,currency] of [["HMRZF","2025-11-30","529900O5RR7R39FRDM42","SEK"],["HKHHF","2025-12-31","724500M1WJLFM9TYBS04","EUR"]]) {
 const xml=fs.readFileSync(new URL(`./fixtures/${ticker.toLowerCase()}-annual.xhtml`,import.meta.url),'utf8');
 const periods=parseOfficialInlineAnnual(ticker,xml,end);
 assert.equal(periods.length,2);assert.equal(periods[0].is_comparative,false);assert.equal(periods[1].is_comparative,true);
 for(const p of periods)for(const [metric,value] of Object.entries(expected[ticker][p.period_end]))assert.equal(p.metrics[metric],value,`${ticker} ${p.period_end} ${metric}`);
 assert.equal(periods[0].period_start,ticker==='HMRZF'?'2024-12-01':'2025-01-01');
 assert.equal(periods[0].raw_facts.revenue.unit,currency);
 assert.equal(periods[0].raw_facts.weighted_average_shares.unit,'shares');
 assert.equal(periods[0].raw_facts.weighted_average_shares.scale,ticker==='HMRZF'?1000:1);
 const moneyUnit=xml.match(new RegExp('<xbrli:unit\\b[^>]*><xbrli:measure>iso4217:'+currency+'</xbrli:measure></xbrli:unit>'))?.[0];assert.ok(moneyUnit);
 const compoundMoney=xml.replace(moneyUnit,moneyUnit.replace('</xbrli:unit>','<xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>'));
 assert.throws(()=>parseOfficialInlineAnnual(ticker,compoundMoney,end),/inline/i,'a product currency unit cannot be labeled as money');
 for(const side of ['unitNumerator','unitDenominator']){
  const compoundEps=xml.replace('</xbrli:'+side+'>','<xbrli:measure>xbrli:shares</xbrli:measure></xbrli:'+side+'>');
  assert.notEqual(compoundEps,xml);
  assert.throws(()=>parseOfficialInlineAnnual(ticker,compoundEps,end),/inline/i,'EPS requires exactly one measure on each side');
 }
 for(const malformed of [
  xml.replaceAll(lei,'00000000000000000000'),xml.replaceAll('iso4217:'+currency,'iso4217:USD'),
  xml.replaceAll('https://xbrl.ifrs.org/taxonomy/2024-03-27/ifrs-full','https://example.com/wrong-ifrs'),
  xml.replaceAll('http://www.xbrl.org/inlineXBRL/transformation/2022-02-16','https://example.com/transforms'),
  xml.replaceAll('2025-11-30','2026-11-30').replaceAll('2025-12-31','2026-12-31'),
 ])assert.throws(()=>parseOfficialInlineAnnual(ticker,malformed,end),/annual|inline/i);
 const revenue=xml.match(/<ix:nonFraction\b[^>]*name="ifrs-full:(?:Revenue|RevenueFromContractsWithCustomers)"[^>]*>[\s\S]*?<\/ix:nonFraction>/)?.[0];assert.ok(revenue);
 const footnoted=xml.replace(revenue,revenue.replace('</ix:nonFraction>','<ix:exclude>9</ix:exclude></ix:nonFraction>'));
 assert.throws(()=>parseOfficialInlineAnnual(ticker,footnoted,end),/inline/i,"unsupported exclusion content must not become a larger numeric fact");
 const duplicateAccepted:string[]=[];
 for(const [name,pattern] of [["context",/<xbrli:context\b[^>]*id="c-1"[\s\S]*?<\/xbrli:context>/],["unit",/<xbrli:unit\b[^>]*id="u-1"[\s\S]*?<\/xbrli:unit>/]] as const){
  const node=xml.match(pattern)?.[0];assert.ok(node);
  try{parseOfficialInlineAnnual(ticker,xml.replace('</body>',node+'</body>'),end);duplicateAccepted.push(name);}catch(error){assert.match(String(error),/annual|inline/i);}
 }
 assert.deepEqual(duplicateAccepted,[],"duplicate source IDs are ambiguous even with equal displayed values");
 const dimensional=xml.replaceAll('<xbrli:entity>','<xbrli:entity><xbrli:segment/>');
 assert.throws(()=>parseOfficialInlineAnnual(ticker,dimensional,end),/annual|inline/i);
 const nil=xml.replaceAll('name="ifrs-full:ProfitLoss"','xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true" name="ifrs-full:ProfitLoss"');
 assert.throws(()=>parseOfficialInlineAnnual(ticker,nil,end),/annual|inline/i);
 const profit=xml.match(/<ix:nonFraction\b[^>]*name="ifrs-full:ProfitLoss"[^>]*>[\s\S]*?<\/ix:nonFraction>/)?.[0];assert.ok(profit);
 const conflict=xml.replace('</body>',profit.replace(/>[^<]*</,'>999999<')+'</body>');
 assert.throws(()=>parseOfficialInlineAnnual(ticker,conflict,end),/conflicting/i);
 // Binding changes on individual facts cannot inherit a trusted URI from the root.
 const rebound=xml.replaceAll('name="ifrs-full:ProfitLoss"','xmlns:ifrs-full="https://example.com/wrong" name="ifrs-full:ProfitLoss"');
 assert.throws(()=>parseOfficialInlineAnnual(ticker,rebound,end),/annual|inline/i);
}
console.log('official inline annual LEI, namespace, original currency, fiscal periods and scale checks OK');
