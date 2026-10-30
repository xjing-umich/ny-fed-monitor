import assert from 'node:assert/strict';
process.env.SUPABASE_URL='https://sec-fixture.invalid';process.env.SUPABASE_SERVICE_KEY='fixture-key';
let broken=false;
globalThis.fetch=async input=>{
 const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),table=u.pathname.split('/').at(-1);
 if(broken)return new Response(JSON.stringify({message:'transient database failure',code:'XX000'}),{status:500,headers:{'content-type':'application/json'}});
 let data:unknown=[];
 if(table==='sec_companies')data=[{ticker:'GOOG',normalized_ticker:'GOOG',cik:'0001652044',company_name:'Alphabet'}];
 if(table==='sec_filings'&&u.searchParams.get('cik')==='eq.0001652044')data=[{ticker:'GOOGL',cik:'0001652044',accession_number:'latest',form:'10-Q',report_date:'2026-09-30',filing_date:'2026-10-29'}];
 if(table==='company_fundamentals_latest')data=[{ticker:'GOOG',latest_10q_period_end:'2026-09-30'}];
 return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
};
async function main(){const {getSecCompanyData}=await import('./read');const r=await getSecCompanyData('GOOG');assert.equal(r.filings.length,1,'GOOG must read shared-CIK filings, regardless of stored alias');assert.equal(r.filings[0].report_date,'2026-09-30');const q=await getSecCompanyData('SATS');assert.equal(q.company,null);assert.deepEqual(q.filings,[]);broken=true;await assert.rejects(()=>getSecCompanyData('MSFT'),/database failure/);console.log('SEC issuer identity and failure boundary checks OK');}main().catch(e=>{console.error(e);process.exitCode=1;});
