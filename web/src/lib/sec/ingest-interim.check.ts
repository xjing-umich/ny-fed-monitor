import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import WebSocket from 'ws';import {createClient}from'@supabase/supabase-js';
import{ingestCompany}from'./ingest';import{fundamentalsToFloorInput}from'../valuation/fundamentalsToFloorInput';import{assessGrowthCoverage}from'../valuation/growthEvidence';
const html=fs.readFileSync(path.join(__dirname,'interim-disclosures/fixtures/pdd-2026-q2.html'),'utf8');
process.env.SEC_USER_AGENT='Compounder source fixture test@example.com';process.env.SUPABASE_URL='https://interim-ingest.invalid';process.env.SUPABASE_SERVICE_KEY='fixture';
let missingSchema=true,companyWrites=0,documentReads=0,queueWrites=0,periodClears=0;
let company:Record<string,unknown>|null=null,latest:Record<string,unknown>|null=null;let periods:Record<string,unknown>[]=[];let docs:Record<string,unknown>[]=[];let queue:Record<string,unknown>|null=null;let filings:Record<string,unknown>[]=[];
const recent={accessionNumber:['0001104659-26-100534','0001104659-26-050727'],acceptanceDateTime:['2026-08-25T19:00:00Z','2026-04-29T19:00:00Z'],filingDate:['2026-08-25','2026-04-29'],reportDate:['2026-08-25','2025-12-31'],form:['6-K','20-F'],primaryDocument:['cover.htm','annual.htm']};
const values=(v:number)=>[2025,2024,2023].map((y,i)=>({start:`${y}-01-01`,end:`${y}-12-31`,val:v-i,form:'20-F',filed:`${y+1}-04-29`,accn:y===2025?'0001104659-26-050727':`0001104659-${y-1999}-050727`,fy:y}));
const fetcher:typeof fetch=async(input,init)=>{
 const u=new URL(input instanceof Request?input.url:String(input));const method=init?.method??'GET';
 if(u.hostname.endsWith('sec.gov')){
  if(u.pathname.endsWith('company_tickers.json'))return Response.json({0:{ticker:'PDD',cik_str:1737806,title:'PDD'}});
  if(u.pathname.includes('/submissions/'))return Response.json({cik:'1737806',name:'PDD',fiscalYearEnd:'1231',filings:{recent}});
  if(u.pathname.includes('/companyfacts/'))return Response.json({cik:1737806,entityName:'PDD',facts:{'us-gaap':{Revenues:{units:{USD:values(100)}},NetIncomeLoss:{units:{USD:values(20)}},PaymentsToAcquirePropertyPlantAndEquipment:{units:{USD:values(10)}}}}});
  if(u.pathname.endsWith('/index.json'))return Response.json({directory:{item:[{name:'tm2623874d1_ex99-1.htm'}]}});
  if(u.pathname.endsWith('tm2623874d1_ex99-1.htm')){documentReads++;return new Response(html);}
  throw Error('Unmocked SEC source '+u.pathname);
 }
 assert.equal(u.hostname,'interim-ingest.invalid');const table=u.pathname.split('/').at(-1);
 if(table==='sec_ingest_runs')return method==='POST'?Response.json({id:'run'}):new Response(null,{status:204});
 if(table==='fundamental_publications'){
  if(method==='GET')return Response.json(queue);
  queue=JSON.parse(String(init?.body))[0];queueWrites++;return new Response(null,{status:204});
 }
 if(table==='company_interim_disclosures'){
  if(missingSchema)return Response.json({code:'PGRST205',message:'missing interim schema'},{status:404});
  if(method==='GET')return Response.json(docs.map(r=>({...r,source_accepted_at:typeof r.source_accepted_at==='string'?r.source_accepted_at.replace('Z','+00:00'):null})));
  const incoming=JSON.parse(String(init?.body))as Record<string,unknown>[];for(const r of incoming){docs=docs.filter(d=>d.source_url!==r.source_url);docs.push(r);}return new Response(null,{status:204});
 }
 if(table==='sec_companies'){
  if(method==='GET')return Response.json(company);
  company=JSON.parse(String(init?.body));companyWrites++;return new Response(null,{status:204});
 }
 if(table==='company_fundamentals_periods'){
  if(method==='GET')return Response.json(periods);
  if(method==='DELETE'){periods=[];periodClears++;}else periods.push(...JSON.parse(String(init?.body)));return new Response(null,{status:204});
 }
 if(table==='company_fundamentals_latest'){
  if(method==='GET')return Response.json(latest);latest=JSON.parse(String(init?.body));return new Response(null,{status:204});
 }
 if(table==='sec_filings'){
  if(method==='GET')return Response.json(filings);filings=JSON.parse(String(init?.body));return new Response(null,{status:204});
 }
 throw Error('Unmocked table '+table);
};
globalThis.fetch=fetcher;
const db=createClient('https://interim-ingest.invalid','fixture',{auth:{persistSession:false},realtime:{transport:WebSocket as unknown as never},global:{fetch:fetcher}});
async function main(){
 assert.equal((await ingestCompany('PDD',db)).status,'failed');assert.equal(companyWrites,0,'missing required source persistence fails beforefinancialmutation');
 missingSchema=false;
 const first=await ingestCompany('PDD',db);assert.equal(first.status,'success');assert.equal(first.interim_disclosures?.supported,1);assert.equal(documentReads,1);assert.equal(queueWrites,1);assert.equal(docs[0].report_period_end,'2026-06-30');
 assert.equal(docs[0].source_accepted_at,'2026-08-25T19:00:00.000Z');assert.ok(filings.every(f=>!('source_accepted_at' in f)),'acceptance metadata belongs only to disclosure evidence, not sec_filings');
 const again=await ingestCompany('PDD',db);assert.equal(again.status,'success');assert.equal(documentReads,1,'canonical repeated ingest reuses verified source');assert.equal(periodClears,2,'normal period replacement still occurs');assert.equal(docs.length,1,'normal period replacement cannot erase disclosure evidence');assert.equal(queueWrites,1,'timestamps and retries alone do not queue another refresh');
 const{getSecCompanyData}=await import('./read');const read=await getSecCompanyData('PDD');assert.equal(read.interim.evidence[0].current.end,'2026-06-30');
 const before=fundamentalsToFloorInput('PDD','PDD',read.annual,4,7389,read.quarterly,read.filings);
 const after=fundamentalsToFloorInput('PDD','PDD',read.annual,4,7389,read.quarterly,read.filings,read.interim);
 assert.equal(assessGrowthCoverage(before.growth_evidence!,'2026-10-31'),'missing_interim');assert.equal(assessGrowthCoverage(after.growth_evidence!,'2026-10-31'),undefined);assert.equal(after.growth_evidence!.currency,'CNY');assert.equal(after.ttm,undefined,'partial income evidence is never a full TTM');
 console.log('canonical interim ingest → source store → growth reader → retry checks OK');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
