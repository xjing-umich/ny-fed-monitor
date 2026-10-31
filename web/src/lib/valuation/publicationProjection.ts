import 'server-only';
import { holdingsSplit } from '../managers/investorConclusion';
import { deriveValuationPosture, POSTURE_LIMIT } from '../managers/valuationPosture';
import type { PublishedValuation, PublishedValuationSummary } from './publishedRead';
import type { SnapshotVerdict, ScreenView, ScreenerRow } from './valuationSnapshot';
import { publicationSourceDigest, publicationRowAttributes } from './publicationProof';
import { deriveFusionSignal, CONSENSUS_MIN } from '../managers/fusionSignal';
import { sortScreenerRows, type ScreenSort } from './screenerSort';
import { sortByKey, visibleSlice } from '../../components/list/listRows';
import type { HeldRow } from '../aggregations';

export type PublicationStamp = { identityKey:string; revisionId:string; ticker:string; priceDate:string|null; computedAt:string; attributes:Record<string,string> };
export function publicationStamp(value:PublishedValuation|PublishedValuationSummary):PublicationStamp {
 const r=value.record;
 return {identityKey:r.identity.key,revisionId:r.revisionId,ticker:r.identity.ticker,priceDate:r.priceDate,computedAt:r.computedAt,attributes:publicationRowAttributes({identityKey:r.identity.key,revisionId:r.revisionId})};
}
export function snapshot(value:PublishedValuation|PublishedValuationSummary):SnapshotVerdict {
 const r=value.record;const p='presentation' in value ? value.presentation:value;
 const moatCap='presentation' in value ? value.presentation.oeDcf?.moatCap:value.moatCap;
 return {ticker:r.identity.ticker,bucket:p.verdict!.bucket,inStrikeZone:p.verdict!.inStrikeZone,
  rangeLo:r.rangeLo!,rangeHi:r.rangeHi!,price:r.price!,priceDate:r.priceDate!,marginPct:r.marginPct,
  intrinsicValue:r.intrinsicValue,referenceValue:r.referenceValue,referenceKind:r.referenceKind,
  coverage:p.verdict!.coverage,reliable:r.status==='valid',computedAt:r.computedAt,
  expectations:p.expectations,moatCap,methods:p.methods,publication:publicationStamp(value)};
}
export function marginSort(a:SnapshotVerdict,b:SnapshotVerdict):number {return (b.marginPct??-Infinity)-(a.marginPct??-Infinity)||a.ticker.localeCompare(b.ticker);}
export function projectStrike(values:SnapshotVerdict[],limit:number){return {
 total:values.filter(v=>v.inStrikeZone&&v.reliable).length,pending:values.filter(v=>v.inStrikeZone&&!v.reliable).length,
 leaders:values.filter(v=>v.inStrikeZone&&v.reliable).sort(marginSort).slice(0,Math.max(0,limit))};}
export function projectScreen(values:SnapshotVerdict[],holdings:Map<string,{issuer:string;holderCount:number}>,view:ScreenView,sort:ScreenSort='margin'){
 const all:ScreenerRow[]=values.map(v=>({...v,issuer:holdings.get(v.ticker)?.issuer??v.ticker,holderCount:holdings.get(v.ticker)?.holderCount??0}));
 const rows=all.filter(v=>view==='strike_zone'?v.inStrikeZone&&v.reliable:view==='below'?v.bucket==='below'&&v.reliable:view==='conviction'?v.holderCount>=CONSENSUS_MIN:true).sort(view==='conviction'?(a,b)=>deriveFusionSignal({holderCount:a.holderCount,verdict:a}).attractivenessRank-deriveFusionSignal({holderCount:b.holderCount,verdict:b}).attractivenessRank||marginSort(a,b):marginSort);
 return sortScreenerRows(rows,view==='conviction'?'margin':sort);
}
export function projectStockRows(rows:HeldRow[],cusipToTicker:Map<string,string>,values:SnapshotVerdict[]){
 const bargains=new Map(values.filter(v=>v.reliable&&(v.inStrikeZone||v.bucket==='below')&&v.marginPct!=null&&v.marginPct>0).map(v=>[v.ticker,v]));
 const maxHolders=rows[0]?.holderCount??1;
 return rows.map(row=>{const ticker=cusipToTicker.get(row.cusip)??row.cusip;const v=bargains.get(ticker.toUpperCase());return {
 ticker,issuer:row.issuer,holderCount:row.holderCount,totalValue:row.totalValue,barWidth:Math.round(row.holderCount/maxHolders*32),
 bargain:v?{inStrikeZone:v.inStrikeZone,marginPct:v.marginPct!,publication:v.publication}:null};});
}
export function initialStockRows<T extends {holderCount:number;totalValue:number}>(rows:T[]):T[]{return visibleSlice(sortByKey(rows,'holders','desc',{holders:r=>r.holderCount,value:r=>r.totalValue}),1,'desktop');}
/** Hash the complete serialized render input before any visual limit/page slicing. Undefined
 * optional DTO properties are omitted exactly as in the React transport. No DB lookup here. */
export function projectionDigest(kind:string,values:unknown,selection:unknown):string {
 function finiteInput(value:unknown):unknown {
  if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Publication inputs must be finite');
  if(Array.isArray(value))return value.map(finiteInput);
  if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)
   return Object.fromEntries(Object.entries(value).filter(([,entry])=>entry!==undefined).map(([key,entry])=>[key,finiteInput(entry)]));
  return value;
 }
 return publicationSourceDigest(finiteInput({kind,values,selection}));
}
export function screenerPath(lang:'en'|'zh',view:ScreenView,sort:ScreenSort):string {
 const query=new URLSearchParams();if(view!=='all')query.set('view',view);if(sort==='holders'&&view!=='conviction')query.set('sort',sort);
 return `${lang==='zh'?'/zh':''}/stocks/screener${query.size?'?'+query:''}`;
}
export function investorSelection(holdings:import('../managers/types').Holding[],cusipToTicker:Map<string,string>){
 const longHoldings=holdings.filter(h=>!h.putCall);
 return {holdings:longHoldings,displayHoldings:holdings,tickers:longHoldings.map(h=>cusipToTicker.get(h.cusip)).filter((t):t is string=>Boolean(t))};
}
export function selectedValuations(values:SnapshotVerdict[],tickers:string[]){const keys=new Set(tickers.map(t=>t.toUpperCase()));return values.filter(v=>keys.has(v.ticker)).sort((a,b)=>a.publication.identityKey.localeCompare(b.publication.identityKey));}
/** Exact valuation row membership of the investor page: capped holdings table plus
 * the existing posture lists. The digest still includes all input holdings/values. */
export function investorRenderedValues(selection:ReturnType<typeof investorSelection>,values:SnapshotVerdict[],cusipToTicker:Map<string,string>){
 const sorted=[...selection.displayHoldings].sort((a,b)=>b.value-a.value);const {shown,folded}=holdingsSplit(sorted);
 const verdicts=new Map(values.map(v=>[v.ticker,v]));
 const posture=deriveValuationPosture({holdings:selection.holdings,cusipToTicker,verdicts});
 const tickers=[...[...shown,...folded].map(h=>cusipToTicker.get(h.cusip)).filter((t):t is string=>!!t),...posture.cheap.slice(0,POSTURE_LIMIT).map(h=>h.ticker),...posture.pending.map(h=>h.ticker)];
 return selectedValuations(values,tickers);
}
