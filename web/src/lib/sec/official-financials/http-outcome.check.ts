import assert from 'node:assert/strict';
import {NextRequest}from'next/server';
import{financialIngestHttpStatus}from'../ingestOutcome';
process.env.SUPABASE_URL='https://pending-http.invalid';process.env.SUPABASE_SERVICE_KEY='fixture';
process.env.SEC_USER_AGENT='Compounder HTTP test test@example.com';process.env.INGEST_SECRET='fixture-auth';
globalThis.fetch=async(input,init)=>{
 const u=new URL(input instanceof Request?input.url:String(input));
 if(u.hostname.endsWith('sec.gov')){assert.ok(u.pathname.endsWith('company_tickers.json'));return Response.json({0:{ticker:'OZK',cik_str:1569650,title:'Bank OZK'}});}
 if(u.hostname.includes('fdicconnect'))return new Response('unavailable',{status:503});
 const table=u.pathname.split('/').at(-1)!;
 if((init?.method??'GET')==='GET')return Response.json(u.searchParams.has('ticker')?null:[]);
 return table==='sec_ingest_runs'&&init?.method==='POST'?Response.json({id:'run'}):new Response(null,{status:204});
};
async function main(){
 assert.equal(financialIngestHttpStatus({failed:0,source_pending:1}),409);
 assert.equal(financialIngestHttpStatus({failed:1,source_pending:1}),500,"unexpected failures take precedence over known pending sources");
 assert.equal(financialIngestHttpStatus({failed:0,source_pending:0}),200);
 const {POST}=await import('../../../app/api/sec/ingest/company/route');
 const r=await POST(new NextRequest('https://app.invalid/api/sec/ingest/company',{method:'POST',headers:{authorization:'Bearer fixture-auth','content-type':'application/json'},body:JSON.stringify({ticker:'OZK'})}));
 assert.equal(r.status,500,'HTTP200 must not advertise failed official sources as successful financial coverage');
 assert.equal((await r.json()).status,'failed');
 console.log('official source failure is a non-success HTTP outcome; pending mapping preserved');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
