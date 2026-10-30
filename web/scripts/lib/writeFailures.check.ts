import assert from 'node:assert/strict';
import {getDb} from '../../src/lib/managers/db';
import {computeAndStoreConsensus} from './computeConsensus';
import {updatePrices} from './updatePrices';
process.env.SUPABASE_URL='https://writes-fixture.invalid';process.env.SUPABASE_SERVICE_KEY='fixture-key';
const managers=[{cik:'1',slug:'one',person:'One'},{cik:'2',slug:'two',person:'Two'}];
const filings=managers.flatMap((m,i)=>[{id:i*2+1,cik:m.cik,period:'2026-06-30',filed_at:'2026-08-01'},{id:i*2+2,cik:m.cik,period:'2026-03-31',filed_at:'2026-05-01'}]);
const holdings=filings.flatMap(f=>['111111111','222222222'].map((cusip,j)=>({id:f.id*2+j,filing_id:f.id,cusip,issuer:cusip,value:100,shares:f.period==='2026-06-30'?11:10,weight:.5,put_call:null})));
const fixtures:Record<string,unknown[]>={managers,filings,holdings,security_cusips:[{cusip:'111111111',ticker:'AAA',issuer:'AAA'},{cusip:'222222222',ticker:'BBB',issuer:'BBB'}],stock_splits:[],securities:[{ticker:'AAA'}]};
let failureTable='',failureMethod='',publications=0;const statuses:string[]=[];
globalThis.fetch=async(input,init)=>{
 const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),method=init?.method||'GET',table=u.pathname.split('/').at(-1)!;
 if(u.hostname.includes('yahoo'))return new Response(JSON.stringify({chart:{result:[{timestamp:[Math.floor(Date.now()/1000)-86400],indicators:{quote:[{close:[10]}]},meta:{currency:'USD'}}]}}),{headers:{'content-type':'application/json'}});
 if(table===failureTable&&method===failureMethod)return new Response(JSON.stringify({code:'XX000',message:`injected ${table} ${method} failure`}),{status:500,headers:{'content-type':'application/json'}});
 let data:unknown=[];
 if(table==='publish_manager_derived'){publications++;data=true;}
 else if(table==='price_ingest_runs'&&method==='POST')data={id:7};
 else if(table==='price_ingest_runs'&&method==='PATCH'){statuses.push(JSON.parse(String(init?.body)).status);}
 else if(method==='GET'){
  let rows=(fixtures[table]||[])as Record<string,unknown>[];
  for(const[k,v]of u.searchParams)if(v.startsWith('eq.'))rows=rows.filter(r=>String(r[k])===v.slice(3));
  if(table==='filings')rows=[...rows].sort((a,b)=>String(b.period).localeCompare(String(a.period)));
  data=rows;
 }
 return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
};
async function main(){
 const db=getDb();const failures:string[]=[];
 for(const table of ['consensus_holdings','consensus_moves','consensus_stock_holders','consensus_stock_trend','consensus_coownership'])for(const method of ['DELETE','POST']){
  failureTable=table;failureMethod=method;publications=0;
  try{await assert.rejects(()=>computeAndStoreConsensus(db),new RegExp(`injected ${table}`));assert.equal(publications,0,'failed batch cannot publish summaries');}catch{failures.push(table+' '+method);}
 }
 failureTable='prices';failureMethod='POST';statuses.length=0;
 try{await assert.rejects(()=>updatePrices(db,{throttleMs:0}),/injected prices/);assert.ok(statuses.includes('error'));assert.ok(!statuses.includes('success'));}catch{failures.push('prices POST');}
 assert.deepEqual(failures,[],`Failures swallowed: ${failures.join(', ')}`);
 failureTable='';publications=0;const r=await computeAndStoreConsensus(db);assert.equal(r.holdings,2);assert.equal(r.summaries,2);assert.equal(publications,1);
 console.log('write failures reject before successful publication checks OK');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
