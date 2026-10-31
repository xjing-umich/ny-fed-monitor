import "server-only";
import { cache } from "react";
import { getDb, withRetry } from "../managers/db";
import { readPublicValuationSummaries, readAllPublicValuationSummaries, PublicationUnavailableError } from "./publishedRead";
import type { VerdictBucket, VerdictCoverage } from "./deriveValuationVerdict";
import type { ValuationMethods } from "./deriveValuationMethods";
import type { ExpectationsAssessment, MoatCapAssessment } from "./types";
import { snapshot, projectStrike, projectScreen, type PublicationStamp } from "./publicationProjection";
import type { TrackingRecord } from "./trackingContract";

export type SnapshotVerdict = {
  ticker: string;
  publication: PublicationStamp;
  intrinsicValue: number | null;
  referenceValue: number | null;
  referenceKind: TrackingRecord["referenceKind"];
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

export type StrikeLeader = SnapshotVerdict;

export type ScreenView = "strike_zone" | "below" | "all" | "conviction";

export type ScreenerRow = SnapshotVerdict & { issuer:string;holderCount:number };

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
export const readAllSnapshots = cache(async ():Promise<SnapshotVerdict[]> => [...(await readAllPublicValuationSummaries()).values()].map(snapshot));
export const readStrikeZoneLeaders = cache(async (limit:number) => projectStrike(await readAllSnapshots(),limit));
async function holders(tickers:string[]):Promise<Map<string,{issuer:string;holderCount:number}>> {
  const out=new Map<string,{issuer:string;holderCount:number}>();
  for (let from=0;from<tickers.length;from+=100) {
    const {data,error}=await withRetry(()=>getDb().from("consensus_holdings").select("ticker,issuer,holder_count").in("ticker",tickers.slice(from,from+100)));
    if (error) throw new PublicationUnavailableError("database_unavailable",error.message);
    for (const row of data ?? []) out.set(row.ticker.toUpperCase(),{issuer:row.issuer ?? row.ticker,holderCount:row.holder_count ?? 0});
  }
  return out;
}
export const readScreenInputs = cache(async () => {const values=await readAllSnapshots();return {values,holdings:await holders(values.map(v=>v.ticker))};});
function newest(rows:SnapshotVerdict[]):string|null {return rows.reduce<string|null>((date,row)=>!date || row.computedAt>date ? row.computedAt : date,null);}
export const readValuationScreen = cache(async (view:ScreenView) => {
 const {values,holdings}=await readScreenInputs();const counts=projectStrike(values,0);const rows=projectScreen(values,holdings,view);
 return {rows,strikeTotal:counts.total,strikePending:counts.pending,computedAt:newest(rows)};
});
export const readConvictionScreen = cache(async () => {const screen=await readValuationScreen("conviction");return {rows:screen.rows,heldTotal:screen.rows.length,computedAt:screen.computedAt};});
