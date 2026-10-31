import "server-only";
import { cache } from "react";
import { getDb, withRetry } from "../managers/db";
import { readPublicValuationSummaries, readAllPublicValuationSummaries, PublicationUnavailableError, type PublishedValuation, type PublishedValuationSummary } from "./publishedRead";
import type { VerdictBucket, VerdictCoverage } from "./deriveValuationVerdict";
import type { ValuationMethods } from "./deriveValuationMethods";
import type { ExpectationsAssessment, MoatCapAssessment } from "./types";
import { deriveFusionSignal, CONSENSUS_MIN } from "../managers/fusionSignal";

export type SnapshotVerdict = {
  ticker: string;
  bucket: VerdictBucket;
  inStrikeZone: boolean;
  rangeLo: number;
  rangeHi: number;
  price: number;
  priceDate: string;
  marginPct: number | null;
  coverage: VerdictCoverage;
  reliable: boolean;
  computedAt: string;
  expectations?: ExpectationsAssessment;
  moatCap?: MoatCapAssessment;
  methods?: ValuationMethods;
};

export type BargainVerdict = { inStrikeZone: boolean; marginPct: number; priceDate: string };

export type StrikeLeader = {
  ticker: string;
  rangeLo: number;
  rangeHi: number;
  marginPct: number | null;
  /** 估值所用收盘价；内在价值从统一契约直接读取。 */
  price: number;
  computedAt: string;
  /** 估值所用收盘价日期(快照 price_date);页面据此标"估值截至"。 */
  priceDate: string;
};

export type ScreenView = "strike_zone" | "below" | "all" | "conviction";

export type ScreenerRow = {
  ticker: string;
  issuer: string;
  bucket: VerdictBucket;
  inStrikeZone: boolean;
  rangeLo: number;
  rangeHi: number;
  price: number;
  priceDate: string;
  marginPct: number | null;
  coverage: VerdictCoverage;
  reliable: boolean;
  computedAt: string;
  holderCount: number;
  expectations?: ExpectationsAssessment;
};

/** Compatibility surface: every value is paired with the presentation from its own publication. */
function snapshot(value: PublishedValuation | PublishedValuationSummary): SnapshotVerdict {
  const r=value.record;
  const p="presentation" in value ? value.presentation : value;
  const moatCap="presentation" in value ? value.presentation.oeDcf?.moatCap : value.moatCap;
  return {ticker:r.identity.ticker,bucket:p.verdict!.bucket,inStrikeZone:p.verdict!.inStrikeZone,
    rangeLo:r.rangeLo!,rangeHi:r.rangeHi!,price:r.price!,priceDate:r.priceDate!,marginPct:r.marginPct,
    coverage:p.verdict!.coverage,reliable:r.status === "valid",computedAt:r.computedAt,
    expectations:p.expectations,moatCap,methods:p.methods};
}
export const readValuationVerdicts = cache(async (tickers:string[]):Promise<Map<string,SnapshotVerdict>> =>
  new Map([...(await readPublicValuationSummaries(tickers))].map(([ticker,value])=>[ticker,snapshot(value)])));

export const readBargainVerdicts = cache(async ():Promise<Map<string,BargainVerdict>> => {
  const out=new Map<string,BargainVerdict>();
  for (const value of (await readAllPublicValuationSummaries()).values()) {
    const v=snapshot(value);
    if (v.reliable && (v.inStrikeZone || v.bucket === "below") && v.marginPct != null && v.marginPct>0)
      out.set(v.ticker,{inStrikeZone:v.inStrikeZone,marginPct:v.marginPct,priceDate:v.priceDate});
  }
  return out;
});
function marginSort(a:SnapshotVerdict,b:SnapshotVerdict):number {
  return (b.marginPct ?? -Infinity)-(a.marginPct ?? -Infinity) || a.ticker.localeCompare(b.ticker);
}
function strikeCounts(values:SnapshotVerdict[]) {
  return {total:values.filter(v=>v.inStrikeZone && v.reliable).length,pending:values.filter(v=>v.inStrikeZone && !v.reliable).length};
}
export const readStrikeZoneLeaders = cache(async (limit:number):Promise<{total:number;pending:number;leaders:StrikeLeader[]}> => {
  const values=[...(await readAllPublicValuationSummaries()).values()].map(snapshot);
  return {...strikeCounts(values),leaders:values.filter(v=>v.inStrikeZone && v.reliable).sort(marginSort).slice(0,Math.max(0,limit))};
});
async function holders(tickers:string[]):Promise<Map<string,{issuer:string;holderCount:number}>> {
  const out=new Map<string,{issuer:string;holderCount:number}>();
  for (let from=0;from<tickers.length;from+=100) {
    const {data,error}=await withRetry(()=>getDb().from("consensus_holdings").select("ticker,issuer,holder_count").in("ticker",tickers.slice(from,from+100)));
    if (error) throw new PublicationUnavailableError("database_unavailable",error.message);
    for (const row of data ?? []) out.set(row.ticker.toUpperCase(),{issuer:row.issuer ?? row.ticker,holderCount:row.holder_count ?? 0});
  }
  return out;
}
function newest(rows:SnapshotVerdict[]):string|null {return rows.reduce<string|null>((date,row)=>!date || row.computedAt>date ? row.computedAt : date,null);}
export const readValuationScreen = cache(async (view:ScreenView):Promise<{rows:ScreenerRow[];strikeTotal:number;strikePending:number;computedAt:string|null}> => {
  const values=[...(await readAllPublicValuationSummaries()).values()].map(snapshot);
  const counts=strikeCounts(values);
  const filtered=values.filter(v=>view === "strike_zone" ? v.inStrikeZone && v.reliable : view === "below" ? v.bucket === "below" && v.reliable : true).sort(marginSort);
  const holdings=await holders(filtered.map(v=>v.ticker));
  const rows=filtered.map(v=>({...v,issuer:holdings.get(v.ticker)?.issuer ?? v.ticker,holderCount:holdings.get(v.ticker)?.holderCount ?? 0}));
  return {rows,strikeTotal:counts.total,strikePending:counts.pending,computedAt:newest(rows)};
});
export const readConvictionScreen = cache(async ():Promise<{rows:ScreenerRow[];heldTotal:number;computedAt:string|null}> => {
  const {rows:all}=await readValuationScreen("all");
  const rows=all.filter(row=>row.holderCount>=CONSENSUS_MIN).sort((a,b)=>
    deriveFusionSignal({holderCount:a.holderCount,verdict:a}).attractivenessRank-deriveFusionSignal({holderCount:b.holderCount,verdict:b}).attractivenessRank || marginSort(a,b));
  return {rows,heldTotal:rows.length,computedAt:newest(rows)};
});
