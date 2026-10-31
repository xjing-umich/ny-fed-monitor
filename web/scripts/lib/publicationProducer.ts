import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllSnapshots } from '../../src/lib/valuation/valuationSnapshot';
import { readPublicValuationSummaries } from '../../src/lib/valuation/publishedRead';
import { readPublicationWriteState, writeValuationPublication } from '../../src/lib/valuation/publishedAdapter';
import { readPublicationSelections, type PublicationSelections } from '../../src/lib/valuation/publicationSelections';
import { projectStrike, projectScreen, projectStockRows, initialStockRows, projectionDigest, screenerPath, selectedValuations, investorRenderedValues, snapshot } from '../../src/lib/valuation/publicationProjection';
import type { SnapshotVerdict, ScreenView } from '../../src/lib/valuation/valuationSnapshot';
import type { TrackingRecord } from '../../src/lib/valuation/trackingContract';
import { selectAllPages } from '../../src/lib/managers/db';
import { publicationTargets, prepareTrackingPublication, type PublicationManifest, type PublicationRouteSnapshot, type PublicationTarget } from './trackingPublication';
import { LIST_PAGE_SIZE } from '../../src/components/list/listQuery';

type ProducerInput={origin:string;before:SnapshotVerdict[];after:SnapshotVerdict[];selection:PublicationSelections;records:TrackingRecord[];generations:Record<string,number>;outstanding:Pick<PublicationManifest,'targets'>[];knownInventoryKeys?:string[]};
function routes(values:SnapshotVerdict[],selection:PublicationSelections,records:TrackingRecord[]):PublicationRouteSnapshot[]{
 const out:PublicationRouteSnapshot[]=[];
 const add=(path:string,language:'en'|'zh',sourceDigest:string,rows:SnapshotVerdict[])=>out.push({path,language,sourceDigest,members:rows.map(v=>({identityKey:v.publication.identityKey,revisionId:v.publication.revisionId}))});
 for(const language of ['en','zh'] as const){
  const prefix=language==='zh'?'/zh':'';
  add(prefix||'/',language,projectionDigest('home',values,{limit:6}),projectStrike(values,6).leaders);
  const stocks=projectStockRows(selection.stocks,selection.cusipToTicker,values);
  const initial=initialStockRows(stocks);const initialKeys=new Set(initial.flatMap(r=>r.bargain?[r.bargain.publication.identityKey]:[]));
  add(prefix+'/stocks',language,projectionDigest('stocks',stocks,{sort:'holders',dir:'desc',pageSize:LIST_PAGE_SIZE}),values.filter(v=>initialKeys.has(v.publication.identityKey)));
  for(const view of ['all','below','strike_zone','conviction'] as ScreenView[])for(const sort of view==='conviction'?['margin'] as const:['margin','holders'] as const){
   // Only the valuation-matched holdings collection is part of the renderer input.
   const holdings=new Map(values.map(v=>[v.ticker,selection.screenHoldings.get(v.ticker)]).filter((entry):entry is [string,{issuer:string;holderCount:number}]=>!!entry[1]));
   add(screenerPath(language,view,sort),language,projectionDigest('screener',values,{holdings:[...holdings].sort(([a],[b])=>a.localeCompare(b)),view,sort}),projectScreen(values,holdings,view,sort));
  }
  const consensus=selectedValuations(values,selection.consensus.map(r=>r.cusip));
  add(prefix+'/investors/consensus',language,projectionDigest('consensus',consensus,{rows:selection.consensus}),consensus);
  for(const investor of selection.investors){const rows=selectedValuations(values,investor.tickers);add(prefix+'/investors/'+investor.slug,language,projectionDigest('investor',rows,{holdings:investor.holdings,displayHoldings:investor.displayHoldings,tickers:investor.tickers}),investorRenderedValues(investor,rows,selection.cusipToTicker));}
  for(const side of ['buy','sell'] as const){const rows=side==='buy'?selection.moves.mostBought:selection.moves.mostSold;add(prefix+'/investors/'+(side==='buy'?'buys':'sells'),language,projectionDigest('moves',[],{side,rows}),[]);}
  for(const record of records){const value=values.find(v=>v.publication.identityKey===record.identity.key);add(prefix+'/stocks/'+record.identity.ticker,language,projectionDigest('detail',value?record:null,{ticker:record.identity.ticker}),value?[value]:[]);}
 }
 return out;
}
export function buildAutomaticTargets(input:ProducerInput):PublicationTarget[]{
 const before=routes(input.before,input.selection,input.records),after=routes(input.after,input.selection,input.records);
 // Bootstrap inventories every actual route; conservative absent obligations are explicit
 // targets, not invented old memberships. Outstanding `absent` targets still count.
 const base=publicationTargets(input.records,{schemaVersion:1,origin:input.origin,watchedSecurityKeys:input.records.map(r=>r.identity.key),generations:input.generations,before,after});
 const targets=new Map(base.map(t=>[t.path,t]));
 const known=new Set(input.knownInventoryKeys??[]);
 for(const route of after){
  const bootstrap=input.records.filter(r=>!known.has(r.identity.key));
  if(!bootstrap.length)continue;
  const target=targets.get(route.path)??{url:new URL(route.path,input.origin).href,path:route.path,language:route.language,expectedSourceDigest:route.sourceDigest,expectations:[]};
  for(const r of bootstrap)if(!target.expectations.some(e=>e.identityKey===r.identity.key))target.expectations.push({identityKey:r.identity.key,revisionId:r.revisionId,generation:input.generations[r.identity.key],presence:route.members.some(m=>m.identityKey===r.identity.key)?'present':'absent'});
  targets.set(route.path,target);
 }
 for(const manifest of input.outstanding)for(const old of manifest.targets){
  const relevant=old.expectations.filter(e=>input.records.some(r=>r.identity.key===e.identityKey));if(!relevant.length)continue;
  let target=targets.get(old.path);
  if(!target){const route=after.find(r=>r.path===old.path);if(!route)throw new Error(`Historical publication route requires reconciliation: ${old.path}`);
    target={url:new URL(route.path,input.origin).href,path:route.path,language:route.language,expectedSourceDigest:route.sourceDigest,expectations:[]};targets.set(route.path,target);}

  for(const expectation of relevant)if(!target.expectations.some(e=>e.identityKey===expectation.identityKey)){
   const record=input.records.find(r=>r.identity.key===expectation.identityKey)!;const route=after.find(r=>r.path===target.path)!;
   target.expectations.push({identityKey:record.identity.key,revisionId:record.revisionId,generation:input.generations[record.identity.key],presence:route.members.some(m=>m.identityKey===record.identity.key)?'present':'absent'});
  }
 }
 return [...targets.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
export async function readOutstandingPublicationIntents(db:SupabaseClient){
 const {data,error}=await selectAllPages<{manifest:PublicationManifest}>(()=>db.from('tracking_publication_intents').select('manifest').is('completed_at',null).is('superseded_by',null).order('prepared_at').order('intent_id'));
 if(error)throw new Error('Outstanding publication intents unavailable');return data.map(row=>row.manifest);
}
export async function capturePublicationInputs(db:SupabaseClient,origin?:string){
 const [before,selection,outstanding,completed]=await Promise.all([readAllSnapshots(),readPublicationSelections(),readOutstandingPublicationIntents(db),db.from('tracking_publication_intents').select('manifest').not('completed_at','is',null).order('completed_at',{ascending:false}).limit(20)]);
 if(completed.error)throw new Error('Confirmed route inventory unavailable');
 // A verified complete manifest establishes the inventory. A bounded recent lookup is
 // sufficient for optimization; keys outside it conservatively bootstrap again.
 const knownInventoryKeys=[...new Set((completed.data??[]).filter(row=>(row.manifest as PublicationManifest).origin===origin).flatMap(row=>(row.manifest as PublicationManifest).generations.map(g=>g.identityKey)))];
 return {before,selection,outstanding,knownInventoryKeys};
}
export async function prepareAutomaticPublication(db:SupabaseClient,input:ProducerInput){
 if(!input.records.length)return null;
 return prepareTrackingPublication(db,buildAutomaticTargets(input));
}
/** Reconcile stale aggregate digests / partial batch CAS using actual current inputs, while
 * retaining every old URL/key obligation. The prior immutable intents are never overwritten. */
export async function reconcileAutomaticPublication(db:SupabaseClient,origin:string,seeds:Set<string>){
 const capture=await capturePublicationInputs(db,origin);const state=await readPublicationWriteState(db);
 const tickers=[...state].filter(([,s])=>seeds.has(s.identity.key)).map(([ticker])=>ticker);
 const values=await readPublicValuationSummaries(tickers);const records=[...values.values()].map(v=>v.record).filter(r=>r.status==='valid');
 const generations=Object.fromEntries(records.map(r=>[r.identity.key,state.get(r.identity.ticker)!.generation]));
 return prepareAutomaticPublication(db,{...capture,origin,after:capture.before,records,generations});
}
export { snapshot };

/** One boundary for the pre-write ordering guarantee, used by ingestion and its RPC test. */
export async function publishValuationCandidates(db:SupabaseClient,args:{
 candidates:import('../../src/lib/valuation/publishedRead').PublishedValuation[];
 state:Awaited<ReturnType<typeof readPublicationWriteState>>;
 publication?:{origin:string;seeds:Set<string>;capture:Omit<Awaited<ReturnType<typeof capturePublicationInputs>>,'knownInventoryKeys'> & {knownInventoryKeys?:string[]};current:SnapshotVerdict[]};
 onWritten?:()=>void;
}){
 const {candidates,state,publication}=args;
 if(publication){
  const after=new Map(publication.current.map(v=>[v.ticker,v]));
  for(const candidate of candidates)after.set(candidate.record.identity.ticker,snapshot(candidate));
  const records=candidates.map(v=>v.record).filter(r=>publication.seeds.has(r.identity.key)&&r.status==='valid');
  const generations=Object.fromEntries(records.map(r=>[r.identity.key,state.get(r.identity.ticker)!.generation+1]));
  await prepareAutomaticPublication(db,{...publication.capture,origin:publication.origin,after:[...after.values()].sort((a,b)=>a.publication.identityKey.localeCompare(b.publication.identityKey)),records,generations});
 }
 for(const candidate of candidates){
  const prior=state.get(candidate.record.identity.ticker)!;
  prior.generation=await writeValuationPublication(db,{identity:prior.identity,expectedGeneration:prior.generation,candidate,safety:{status:candidate.record.status==='valid'?'valid':'pending',reasons:candidate.record.reasons,observedAt:candidate.record.computedAt}});
  args.onWritten?.();
 }
}
