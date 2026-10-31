/** Actual production stock-page regression; backend must use FIXTURE_DISPLAY_BASIS=1. */
import assert from 'node:assert/strict';
import {fmtPerShareValue} from '../../src/lib/format';
import { date } from '../../src/lib/i18n/format';
const origin=process.argv[2];
async function main(){
 const publications=await (await fetch(`${process.argv[3]}/fixture/records`)).json() as {record:{identity:{ticker:string};revisionId:string;intrinsicValue:number}}[];
 for(const lang of ['en','zh'] as const){
  for(const ticker of ['FIX','FAA']){
   const response=await fetch(`${origin}${lang==='zh'?'/zh':''}/stocks/${ticker}`);
   assert.equal(response.status,200);
   const html=await response.text();
   const record=publications.find(p=>p.record.identity.ticker===ticker)!.record;
   assert(html.includes(`data-valuation-revision="${record.revisionId}"`),"actual detail identifies its published revision");
   assert(html.includes(fmtPerShareValue(record.intrinsicValue)),"raw published IV remains unchanged");
   assert(!response.headers.has('set-cookie'),"public detail stays cookie-free");
   const method=html.match(/<details[^>]*>\s*<summary[^>]*>(?:Method &amp; numbers|方法与数字)<\/summary>[\s\S]*?<\/details>/)?.[0];
   assert(method,`${lang}/${ticker} actual valuation method section exists`);
   const text=method.replace(/<[^>]+>/g,'').replaceAll('<!-- -->','');
   assert(!text.includes(date('2026-09-30',lang)),`${lang}/${ticker} newer research TTM cannot relabel published method`);
   assert(!text.includes('1 ADS = 8'),`${lang}/${ticker} newer metadata ratio cannot relabel published method`);
   if(ticker==='FIX'){
    assert(text.includes(date('2026-03-31',lang)),`${lang} method retains published March TTM`);
    assert(text.includes('1 ADS = 2'),`${lang} method retains published ADS ratio`);
   }else{
    assert(text.includes(lang==='zh'?'期间口径未保留':'Period basis was not retained'),`${lang} legacy period unknown`);
    assert(text.includes(lang==='zh'?'ADS 换算比例未知':'ADS conversion ratio is unknown'),`${lang} legacy ratio unknown`);
    assert(!text.includes('FY 2026'),`${lang} synthetic fiscal key cannot be guessed as FY`);
   }
   assert(html.includes(date('2026-09-30',lang)),`${lang}/${ticker} current research still shows its newer date separately`);
  }
 }
 console.log('valuation-display-basis PASS: four actual bilingual stock pages retain frozen March/2 basis or honest legacy unknown, separate September/8 research');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
