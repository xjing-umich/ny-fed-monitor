import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readPublicationInventory } from '../lib/publicationProducer';
import { createPublicationClient, publicationManifest } from '../lib/trackingPublication';
import { publicationFixture } from './publication-fixture';
import { snapshot, projectionDigest } from '../../src/lib/valuation/publicationProjection';
async function main(){
 const producer=await import('../lib/publicationProducer').catch(()=>({buildAutomaticTargets:undefined}));
 assert.equal(typeof producer.buildAutomaticTargets,'function','automatic producer must exist before any candidate replacement');
 assert.throws(()=>projectionDigest('invalid',[NaN],{}),/finite/,'nonfinite inputs cannot be silently normalized into a proof');
 const fixture=publicationFixture({ticker:'FIX',verdict_bucket:'below',in_strike_zone:true,range_lo:60,range_hi:150,price:50,margin_pct:.6,reliable:true});
 const published=fixture.valuation_publication.public_result;
 const values=[snapshot(published)];
 const selection={stocks:[{cusip:'FIX',issuer:'Fixture',holderCount:10,totalValue:100}],cusipToTicker:new Map([['000000001','FIX']]),consensus:[{cusip:'FIX',issuer:'Fixture',holderCount:10,totalValue:100}],screenHoldings:new Map([['FIX',{issuer:'Fixture',holderCount:10}]]),investors:[{slug:'fixture-manager',holdings:[{cusip:'000000001',issuer:'Fixture',value:100,shares:2}],displayHoldings:[{cusip:'000000001',issuer:'Fixture',value:100,shares:2}],tickers:['FIX']}],moves:{mostBought:[],mostSold:[]}};
 const targets=producer.buildAutomaticTargets!({origin:'http://localhost:31486',before:values,after:values,selection,records:[published.record],generations:{[published.record.identity.key]:2},outstanding:[]});
 assert(targets.some((t:{path:string})=>t.path==='/investors/fixture-manager'));
 assert(targets.some((t:{path:string})=>t.path==='/stocks/screener?view=strike_zone&sort=holders'));
 assert(!targets.some((t:{path:string})=>t.path.startsWith('/stocks?')),'client pagination is one ISR dataset');
 const withUnrelated={...selection,investors:[...selection.investors,{slug:'unrelated-manager',holdings:[],displayHoldings:[],tickers:[]}]};
 const knownInput={origin:'http://localhost:31486',before:values,after:values,selection:withUnrelated,records:[published.record],generations:{[published.record.identity.key]:2},outstanding:[],completed:[{manifest:publicationManifest(targets),verifiedAt:'2026-10-30T00:00:00Z'}]};
 assert(!producer.buildAutomaticTargets!(knownInput).some((t:{path:string})=>t.path==='/investors/unrelated-manager'),'confirmed inventory avoids unrelated investor warming');
 const absent=structuredClone(targets[0]);absent.path='/investors/unrelated-manager';absent.url='http://localhost:31486'+absent.path;absent.expectations[0].presence='absent';
 assert(producer.buildAutomaticTargets!({...knownInput,outstanding:[{targets:[absent]}]}).some((t:{path:string})=>t.path===absent.path),'outstanding absent expectation remains an obligation');
 const old=structuredClone(targets.find((t:{path:string})=>t.path==='/investors/fixture-manager')!);old.path='/investors/retired-manager';old.url='http://localhost:31486'+old.path;old.expectations[0].presence='absent';
 assert.throws(()=>producer.buildAutomaticTargets!({origin:'http://localhost:31486',before:values,after:values,selection,records:[published.record],generations:{[published.record.identity.key]:2},outstanding:[{targets:[old]}]}),/retired-manager/,'unknown historical routes must never be silently dropped');
 // A completed manager membership must survive a later holding exit, even
 // though both current before/after projections use the newer holdings dataset.
 const completed=[{manifest:publicationManifest(targets),verifiedAt:'2026-10-30T00:00:00Z'}];
 const exited={...withUnrelated,investors:withUnrelated.investors.map(i=>({...i,holdings:[],displayHoldings:[],tickers:[]}))};
 const exitInput={...knownInput,selection:exited,completed};
 const exitTargets=producer.buildAutomaticTargets!(exitInput);
 const exitTarget=exitTargets.find((t:{path:string})=>t.path==='/investors/fixture-manager');
 assert(exitTarget,'completed holder route remains required after security exits');
 assert.equal(exitTarget.expectations[0].presence,'absent','exit needs actual absence proof');
 const removed={...exited,investors:exited.investors.filter(i=>i.slug!=='fixture-manager')};
 assert.throws(()=>producer.buildAutomaticTargets!({...exitInput,selection:removed}),/fixture-manager/,'deleted previously present route cannot disappear before absence proof');
 const completedAbsence=[...completed,{manifest:publicationManifest(exitTargets),verifiedAt:'2026-10-31T00:00:00Z'}];
 assert(!producer.buildAutomaticTargets!({...exitInput,selection:removed,completed:[...completedAbsence].reverse()}).some((t:{path:string})=>t.path==='/investors/fixture-manager'),'completed absence releases the historical holder obligation');
 // Actual inventory reader: an old holder proof must survive beyond a recent
 // window and Supabase's 1000-row page cap. Superseded intents are not evidence.
 const ledgerRows=[
   {manifest:completed[0].manifest,verified_at:completed[0].verifiedAt,completed_at:completed[0].verifiedAt,superseded_by:null},
   ...Array.from({length:1000},()=>({manifest:publicationManifest([targets.find(t=>t.path==='/stocks')!]),verified_at:'2026-10-31T00:00:00Z',completed_at:'2026-10-31T00:00:00Z',superseded_by:null})),
   {manifest:publicationManifest([old]),verified_at:'2026-10-31T00:00:00Z',completed_at:'2026-10-31T00:00:00Z',superseded_by:'successor'},
 ];
 let ledgerReads=0;let transitionMode=false;let transitionComplete=false;
 const server=createServer(async(req,res)=>{
   ledgerReads++;
   const url=new URL(req.url!,'http://fixture');
   if(transitionMode){
     res.setHeader('content-type','application/json');
     if(!url.searchParams.has('completed_at')){
       res.end(JSON.stringify([{...ledgerRows[0],completed_at:null}]));
       transitionComplete=true;
       return;
     }
     if(url.searchParams.get('completed_at')==='is.null'){
       await new Promise(resolve=>setTimeout(resolve,20));
       res.end(JSON.stringify(transitionComplete?[]:[{manifest:completed[0].manifest}]));
       transitionComplete=true;
     }else{
       res.end(JSON.stringify(transitionComplete?[ledgerRows[0]]:[]));
       transitionComplete=true;
     }
     return;
   }
   const selected=ledgerRows.filter(row=>url.searchParams.get('superseded_by')!=='is.null'||row.superseded_by===null);
   const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??1000);
   res.setHeader('content-type','application/json');res.end(JSON.stringify(selected.slice(offset,offset+limit)));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
   const backend=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
   const {completed:inventory}=await readPublicationInventory(createPublicationClient(backend,'fixture-only',{origin:knownInput.origin,supabaseUrl:backend}),knownInput.origin);
   assert.equal(inventory.length,1001);assert.equal(ledgerReads,2,'complete history must paginate');
   const retained=producer.buildAutomaticTargets!({...exitInput,completed:inventory});
   assert(retained.some(t=>t.path==='/investors/fixture-manager'),'oldest completed membership survives full-history capture');
   assert(!retained.some(t=>t.path==='/investors/retired-manager'),'superseded unproved manifest cannot invent a historical membership');
   transitionMode=true;
   const beforeTransitionReads=ledgerReads;
   const crossing=await readPublicationInventory(createPublicationClient(backend,'fixture-only',{origin:knownInput.origin,supabaseUrl:backend}),knownInput.origin);
   assert(crossing.outstanding.length||crossing.completed.length,'pending-to-completed transition cannot fall between two inventory reads');
   assert.equal(ledgerReads-beforeTransitionReads,1,'one inventory scan derives both pending and completed obligations');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
 console.log('valuation-producer: shared projections, canonical variants, bootstrap and historical obligations PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
