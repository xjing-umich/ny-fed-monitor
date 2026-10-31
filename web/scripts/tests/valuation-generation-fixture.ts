/** Synthetic local PostgREST fixture only. No live credentials or market data. */
import { runValuation, type RunValuationInput } from '../../src/lib/valuation/runValuation';
import { buildTrackingRecord } from '../../src/lib/valuation/trackingContract';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { publicationFixture, projectPublicationFixture, fixtureDate } from './publication-fixture';
const tickers=['FIX',...Array.from({length:64},(_,i)=>`F${String.fromCharCode(65+Math.floor(i/26))}${String.fromCharCode(65+i%26)}`)];
const publications=tickers.map((ticker,i)=>publicationFixture({ticker,verdict_bucket:'below',in_strike_zone:true,range_lo:60,range_hi:150,price:50,margin_pct:i===0?.6:.4999,reliable:true},i+1));
// FIX includes the genuine engine presentation so detail and list numbers can be compared.
const fix=publications[0].valuation_publication.public_result;
const runInput:RunValuationInput={floorInput:{ticker:'FIX',company_name:'Fixture FIX',years:Array.from({length:5},(_,i)=>({fiscal_year:2025-i,revenue:10000-i*1000,operating_income:4500-i*450,net_income:3000-i*300,effective_tax_rate:.15,shareholders_equity:5000-i*500,cash:2000-i*200,total_debt:1000,shares_diluted:1000,d_and_a:600-i*60,capex:550-i*50}))},price:{close:20,date:fixtureDate,currency:'USD',source:'fixture'},dgs10:{value:4.2,date:fixtureDate},guards:{adsSuppressed:false,fundamentalsStale:false,priceStale:false,splitCoverageStale:false}};
const run=runValuation(runInput);
fix.presentation=run;
fix.record=buildTrackingRecord(run,{identity:fix.record.identity,modelVersion:fix.record.modelVersion,currency:'USD',perShareBasis:'ordinary',priceSource:'fixture',fundamentalAsOf:fixtureDate,filedAt:fixtureDate,computedAt:fixtureDate,publishedAt:null,nonPriceInputs:{fundamentals:{fixture:true},assumptions:{rate:4.2},shareBasis:{adsRatio:1}},sources:[{url:'https://www.sec.gov/fixture',asOf:fixtureDate}]});
for (const row of publications) {
 row.valuation_publication.publication_status='confirmed';
 row.valuation_publication.tracking_result={...row.valuation_publication.public_result.record,publishedAt:new Date().toISOString()} as never;
 row.valuation_publication.tracking_generation=1 as never;
}
const manager={cik:'0000000001',slug:'fixture-manager',name:'Fixture Fund',person:'Fixture Manager',period:'2026-06-30',filed_at:'2026-08-01',total_value:65000000,holding_count:65,top_holding:'Fixture Corporation'};
const holdings=tickers.map((ticker,i)=>({id:i+1,filing_id:1,cusip:String(i+1).padStart(9,'0'),ticker,issuer:`Fixture ${ticker} Corporation`,title_of_class:'COM',value:(65-i)*100000,shares:1000,weight:1/65,put_call:null}));
const consensus=holdings.map((h,i)=>({...h,holder_count:70-i,total_value:h.value}));
let safety='valid'; let failure=false; let safetyTicker:string|null=null; let delayMs=0;
const counts:Record<string,number>={};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url!,'http://localhost'); const name=url.pathname.split('/').at(-1)!;
 res.setHeader('content-type','application/json');
 if(url.pathname==='/fixture/state') {
  safety=url.searchParams.get('safety')??safety;
  if(url.searchParams.has('failure'))failure=url.searchParams.get('failure')==='1';
  if(url.searchParams.has('safetyTicker'))safetyTicker=url.searchParams.get('safetyTicker')||null;
  if(url.searchParams.has('delayMs'))delayMs=Math.min(5000,Math.max(0,Number(url.searchParams.get('delayMs'))||0));
  res.end(JSON.stringify({safety,failure,safetyTicker,delayMs,counts}));return;
 }
 if(url.pathname==='/fixture/update') {
   const i=publications.findIndex(p=>p.ticker===(url.searchParams.get('ticker')??'FAA'));
   if(i<0){res.statusCode=400;res.end('{}');return;}
   const old=publications[i];const fresh=publicationFixture({ticker:old.ticker,verdict_bucket:'below',in_strike_zone:true,range_lo:60,range_hi:150,price:50,margin_pct:.6,reliable:true},i+1);
   if(old.ticker==='FIX'){
     const presentation=runValuation({...runInput,price:{...runInput.price!,close:21}});
     fresh.valuation_publication.public_result={presentation,record:buildTrackingRecord(presentation,{identity:fix.record.identity,modelVersion:fix.record.modelVersion,currency:'USD',perShareBasis:'ordinary',priceSource:'fixture',fundamentalAsOf:fixtureDate,filedAt:fixtureDate,computedAt:fixtureDate,publishedAt:null,nonPriceInputs:{fundamentals:{fixture:true},assumptions:{rate:4.2},shareBasis:{adsRatio:1}},sources:[{url:'https://www.sec.gov/fixture',asOf:fixtureDate}]})};
   }
   fresh.valuation_publication.generation=2;fresh.valuation_publication.tracking_result=old.valuation_publication.tracking_result;fresh.valuation_publication.tracking_generation=old.valuation_publication.tracking_generation;
   publications[i]=fresh;res.end(JSON.stringify(fresh.valuation_publication.public_result.record));return;
 }
 if(url.pathname==='/fixture/records') {res.end(JSON.stringify(publications.map(p=>p.valuation_publication.public_result)));return;}
 counts[name]=(counts[name]??0)+1;
 if(name==='tracking_securities' && delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
 if(name==='tracking_securities' && failure){res.statusCode=503;res.end(JSON.stringify({code:'08006',message:'synthetic fixture failure'}));return;}
 let rows:Record<string,unknown>[]=[];
 if(name==='tracking_securities') rows=publications.map(row=>projectPublicationFixture({...row,valuation_publication:{...row.valuation_publication,safety:{...row.valuation_publication.safety,status:safetyTicker&&row.ticker!==safetyTicker?'valid':safety,reasons:safety==='valid'||(safetyTicker&&row.ticker!==safetyTicker)?[]:['fixture_invalid']}}},url.searchParams.get('select')));
 else if(name==='manager_index'||name==='managers') rows=[manager];
 else if(name==='filings') rows=[{...manager,id:1,accession:'0000000001-26-000001'}];
 else if(name==='holdings') rows=holdings;
 else if(name==='consensus_holdings') rows=consensus;
 else if(name==='security_cusips') rows=holdings;
 else if(name==='securities') rows=tickers.map(ticker=>({ticker,exchange:'NYSE',security_type:'Common Stock',ads_ratio:1}));
 else if(name==='consensus_stock_holders') rows=holdings.map(h=>({...h,...manager,period:'2026-06-30',kind:null,prior_weight:null}));
 else if(name==='prices') rows=[{close:50,date:fixtureDate,currency:'USD',source:'fixture'}];
 for(const [key,value] of url.searchParams) {
   if(value.startsWith('eq.')) rows=rows.filter(row=>String(row[key])===value.slice(3));
   if(value.startsWith('in.(')) {const accepted=value.slice(4,-1).replaceAll('"','').split(',');rows=rows.filter(row=>accepted.includes(String(row[key])));}
 }
 const count=rows.length; const offset=Number(url.searchParams.get('offset')??0); const limit=Number(url.searchParams.get('limit')??1000); rows=rows.slice(offset,offset+limit);
 res.setHeader('content-range',`${offset}-${offset+rows.length-1}/${count}`);
 if(req.headers.accept?.includes('vnd.pgrst.object')) res.end(JSON.stringify(rows[0]??null)); else res.end(JSON.stringify(rows));
});
server.listen(Number(process.env.PORT??0),'127.0.0.1',()=>{const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;writeFileSync(process.argv[2],origin);console.log(`Synthetic valuation fixture: ${origin}`);});
