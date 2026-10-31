import assert from "node:assert/strict";
import { createServer } from "node:http";
import { buildTrackingRecord, type TrackingContext } from "./trackingContract";
import { VALUATION_MODEL_VERSION } from "./modelVersion";
import { runValuation, type RunValuationInput, type ValuationRun } from "./runValuation";
import { fundamentalsToFloorInput } from "./fundamentalsToFloorInput";
import { buildPublishedValuation } from "./publishedAdapter";
import { readPublicValuations, readTrackingValuations, readValuationSafety, PublicationUnavailableError } from "./publishedRead";
import { GET as safetyGet } from "../../app/api/valuation/state/route";
import { readStrikeZoneLeaders, readValuationScreen } from "./valuationSnapshot";

async function main() {
for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[key];
await assert.rejects(readPublicValuations(["GOOG"]), PublicationUnavailableError);
const today = new Date().toISOString().slice(0,10);
const context: TrackingContext = {
  identity: { key:"figi:BBG009S3NB30",ticker:"GOOG",figi:"BBG009S3NB30",cik:"0001652044",cusip:"02079K107",securityType:"Common Stock",source:"fixture",checkedAt:today },
  modelVersion: VALUATION_MODEL_VERSION,currency:"USD",perShareBasis:"ordinary:split-none",priceSource:"fixture",
  fundamentalAsOf:today,filedAt:today,computedAt:new Date().toISOString(),publishedAt:null,
  nonPriceInputs:{fundamentals:{revenue:100},assumptions:{dgs10:4,date:today},shareBasis:{adsRatio:1}},sources:[{url:"https://www.sec.gov/fixture",asOf:today}],
};
const run: ValuationRun = {currency:"USD",floor:undefined,strikeZone:undefined,oeDcf:undefined,reconciliation:undefined,
  expectations:{assessable:false,reason:"fixture"},methods:{zeroGrowthEpv:true,oeDcf:true,greenwaldGrowthCeilings:true},
  verdict:{bucket:"below",coverage:"full",reliable:true,methods:{zeroGrowthEpv:true,oeDcf:true,greenwaldGrowthCeilings:true},rangeLo:60,rangeHi:120,price:50,priceDate:today,marginPct:.5,inStrikeZone:true,intrinsicValue:100,referenceValue:100,referenceKind:"oe_dcf_neutral",requiredMargin:.38,strikePrice:62}};
const mapped = fundamentalsToFloorInput("GOOG","GOOG",[
  {fiscal_period:"FY",fiscal_year:2025,period_end:"2025-12-31",shares_diluted:100,net_income:300,revenue:1000} as never,
]);
const input: RunValuationInput={floorInput:mapped,price:{close:50,date:today,currency:"USD",source:"fixture"},dgs10:{value:4,date:today},guards:{adsSuppressed:false,fundamentalsStale:false,priceStale:false,splitCoverageStale:false}};
const provenance={...context,shareBasis:{adsRatio:1,latestSplitDate:null}};
const mappedPublished=buildPublishedValuation(runValuation(input),input,provenance);
assert.deepEqual(mappedPublished.presentation.displayBasis,{version:1,ttm:null,adsRatio:1},"publication retains explicit annual / ordinary-share explanatory basis");
const ttmInput:RunValuationInput={...input,floorInput:{...mapped,ttm:{year:{...mapped.years[0],fiscal_year:2026},period_end:"2026-03-31",quarters_used:["2026-03-31"],shares_from_fy:false}}};
const ttmPublished=buildPublishedValuation(run,ttmInput,{...provenance,identity:{...context.identity,securityType:"ADR"},shareBasis:{adsRatio:2}});
assert.deepEqual(ttmPublished.presentation.displayBasis,{version:1,ttm:{year:2026,periodEnd:"2026-03-31"},adsRatio:2},"TTM and conversion disclosure freeze from the published inputs");
ttmInput.floorInput.ttm!.period_end="2026-09-30";
assert.equal(ttmPublished.presentation.displayBasis?.ttm?.periodEnd,"2026-03-31","later research mutation cannot relabel the published period");
const {displayBasis: retainedBasis,...numericPresentation}=mappedPublished.presentation;
assert(retainedBasis);
assert.deepEqual(numericPresentation,JSON.parse(JSON.stringify(runValuation(input))),"retaining explanations must not change any model output");
const legacyPublishedRecord=buildTrackingRecord(runValuation(input),{...context,nonPriceInputs:{fundamentals:JSON.parse(JSON.stringify({floorInput:input.floorInput,financialEvidence:null})),assumptions:{dgs10:input.dgs10,modelVersion:VALUATION_MODEL_VERSION,suppressExpectations:false},shareBasis:provenance.shareBasis}});
assert.notEqual(legacyPublishedRecord.revisionId,mappedPublished.record.revisionId,"enriching legacy presentation must require a new publication proof");
assert(mappedPublished.record.inputHashes.fundamentals,"actual mapped optional fields must fingerprint");
assert.throws(()=>buildPublishedValuation(run,{...input,floorInput:{...mapped,years:[{...mapped.years[0],revenue:NaN}]}},provenance),/finite/,
  "nonfinite engine input must never normalize to null silently");
const priced=buildPublishedValuation(run,{...input,price:{...input.price!,close:51}},provenance);
assert.deepEqual(priced.record.inputHashes,mappedPublished.record.inputHashes,"quote does not pollute non-price fingerprints");
const changedEvidence=buildPublishedValuation(run,{...input,floorInput:{...mapped,years:[{...mapped.years[0],revenue:1001}]}},provenance);
assert.notEqual(changedEvidence.record.inputHashes.fundamentals,priced.record.inputHashes.fundamentals);
const changedRate=buildPublishedValuation(run,{...input,dgs10:{value:4,date:"2026-01-01"}},provenance);
assert.notEqual(changedRate.record.inputHashes.assumptions,priced.record.inputHashes.assumptions);
const nativeEvidence={currency:"CNY",current:{revenue:100,netIncome:20},prior:{revenue:50,netIncome:10},source:{url:"https://www.sec.gov/interim",filedAt:today}};
const nativePublished=buildPublishedValuation(run,input,{...provenance,financialEvidence:nativeEvidence});
const refreshedNative=buildPublishedValuation(run,input,{...provenance,financialEvidence:{...nativeEvidence,updated_at:today,created_at:today,id:123}});
assert.equal(refreshedNative.record.inputHashes.fundamentals,nativePublished.record.inputHashes.fundamentals,"storage timestamps and row IDs cannot manufacture new financial evidence");
const changedNative=buildPublishedValuation(run,input,{...provenance,financialEvidence:{...nativeEvidence,current:{revenue:200,netIncome:40},prior:{revenue:100,netIncome:20}}});
assert.notEqual(nativePublished.record.inputHashes.fundamentals,changedNative.record.inputHashes.fundamentals,"complete native evidence changes fingerprint even when growth ratios are identical");
assert.equal(nativePublished.record.currency,"USD","native ratios do not relabel USD model amounts");
const changedAds=buildPublishedValuation(run,input,{...provenance,shareBasis:{adsRatio:2,latestSplitDate:null}});
assert.notEqual(changedAds.record.inputHashes.shareBasis,priced.record.inputHashes.shareBasis);
assert.equal(changedAds.record.inputHashes.fundamentals,priced.record.inputHashes.fundamentals,"ADS changes remain classified as share-basis changes");
const old = buildTrackingRecord(run, {...context,publishedAt:new Date().toISOString()});
const newerRun = {...run,verdict:{...run.verdict!,price:51,marginPct:.49}};
const candidate = buildTrackingRecord(newerRun,context);
let rows: Record<string, unknown>[] = [];
function fixture(record= candidate, presentation:ValuationRun=newerRun) {
 return {identity_key:context.identity.key,ticker:"GOOG",identity:context.identity,is_current:true,
 valuation_publication:{identity_key:context.identity.key,generation:2,public_result:{record,presentation},tracking_result:old,
 tracking_generation:1,publication_status:"pending",safety:{status:"valid",reasons:[] as string[],observedAt:new Date().toISOString()}}};
}
let errorCode: string | null = null;
let pageRequests = 0;
let transitionRows: Record<string, unknown>[][] = [];
const server = createServer((req,res)=> {
 const url = new URL(req.url!,"http://localhost");
 res.setHeader("content-type","application/json");
 if (errorCode) {res.statusCode=404;res.end(JSON.stringify({code:errorCode,message:"fixture unavailable"}));return;}
 if (url.pathname.endsWith("consensus_holdings")) {res.end("[]");return;}
 assert(url.pathname.endsWith("tracking_securities"),"must not read legacy snapshots");
 const start = Number(url.searchParams.get("offset") ?? 0); const limit=Number(url.searchParams.get("limit") ?? 1000);
 pageRequests++;
 const page=(transitionRows.shift() ?? rows).slice(start,start+limit).map(row=> {
   if (!url.searchParams.get("select")?.includes("public_record:")) return row;
   const p=row.valuation_publication as ReturnType<typeof fixture>["valuation_publication"];
   return {...row,valuation_publication:{...p,public_result:undefined,public_record:p.public_result?.record,
     public_verdict:p.public_result?.presentation.verdict,public_currency:p.public_result?.presentation.currency,
     public_expectations:p.public_result?.presentation.expectations,public_methods:p.public_result?.presentation.methods}};
 });
 res.end(JSON.stringify(page));
});
await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
process.env.SUPABASE_URL=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
process.env.SUPABASE_SERVICE_KEY="fixture-only";
try {
 rows=[fixture(candidate,{...newerRun,displayBasis:mappedPublished.presentation.displayBasis})];
 assert.deepEqual((await readPublicValuations(["GOOG"])).get("GOOG")?.presentation.displayBasis,mappedPublished.presentation.displayBasis,"full reader retains same-run basis");
 rows=[fixture(candidate,{...newerRun,displayBasis:{version:1,ttm:{year:2026,periodEnd:"bad-date"},adsRatio:-2}})];
 assert.equal((await readPublicValuations(["GOOG"])).get("GOOG")?.presentation.displayBasis,undefined,"malformed basis is unknown, never a fabricated explanation");
 rows=[fixture()];
 assert.equal((await readPublicValuations(["GOOG"])).get("GOOG")?.presentation.displayBasis,undefined,"legacy presentation stays readable without inferred basis");
 assert.equal((await readPublicValuations(["GOOG"])).get("GOOG")?.record.price,51);
 assert.equal((await readTrackingValuations([context.identity.key])).get(context.identity.key)?.price,50,"candidate must not enter tracking");
 assert.equal((await readValuationSafety(["GOOG"])).get("GOOG")?.status,"pending");
 // The actual API must never combine the candidate revision from one snapshot with
 // the previous generation's valid state from a concurrent second read.
 const confirmedOld=fixture(old,run);
 Object.assign(confirmedOld.valuation_publication,{generation:1,tracking_generation:1,publication_status:"confirmed"});
 transitionRows=[[fixture()],[confirmedOld]];pageRequests=0;
 const candidateState=(await (await safetyGet(new Request("http://fixture/api/valuation/state?tickers=GOOG"))).json()).states[0];
 assert.equal(candidateState.revisionId,candidate.revisionId);
 assert.equal(candidateState.status,"pending","candidate revision cannot borrow old confirmed safety");
 assert.equal(pageRequests,1,"revision and safety must share one row snapshot");
 const confirmedNew=fixture(candidate,newerRun);
 Object.assign(confirmedNew.valuation_publication,{tracking_result:{...candidate,publishedAt:new Date().toISOString()},tracking_generation:2,publication_status:"confirmed"});
 transitionRows=[[confirmedOld],[confirmedNew]];pageRequests=0;
 const oldState=(await (await safetyGet(new Request("http://fixture/api/valuation/state?tickers=GOOG"))).json()).states[0];
 assert.equal(oldState.revisionId,old.revisionId);assert.equal(oldState.status,"valid");
 assert.equal(pageRequests,1,"reverse transition also uses only the observed generation");
 transitionRows=[];
 const unreliableRun={...run,verdict:{...run.verdict!,reliable:false}};
 const unreliable=fixture(buildTrackingRecord(unreliableRun,context),unreliableRun);
 unreliable.valuation_publication.safety={status:"pending",reasons:["unreliable_valuation"],observedAt:new Date().toISOString()};rows=[unreliable];
 assert.equal((await readPublicValuations(["GOOG"])).get("GOOG")?.record.status,"pending","current unreliable presentation remains explicitly pending");
 assert.equal((await readTrackingValuations([context.identity.key])).size,0,"reliability loss suppresses previous confirmed latest");
 assert.deepEqual(await readStrikeZoneLeaders(5),{total:0,pending:1,leaders:[]});
 const invalid=fixture(); invalid.valuation_publication.safety={status:"invalid",reasons:["split_coverage_stale"],observedAt:new Date().toISOString()}; rows=[invalid];
 assert.equal((await readTrackingValuations([context.identity.key])).size,0);
 assert.equal((await readPublicValuations(["GOOG"])).size,0);
 assert((await readValuationSafety(["GOOG"])).get("GOOG")?.reasons.includes("split_coverage_stale"));
 const staleDate = new Date(Date.now()-11*86400000).toISOString().slice(0,10);
 const stale=fixture(buildTrackingRecord({...run,verdict:{...run.verdict!,priceDate:staleDate}},context),{...run,verdict:{...run.verdict!,priceDate:staleDate}});
 stale.valuation_publication.tracking_result=stale.valuation_publication.public_result.record;rows=[stale];
 assert.equal((await readTrackingValuations([context.identity.key])).size,0,"read-time quote expiry");
 assert.equal((await readStrikeZoneLeaders(5)).total,0);
 const freshCandidate=fixture(); freshCandidate.valuation_publication.tracking_result=stale.valuation_publication.tracking_result;rows=[freshCandidate];
 assert.equal((await readTrackingValuations([context.identity.key])).size,0);
 assert((await readValuationSafety(["GOOG"])).get("GOOG")?.reasons.includes("price_stale"),"safety must explain expired confirmed generation even with fresh candidate");
 const noValuation=fixture(); noValuation.valuation_publication.public_result=null as never; noValuation.valuation_publication.tracking_result=null as never;
 noValuation.valuation_publication.safety={status:"pending",reasons:["no_valuation"],observedAt:new Date().toISOString()};rows=[noValuation];
 assert.equal((await readValuationSafety(["GOOG"])).get("GOOG")?.status,"pending","verified identity without value remains followable/pending");
 const fundamental=fixture(buildTrackingRecord(run,{...context,fundamentalAsOf:"2020-01-01"}),run);
 fundamental.valuation_publication.tracking_result=fundamental.valuation_publication.public_result.record; rows=[fundamental];
 assert.equal((await readTrackingValuations([context.identity.key])).size,0,"read-time fundamental expiry");
 rows=[{...fixture(),valuation_publication:{...fixture().valuation_publication,public_result:{record:{rangeLo:60,marginPct:.5},presentation:run},tracking_result:{rangeLo:60}}}];
 assert.equal((await readPublicValuations(["GOOG"])).size,0,"old contract never backsolves IV");
 assert.equal((await readTrackingValuations([context.identity.key])).size,0);
 rows=Array.from({length:1005},(_,index)=> {
   const ticker=`T${index}`; const identity={...context.identity,ticker,key:`figi:BBG${String(index).padStart(9,"0")}`,figi:`BBG${String(index).padStart(9,"0")}`};
   const record=buildTrackingRecord(run,{...context,identity});
   return {...fixture(record,run),ticker,identity_key:identity.key,identity};
 });
 pageRequests=0;
 assert.equal((await readStrikeZoneLeaders(5)).total,1005,"counts must use all filtered public results");
 assert(pageRequests>=2,"must paginate beyond Supabase 1000 cap");
 assert.equal((await readValuationScreen("strike_zone")).rows.length,1005);
 errorCode="PGRST205";
 await assert.rejects(readPublicValuations(["GOOG"]),(error:unknown)=>error instanceof PublicationUnavailableError && error.reason==="schema_missing");
 errorCode="TEST";
 await assert.rejects(readTrackingValuations([context.identity.key]),(error:unknown)=>error instanceof PublicationUnavailableError && error.reason==="database_unavailable","database failure must not become normal empty latest");
} finally {await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
console.log("publishedRead.check.ts OK");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
