/** Actual bilingual local SSR reference/availability acceptance; synthetic fixture only. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import { refreshTrackingPublicationPaths } from '../lib/valuationPublication';
import type { TrackingRecord } from '../../src/lib/valuation/trackingContract';
const origin=process.argv[2];
const backend=readFileSync('/tmp/task6-fixture-origin','utf8');
assert(new URL(origin).hostname==='localhost');
assert(new URL(backend).hostname==='127.0.0.1');
const paths=['/','/zh','/stocks/screener?sort=holders','/zh/stocks/screener?sort=holders'];
function content(node:DefaultTreeAdapterTypes.Node):string {
 if('value' in node)return node.value;
 return 'childNodes' in node?node.childNodes.map(content).join(' '):'';
}
function region(html:string,revision:string):string|null {
 let found:string|null=null;
 function walk(node:DefaultTreeAdapterTypes.Node){
  if('tagName' in node){if(['head','script'].includes(node.tagName))return;
   if(node.attrs.some(a=>a.name==='data-valuation-revision'&&a.value===revision)){const text=content(node);if(!found||text.length>found.length)found=text;}
  }if('childNodes' in node)node.childNodes.forEach(walk);
 }walk(parse(html));return found;
}
async function main(){
 const record=await (await fetch(backend+'/fixture/reference?ticker=MSFT')).json() as TrackingRecord;
 assert.equal(record.status,'pending');assert.equal(record.intrinsicValue,null);
 assert.equal(record.referenceKind,'zero_growth_floor');assert.equal(record.marginPct,null);
 assert.equal(record.strikePrice,null);assert.equal(record.inStrikeZone,null);
 await refreshTrackingPublicationPaths(origin,paths,'task6-fixture-secret');
 for(const lang of ['en','zh']){
  const response=await fetch(origin+(lang==='zh'?'/zh':'')+'/stocks/screener?sort=holders');
  assert.equal(response.status,200);const row=region(await response.text(),record.revisionId);
  assert(row,'pending reference stays in actual public SSR numeric rows');
  assert.match(row,/60/);assert.match(row,/90/);assert.match(row,/ADS/);
  assert.match(row,lang==='zh'?/待确认/:/pending/i);
  assert.doesNotMatch(row,lang==='zh'?/内在价值/:/Intrinsic value/);
 }
 const state=await (await fetch(origin+'/api/valuation/state?tickers=MSFT')).json();
 assert.notEqual(state.states[0].status,'valid');assert.equal(state.states[0].revisionId,record.revisionId);
 await fetch(backend+'/fixture/state?failure=1');
 await refreshTrackingPublicationPaths(origin,paths,'task6-fixture-secret');
 for(const path of paths){
  const response=await fetch(origin+path);assert.equal(response.status,200);
  const html=await response.text();
  assert.match(content(parse(html)),path.startsWith('/zh')?/估值.*不可用/:/Valuation is unavailable/);
  assert.equal(region(html,record.revisionId),null,'unavailable read cannot publish a normal stale numeric row');
 }
 await fetch(backend+'/fixture/state?failure=0');
 await refreshTrackingPublicationPaths(origin,paths,'task6-fixture-secret');
 for(const path of paths)assert.equal((await fetch(origin+path)).status,200);
 console.log('valuation-integration-states PASS: bilingual pending reference/ADS/raw range, no IV/strike/baseline, explicit unavailable and restoration');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
