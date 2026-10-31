import assert from 'node:assert/strict';import{createClient}from'@supabase/supabase-js';import WebSocket from'ws';
import{ingestCompany}from'../../ingest';import type{FundamentalPublication}from'../../fundamentalPublication';import{pdfSourceResponse}from'./test-source-fixtures';
process.env.SEC_USER_AGENT='Compounder PDF integration test@example.com';
let mode='normal',queueWrites=0;const writes:{table:string;body:unknown}[]=[],saved:Record<string,unknown>[]=[],queues=new Map<string,FundamentalPublication>();
const transport:typeof fetch=async(input,init)=>{
 const u=new URL(input instanceof Request?input.url:String(input)),method=init?.method??'GET';
 if(u.hostname.endsWith('sec.gov')){assert.ok(u.pathname.endsWith('company_tickers.json'),'PDF channels must not request SEC facts or depositary submissions');return Response.json({0:{ticker:'OZK',cik_str:1569650,title:'Bank OZK'},1:{ticker:'TRMLF',cik_str:2071881,title:'Tourmaline Oil Corp/ADR'}});}
 if(!u.hostname.endsWith('.invalid')){if(mode==='source')return new Response('unavailable',{status:503});return pdfSourceResponse(u)??Promise.reject(Error('unknown source URL'));}
 const table=u.pathname.split('/').at(-1)!;
 if(method==='GET'){
  if(table==='official_financial_periods'&&mode==='schema'&&u.searchParams.get('select')?.includes('source_pdf_page_count'))return Response.json({code:'PGRST204',message:'PDF columns missing'},{status:400});
  if(table==='fundamental_publications')return Response.json(queues.get(u.searchParams.get('ticker')!.slice(3))??null);
  return Response.json([]);
 }
 const body=JSON.parse(String(init?.body));writes.push({table,body});
 if(table==='sec_ingest_runs'&&method==='POST')return Response.json({id:'run'});
 if(table==='official_financial_periods'){
  if(mode==='write')return Response.json({message:'PDF write failed'},{status:400});
  assert.equal(u.searchParams.get('on_conflict'),'ticker,source_document_id,period_end');saved.push(...body);
 }
 if(table==='fundamental_publications'){
  if(mode==='publication')return Response.json({message:'PDF publication failed'},{status:400});
  queueWrites++;queues.set(body[0].ticker,body[0]);
 }
 return new Response(null,{status:204});
};
globalThis.fetch=transport;
const db=createClient('https://pdf-ingest.invalid','fixture',{auth:{persistSession:false},realtime:{transport:WebSocket as unknown as never},global:{fetch:transport}});
async function main(){
 for(const ticker of ['OZK','TRMLF']){
  writes.length=0;const before=queueWrites,r=await ingestCompany(ticker,db);
  assert.equal(r.status,'success',r.error);assert.equal(r.foreign_issuer,ticker==='TRMLF');assert.equal(r.saved.native_annual_periods,2);assert.equal(r.saved.annual_periods,0);assert.equal(r.saved.quarterly_periods,0);assert.equal(r.saved.latest,false);
  const company=writes.find(w=>w.table==='sec_companies')!.body as Record<string,unknown>;assert.equal(company.company_name,ticker==='OZK'?'Bank OZK':'Tourmaline Oil Corp.');assert.equal(company.is_foreign_issuer,ticker==='TRMLF');
  assert.equal(writes.some(w=>w.table==='sec_filings'||w.table==='sec_native_financial_periods'||w.table.startsWith('company_fundamentals')),false,'PDFs do not masquerade as SEC filings or USD/40F periods');
  assert.ok(saved.at(-1)!.source_pdf_page_count);assert.equal(queueWrites,before+1);
  const generation=queues.get(ticker)!.generation;await new Promise(resolve=>setTimeout(resolve,5));const again=await ingestCompany(ticker,db);
  assert.equal(again.status,'success',again.error);assert.equal(queueWrites,before+1);assert.equal(queues.get(ticker)!.generation,generation);
 }
 for(const failure of ['schema','source','write','publication']){
  mode=failure;writes.length=0;if(failure==='publication')queues.delete('OZK');const before=queueWrites;const r=await ingestCompany('OZK',db);assert.equal(r.status,'failed',failure);assert.equal(queueWrites,before);
  if(failure==='schema'||failure==='source')assert.equal(writes.some(w=>w.table!=='sec_ingest_runs'),false,'missing PDF migration/source failure precedes company and financial mutations');
  const finished=writes.filter(w=>w.table==='sec_ingest_runs').at(-1)!.body as {status:string};assert.equal(finished.status,'failed');
 }
 console.log('official PDF canonical ingest, domestic/foreign identity, schema gate, failures, native isolation and retry checks OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});
