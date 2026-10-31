import 'server-only';
import { readHomeEvidence } from '../home/readCompanyExamples';
import { currentStockKeys, type LinkHolder } from '../stocks/stockLinks';

import { consensusHeld, mostHeld, notableMoves } from '../aggregations';
import { getManagerIndex, getManagerDetail } from '../managers/source';
import { getCusipMap } from '../managers/securities';
import { getDb, selectAllPages } from '../managers/db';
import { isLikelyTicker } from '../externalLinks';
import { investorSelection } from './publicationProjection';
/** Same route inputs as SSR, captured once per producer batch. Full current manager
 * inventory is conservative bootstrap coverage for cache memberships before this protocol. */
export async function readPublicationSelections(){
 const [stocks,consensus,moves,index,cusips,screen]=await Promise.all([consensusHeld(),mostHeld(50),notableMoves(30),getManagerIndex(),getCusipMap(),selectAllPages<{ticker:string;issuer:string;holder_count:number}>(()=>getDb().from('consensus_holdings').select('ticker,issuer,holder_count').order('ticker'))]);
 if(screen.error)throw new Error('Publication screen selection unavailable');
 const cusipToTicker=new Map([...cusips].flatMap(([cusip,info])=>info.ticker&&isLikelyTicker(info.ticker)?[[cusip,info.ticker] as const]:[]));
 const investors=[];
 for(const manager of index.managers){const detail=await getManagerDetail(manager.slug);if(!detail)throw new Error('Publication investor selection unavailable');investors.push({slug:manager.slug,...investorSelection(detail.latest.holdings,cusipToTicker)});}
 const homeEvidence=await readHomeEvidence();
 // A valid public valuation may have a current detail holder before the
 // consensus aggregate catches up. Capture actual route eligibility independently.
 const linkRows=await selectAllPages<LinkHolder>(()=>getDb().from('consensus_stock_holders').select('ticker,kind,period').order('ticker').order('cik').order('kind'));
 if(linkRows.error)throw new Error('Publication detail destination selection unavailable');
 const screenAvailableStocks=currentStockKeys(linkRows.data,new Date());
 return {homeEvidence,screenAvailableStocks,stocks,consensus,moves,cusipToTicker,investors,screenHoldings:new Map(screen.data.map(row=>[row.ticker,{issuer:row.issuer??row.ticker,holderCount:row.holder_count??0}]))};
}
export type PublicationSelections=Awaited<ReturnType<typeof readPublicationSelections>>;
