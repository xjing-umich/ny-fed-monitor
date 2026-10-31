import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { ingestCompany } from "../ingest";
process.env.SEC_USER_AGENT="Compounder source tests test@example.com";
const writes:{table:string;method:string;body:unknown}[]=[];
const transport:typeof fetch=async(input,init)=>{
 const u=new URL(input instanceof Request?input.url:String(input)),method=init?.method??"GET";
 if(u.hostname.endsWith("sec.gov")) {
  assert.ok(u.pathname.endsWith("company_tickers.json"),"known PDF-only channels must not retry missing companyfacts/submissions");
  return Response.json({0:{ticker:"OZK",cik_str:1569650,title:"Bank OZK"},1:{ticker:"TRMLF",cik_str:2071881,title:"Tourmaline Oil Corp/ADR"}});
 }
 const table=u.pathname.split("/").at(-1)!;
 if(method==="GET")return Response.json(null);
 const body=JSON.parse(String(init?.body));writes.push({table,method,body});
 return table==="sec_ingest_runs"&&method==="POST"?Response.json({id:"run"}):new Response(null,{status:204});
};
globalThis.fetch=transport;
const db=createClient("https://pending.invalid","fixture",{auth:{persistSession:false},realtime:{transport:WebSocket as unknown as never},global:{fetch:transport}});
async function main(){
 for(const ticker of ["OZK","TRMLF"]){
  writes.length=0;const r=await ingestCompany(ticker,db);
  assert.equal(r.status,"source_pending");assert.equal(r.quality_status,"external_source_pending");
  assert.match(r.error!,/official PDF/);
  assert.equal(writes.some(w=>w.table!=="sec_ingest_runs"),false,"pending source cannot mutate financials or publish");
  const finished=writes.find(w=>w.method==="PATCH")!.body as {status:string};assert.equal(finished.status,"source_pending","pending is never successful resumable coverage");
 }
 console.log("pending official sources preserve non-success journal and avoid false writes/retries");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
