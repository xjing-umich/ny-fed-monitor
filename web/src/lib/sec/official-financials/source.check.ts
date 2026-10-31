import assert from 'node:assert/strict';import fs from 'node:fs';
import {zipSync,strToU8} from 'fflate';
import {discoverEuropeanAnnual,extractEsefReport,fetchOfficialFinancials} from './source';
import {getOfficialSourceRoute} from './registry';
const fixture=(name:string)=>fs.readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8');
for(const [ticker,end]of[['HMRZF','2025-11-30'],['HKHHF','2025-12-31']]){
 const landing=fixture(ticker.toLowerCase()+'-landing.html');const source=discoverEuropeanAnnual(getOfficialSourceRoute(ticker,ticker==='HMRZF'?'0001396282':'0001142231')!,landing);
 assert.equal(source.reportEnd,end);assert.equal(source.publishedAt,ticker==='HMRZF'?'2026-03-26':'2026-02-11');
 assert.throws(()=>discoverEuropeanAnnual(getOfficialSourceRoute(ticker,ticker==='HMRZF'?'0001396282':'0001142231')!,landing+(ticker==='HMRZF'?'<a href="https://hmgroup.com/Annual-and-sustainability-report-2026.pdf">new annual</a>':'<a href="https://www.heinekenholding.com/annual-report-2026-new.pdf">new annual</a>')),/latest|annual/i,'new annual without supported source must not fall back to old report');
}
const xml=fixture('hmrzf-annual.xhtml');
assert.equal(extractEsefReport(zipSync({'reports/annual.xhtml':strToU8(xml),'ignored.bin':new Uint8Array(100)})).xml,xml);
assert.throws(()=>extractEsefReport(zipSync({'taxonomy.xml':strToU8('not a report')})),/ESEF/);
assert.throws(()=>extractEsefReport(zipSync({'a.xhtml':strToU8(xml),'b.xhtml':strToU8(xml)})),/ESEF/);
// Rename both ZIP entries to the same name in local and central headers: object-key
// counting after unzip would silently choose the second central-directory entry.
const duplicateNames=zipSync({'a.xhtml':strToU8(xml),'b.xhtml':strToU8(xml+'<!-- second -->')});
const from=strToU8('b.xhtml'),to=strToU8('a.xhtml');
for(let i=0;i<=duplicateNames.length-from.length;i++)if(from.every((v,j)=>duplicateNames[i+j]===v))duplicateNames.set(to,i);
assert.throws(()=>extractEsefReport(duplicateNames),/ESEF/,'duplicate report names must not overwrite a source document');
// Invalid compressed contents must never be inflated when the directory is
// already ambiguous. Changing the central compression method makes this visible.
const ambiguousUnsupported=zipSync({'a.xhtml':strToU8(xml),'b.xhtml':strToU8(xml)});
for(let i=0;i<ambiguousUnsupported.length-46;i++)if(ambiguousUnsupported[i]===0x50&&ambiguousUnsupported[i+1]===0x4b&&ambiguousUnsupported[i+2]===1&&ambiguousUnsupported[i+3]===2)new DataView(ambiguousUnsupported.buffer).setUint16(i+10,99,true);
assert.throws(()=>extractEsefReport(ambiguousUnsupported),/ESEF report missing, ambiguous or oversized/,'directory ambiguity is rejected before decompression');
assert.throws(()=>extractEsefReport(zipSync({'../report.xhtml':strToU8(xml)})),/ESEF/);
const tooLarge=zipSync({'annual.xhtml':strToU8(xml)});
const central=tooLarge.findIndex((v,i)=>v===0x50&&tooLarge[i+1]===0x4b&&tooLarge[i+2]===1&&tooLarge[i+3]===2);assert.ok(central>0);
new DataView(tooLarge.buffer).setUint32(central+24,48_000_001,true);
assert.throws(()=>extractEsefReport(tooLarge),/ESEF/,'oversized declared XHTML is rejected before allocation');
process.env.SEC_USER_AGENT='Compounder source fixture test@example.com';
let mode='normal';
globalThis.fetch=async input=>{
 const u=new URL(input instanceof Request?input.url:String(input));
 if(mode==='broken')return new Response('unavailable',{status:503});
 if(mode==='redirect')return new Response(null,{status:307,headers:{location:'https://untrusted.invalid/report.zip'}});
 if(mode==='oversized')return new Response('small',{headers:{'content-length':'5000001'}});
 if(u.href==='https://hmgroup.com/investors/reports/')return new Response(fixture('hmrzf-landing.html'));
 assert.equal(u.href,'https://hmgroup.com/wp-content/uploads/2026/03/hm-2025-11-30-0-sv.zip');
 return new Response(zipSync({'reports/annual.xhtml':strToU8(xml)}));
};
async function main(){
 const route=getOfficialSourceRoute('HMRZF','0001396282')!;
 const p=await fetchOfficialFinancials(route);
 assert.equal(p.periods.length,2);assert.equal(p.periods[0].reporting_currency,'SEK');
 assert.equal(p.periods[0].source_kind,'official_esef');assert.equal(p.periods[0].valuation_eligible,false);
 assert.equal(p.periods[0].raw_facts.weighted_average_shares.value,1604033000);
 assert.match(p.periods[0].source_sha256,/^[a-f0-9]{64}$/);
 mode='broken';await assert.rejects(fetchOfficialFinancials(route),/503/,'actual official HTTP failures stay failures');
 mode='redirect';await assert.rejects(fetchOfficialFinancials(route),/untrusted/);
 mode='oversized';await assert.rejects(fetchOfficialFinancials(route),/size limit/);
 const ibn=getOfficialSourceRoute('IBN','0001103838')!;
 await assert.rejects(fetchOfficialFinancials(ibn,{cik:'1103838',filings:{recent:{form:['20-F/A','20-F'],accessionNumber:['amended','original'],primaryDocument:['amended.htm','original.htm'],filingDate:['2026-08-01','2026-07-20'],reportDate:['2026-03-31','2026-03-31']}}}),/amendment/);
 console.log('latest official annual discovery, bounded archive and HTTP boundary checks OK');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
