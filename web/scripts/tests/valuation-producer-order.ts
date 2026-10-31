import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { publicationFixture } from './publication-fixture';
import { snapshot, publishValuationCandidates } from '../lib/publicationProducer';
import { createPublicationClient, type PublicationManifest } from '../lib/trackingPublication';
async function main(){
 const candidates=['FIX','FIA'].map((ticker,i)=>publicationFixture({ticker,verdict_bucket:'below',in_strike_zone:true,range_lo:60,range_hi:150,price:50,margin_pct:.5,reliable:true},i+1).valuation_publication.public_result);
 const before=candidates.map(snapshot);const events:string[]=[];let durable:PublicationManifest|null=null;let failPrepare=false;let conflict=false;
 const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);res.setHeader('content-type','application/json');
  if(req.url?.endsWith('prepare_tracking_publication_v1')){events.push('prepare');if(failPrepare){res.statusCode=503;res.end('{"code":"08006","message":"fixture failed prepare"}');return;}durable=body.p_manifest;res.end(JSON.stringify(durable!.intentId));return;}
  assert(durable,'durable complete intent must precede every candidate replacement');assert.equal(durable.targets.length,28);events.push('write:'+body.p_identity.ticker);
  if(conflict&&body.p_identity.ticker==='FIA'){res.statusCode=409;res.end('{"code":"40001","message":"fixture CAS conflict"}');return;}res.end(String(body.p_expected_generation+1));
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const backend=`http://127.0.0.1:${(server.address() as {port:number}).port}`;const origin='http://localhost:31486';const db=createPublicationClient(backend,'fixture-only',{origin,supabaseUrl:backend});
 const selection={stocks:[],cusipToTicker:new Map(),consensus:[],screenHoldings:new Map(),investors:[],moves:{mostBought:[],mostSold:[]}};
 const run=()=>publishValuationCandidates(db,{candidates,state:new Map(candidates.map(c=>[c.record.identity.ticker,{identity:c.record.identity,generation:1}])),publication:{origin,seeds:new Set(candidates.map(c=>c.record.identity.key)),capture:{before,selection,outstanding:[]},current:before}});
 try{
  failPrepare=true;await assert.rejects(run(),/intent failed/);assert.deepEqual(events,['prepare'],'prepare failure stops all candidate writes');
  failPrepare=false;events.length=0;conflict=true;await assert.rejects(run(),/40001/);assert.deepEqual(events,['prepare','write:FIX','write:FIA']);assert(durable,'CAS failure retains saved complete manifest');
  conflict=false;events.length=0;await run();assert.deepEqual(events,['prepare','write:FIX','write:FIA']);
  console.log('valuation-producer-order PASS: prepare commit before every CAS; failed prepare no writes; partial conflict preserves durable obligations');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
