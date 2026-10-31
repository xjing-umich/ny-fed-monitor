/** Integration against an actual local Next process and synthetic PostgREST backend. */
import assert from 'node:assert/strict';
import { fmtPerShareValue } from '../../src/lib/format';
import { buildAutomaticTargets, capturePublicationInputs } from '../lib/publicationProducer';
import { createPublicationClient, verifyPublishedPages } from '../lib/trackingPublication';
import { readFileSync } from 'node:fs';
const origin=process.argv[2];const backend=readFileSync('/tmp/task6-fixture-origin','utf8');
process.env.SUPABASE_URL=backend;process.env.SUPABASE_SERVICE_KEY='fixture-only';
async function main(){
 const db=createPublicationClient(backend,'fixture-only',{origin,supabaseUrl:backend});
 const capture=await capturePublicationInputs(db,origin);
 const values=await (await fetch(backend+'/fixture/records')).json();const record=values[0].record;
 const targets=buildAutomaticTargets({...capture,origin,after:capture.before,records:[record],generations:{[record.identity.key]:1}});
 const proof=await verifyPublishedPages(targets,fetch);
 assert.equal(proof.observations.length,targets.length);
 for(const path of ['/stocks/FIX','/zh/stocks/FIX']){
  const html=await (await fetch(origin+path)).text();assert(html.includes('data-valuation-revision="'+record.revisionId+'"'));assert(html.includes(fmtPerShareValue(record.intrinsicValue)),'detail raw IV in actual HTML');
 }
 const bad=structuredClone(targets);bad[0].expectedSourceDigest='0'.repeat(64);
 await assert.rejects(verifyPublishedPages(bad,fetch),/Publication remains pending/,'old cache stays unconfirmed');
 await assert.rejects(verifyPublishedPages(targets,async()=>new Response('fixture server failure',{status:500}) as Response),/Publication remains pending/,'500 stays unconfirmed');
 console.log(`valuation-rendered-proof PASS: ${proof.observations.length} actual bilingual route/cache-unit projections; stale/500 refuse proof`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
