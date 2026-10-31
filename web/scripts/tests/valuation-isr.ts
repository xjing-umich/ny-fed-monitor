/** Actual production Next cache test with synthetic local data only. Run after next build/start. */
import assert from 'node:assert/strict';
import type { TrackingRecord } from '../../src/lib/valuation/trackingContract';
import { readFileSync } from 'node:fs';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import { buildAutomaticTargets, capturePublicationInputs } from '../lib/publicationProducer';
import { createPublicationClient, verifyPublishedPages } from '../lib/trackingPublication';
import { refreshTrackingPublicationPaths } from '../lib/valuationPublication';
const origin=process.argv[2];const backend=readFileSync('/tmp/task6-fixture-origin','utf8');
process.env.SUPABASE_URL=backend;process.env.SUPABASE_SERVICE_KEY='fixture-only';
async function main(){
 const db=createPublicationClient(backend,'fixture-only',{origin,supabaseUrl:backend});const prior=await capturePublicationInputs(db,origin);
 // Establish a coherent generation before testing stale rejection. The owned
 // backend may have restarted while its Next ISR cache still contains an older run.
 const initialValues=await (await fetch(backend+'/fixture/records')).json() as {record:TrackingRecord}[];
 const initialRecords=initialValues.filter(value=>['FIX','FAA','AAPL'].includes(value.record.identity.ticker)).map(value=>value.record);
 const initialTargets=buildAutomaticTargets({...prior,after:prior.before,origin,records:initialRecords,generations:Object.fromEntries(initialRecords.map(record=>[record.identity.key,1]))});
 await refreshTrackingPublicationPaths(origin,initialTargets.map(target=>target.path),'task6-fixture-secret');
 await verifyPublishedPages(initialTargets,fetch);
 const anonymous=await fetch(origin+'/stocks/screener');const withCookie=await fetch(origin+'/stocks/screener',{headers:{Cookie:'task6_fixture_user=other'}});
 assert.equal(anonymous.headers.get('x-nextjs-cache'),'HIT');assert.match(anonymous.headers.get('cache-control')??'',/s-maxage=259200/);
 assert.equal(withCookie.headers.get('set-cookie'),null);assert.equal(await anonymous.text(),await withCookie.text(),'public cache is independent of user cookies');
 const records:TrackingRecord[]=[];for(const ticker of ['FIX','FAA','AAPL'])records.push(await (await fetch(backend+'/fixture/update?ticker='+ticker)).json());
 const current=await capturePublicationInputs(db,origin);
 const targets=buildAutomaticTargets({...current,before:prior.before,after:current.before,origin,records,generations:Object.fromEntries(records.map(r=>[r.identity.key,2]))});
 await assert.rejects(verifyPublishedPages(targets.filter(t=>t.path==='/stocks/screener'),fetch),/digest|revision/,'real cached old body cannot confirm new generation');
 await refreshTrackingPublicationPaths(origin,targets.map(t=>t.path),'task6-fixture-secret');
 const proof=await verifyPublishedPages(targets,fetch);assert.equal(proof.targets.length,targets.length);
 const response=await fetch(origin+'/stocks/screener');const html=await response.text();let found=false;
 function visit(node:DefaultTreeAdapterTypes.Node){if('tagName' in node){if(['script','head'].includes(node.tagName))return;const a=Object.fromEntries(node.attrs.map(v=>[v.name,v.value]));if(node.tagName==='tr'&&a['data-valuation-revision']===records[1].revisionId){const text=JSON.stringify(node.childNodes,(k,v)=>k==='parentNode'?undefined:v);assert(text.includes('$100')&&!text.includes('$125'),'raw reference100 survives independent margin60%; inverse125 forbidden');found=true;}}if('childNodes' in node)node.childNodes.forEach(visit);}visit(parse(html));assert(found);
 assert.equal((await fetch(origin+'/zh/stocks/screener/unknown-fixture-variant')).status,404,'regeneration does not relax variant whitelist');
 for(const path of ['/','/zh']) {
  const home=await (await fetch(origin+path)).text();
  let homeSeen=false;
  function scan(node:DefaultTreeAdapterTypes.Node) {
   if('tagName' in node){if(['script','head'].includes(node.tagName))return;
    const attrs=Object.fromEntries(node.attrs.map(v=>[v.name,v.value]));
    if(attrs['data-valuation-revision']===records[2].revisionId) {
     const text=JSON.stringify(node.childNodes,(key,value)=>key==='parentNode'?undefined:value);
     assert(text.includes('$100')&&!text.includes('$125'),'A5 shows raw same-generation reference, not inverse margin');homeSeen=true;
    }
   }if('childNodes' in node)node.childNodes.forEach(scan);
  }scan(parse(home));assert(homeSeen,`${path}: A5 numeric example has new publication marker`);
 }
 const state=await fetch(origin+'/api/valuation/state?tickers=FIX,FAA',{headers:{Cookie:'task6_fixture_user=other'}});assert.equal(state.headers.get('cache-control'),'no-store');assert.equal(state.headers.get('set-cookie'),null);assert((await state.json()).states.every((s:{status:string})=>s.status==='pending'),'new public candidate remains publishing before Task5 confirmation');
 console.log(`valuation-isr PASS: real stale cache refused, ${targets.length} route projections refreshed and verified, raw IV preserved, cookie-independent public HIT and no-store safety API`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
