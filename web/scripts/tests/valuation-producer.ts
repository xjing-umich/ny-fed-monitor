import assert from 'node:assert/strict';
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
 const knownInput={origin:'http://localhost:31486',before:values,after:values,selection:withUnrelated,records:[published.record],generations:{[published.record.identity.key]:2},outstanding:[],knownInventoryKeys:[published.record.identity.key]};
 assert(!producer.buildAutomaticTargets!(knownInput).some((t:{path:string})=>t.path==='/investors/unrelated-manager'),'confirmed inventory avoids unrelated investor warming');
 const absent=structuredClone(targets[0]);absent.path='/investors/unrelated-manager';absent.url='http://localhost:31486'+absent.path;absent.expectations[0].presence='absent';
 assert(producer.buildAutomaticTargets!({...knownInput,outstanding:[{targets:[absent]}]}).some((t:{path:string})=>t.path===absent.path),'outstanding absent expectation remains an obligation');
 const old=structuredClone(targets.find((t:{path:string})=>t.path==='/investors/fixture-manager')!);old.path='/investors/retired-manager';old.url='http://localhost:31486'+old.path;old.expectations[0].presence='absent';
 assert.throws(()=>producer.buildAutomaticTargets!({origin:'http://localhost:31486',before:values,after:values,selection,records:[published.record],generations:{[published.record.identity.key]:2},outstanding:[{targets:[old]}]}),/retired-manager/,'unknown historical routes must never be silently dropped');
 console.log('valuation-producer: shared projections, canonical variants, bootstrap and historical obligations PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
