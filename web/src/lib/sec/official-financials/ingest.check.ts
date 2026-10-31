import assert from 'node:assert/strict';import fs from 'node:fs';
import {createClient}from'@supabase/supabase-js';import WebSocket from'ws';import{zipSync,strToU8}from'fflate';
import{ingestCompany}from'../ingest';import type{FundamentalPublication}from'../fundamentalPublication';
const fixture=(name:string)=>fs.readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8');
const issuers={IBN:{cik:1103838,name:'ICICI BANK LIMITED'},HMRZF:{cik:1396282,name:'H&M HENNES & MAURITZ AB'},HKHHF:{cik:1142231,name:'HEINEKEN HOLDING N V'}};
process.env.SEC_USER_AGENT='Compounder official fixture test@example.com';
let missing=false,writeFailure=false,sourceFailure=false;let queueWrites=0;
const queues=new Map<string,FundamentalPublication>(),financialWrites:string[]=[],saved:Record<string,unknown>[]=[];
const transport:typeof fetch=async(input,init)=>{
 const u=new URL(input instanceof Request?input.url:String(input));const method=init?.method??'GET';
 if(u.hostname.endsWith('sec.gov')){
  if(u.pathname.endsWith('company_tickers.json'))return Response.json(Object.fromEntries(Object.entries(issuers).map(([ticker,v],i)=>[i,{ticker,cik_str:v.cik,title:v.name}])));
  assert.ok(!u.pathname.includes('/companyfacts/'),'audited official routes do not repeatedly probe missing companyfacts');
  if(u.pathname.includes('/submissions/')){
   const ticker=Object.entries(issuers).find(([,v])=>u.pathname.includes(String(v.cik)))![0] as keyof typeof issuers;
   const recent=ticker==='IBN'?{form:[...Array(42).fill('6-K'),'20-F'],accessionNumber:[...Array.from({length:42},(_,i)=>`0000950103-26-${String(i).padStart(6,'0')}`),'0000950103-26-010820'],primaryDocument:[...Array(42).fill('notice.htm'),'dp249803_20f.htm'],reportDate:[...Array(42).fill('2026-10-01'),'2026-03-31'],filingDate:[...Array(42).fill('2026-10-02'),'2026-07-20']}:{form:['F-6'],accessionNumber:['registration'],primaryDocument:['registration.htm'],reportDate:[''],filingDate:['2025-01-01']};
   return Response.json({cik:String(issuers[ticker].cik),name:issuers[ticker].name,filings:{recent}});
  }
  assert.ok(u.pathname.endsWith('/dp249803_20f.htm'));return new Response(fixture('ibn-2026-20f.html'));
 }
 if(u.hostname==='hmgroup.com'||u.hostname==='www.heinekenholding.com'||u.hostname==='staticcontents.investis.com'){
  if(sourceFailure)return new Response('source unavailable',{status:500});
  if(u.pathname==='/investors/reports/')return new Response(fixture('hmrzf-landing.html'));
  if(u.pathname.endsWith('results-reports-webcasts-presentations'))return new Response(fixture('hkhhf-landing.html'));
  if(u.pathname.endsWith('.zip'))return new Response(zipSync({'reports/annual.xhtml':strToU8(fixture('hmrzf-annual.xhtml'))}));
  assert.ok(u.pathname.endsWith('ixbrl-viewer.htm'));return new Response(fixture('hkhhf-annual.xhtml'));
 }
 assert.equal(u.hostname,'official-ingest.invalid');
 const table=u.pathname.split('/').at(-1)!;
 if(method==='GET'){
  if(table==='official_financial_periods'&&missing)return Response.json({code:'PGRST205',message:'official schema missing'},{status:400});
  if(table==='fundamental_publications')return Response.json(queues.get(u.searchParams.get('ticker')!.slice(3))??null);
  return Response.json([]);
 }
 if(table==='sec_ingest_runs'&&method==='POST')return Response.json({id:'run'});
 if(table==='sec_ingest_runs')return new Response(null,{status:204});
 financialWrites.push(table);
 if(table==='fundamental_publications'){queueWrites++;const row=JSON.parse(String(init?.body))[0];queues.set(row.ticker,row);}
 if(table==='sec_filings')assert.ok(JSON.parse(String(init?.body)).length,'no empty upsert for non-SEC annual sources');
 if(table==='official_financial_periods'){
  if(writeFailure)return Response.json({message:'official write failed'},{status:400});
  assert.equal(u.searchParams.get('on_conflict'),'ticker,source_document_id,period_end');saved.push(...JSON.parse(String(init?.body)));
 }
 return new Response(null,{status:204});
};
globalThis.fetch=transport;
const db=createClient('https://official-ingest.invalid','fixture',{auth:{persistSession:false},realtime:{transport:WebSocket as unknown as never},global:{fetch:transport}});
async function main(){
 for(const ticker of ['IBN','HMRZF','HKHHF']){
  financialWrites.length=0;const before=queueWrites;const r=await ingestCompany(ticker,db);
  assert.equal(r.status,'success',r.error);assert.equal(r.saved.native_annual_periods,2);assert.equal(r.quality_status,'native_currency');
  assert.equal(financialWrites.some(t=>t.startsWith('company_fundamentals')||t==='sec_native_financial_periods'),false,'new native sources cannot touch USD or audited40-F tables');
  assert.equal(queueWrites,before+1);const gen=queues.get(ticker)!.generation;const retrieved=saved.at(-1)!.source_retrieved_at;
  await new Promise(resolve=>setTimeout(resolve,5));
  const again=await ingestCompany(ticker,db);assert.equal(again.status,'success',again.error);assert.notEqual(saved.at(-1)!.source_retrieved_at,retrieved);assert.equal(queueWrites,before+1,'retrieval timestamp alone must not republish');assert.equal(queues.get(ticker)!.generation,gen);
 }
 assert.equal(saved.length,12);
 assert.equal(saved.find(r=>r.ticker==='IBN')!.source_accession,'0000950103-26-010820');
 assert.equal(saved.find(r=>r.ticker==='HKHHF')!.source_kind,'official_inline_viewer_copy');
 for(const mode of ['missing','write','source']){
  financialWrites.length=0;const before=queueWrites;missing=mode==='missing';writeFailure=mode==='write';sourceFailure=mode==='source';
  const r=await ingestCompany('HMRZF',db);assert.equal(r.status,'failed');assert.equal(queueWrites,before);
  if(mode!=='write')assert.equal(financialWrites.length,0,'schema/source failure precedes financial mutation');
 }
 console.log('official financial ingest schema/write/source failures, annual selection, retry publication and USD isolation checks OK');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
