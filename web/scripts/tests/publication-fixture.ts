// Test-only fixture. Explicit reference/IV are chosen independently of fixture margin/range.
import { buildTrackingRecord } from "../../src/lib/valuation/trackingContract";
import { VALUATION_MODEL_VERSION } from "../../src/lib/valuation/modelVersion";
import type { ValuationRun } from "../../src/lib/valuation/runValuation";
export const fixtureDate = new Date().toISOString().slice(0,10);
export function publicationFixture(row:Record<string,unknown>, index=1) {
  const ticker=String(row.ticker);
  // Quarantined input cannot be built by the genuine contract builder; corrupt the directory only.
  const identity={key:`figi:BBG${String(index).padStart(9,"0")}`,ticker:ticker === "SATS" ? "SAFE" : ticker,
    figi:`BBG${String(index).padStart(9,"0")}`,cik:"0000000001",cusip:"000000001",securityType:"Common Stock",source:"fixture",checkedAt:fixtureDate};
  const methods={zeroGrowthEpv:true,oeDcf:true,greenwaldGrowthCeilings:true};
  const run:ValuationRun={currency:"USD",floor:undefined,strikeZone:undefined,oeDcf:undefined,reconciliation:undefined,methods,
    expectations:(row.payload as {expectations?:ValuationRun["expectations"]})?.expectations ?? {assessable:false,reason:"fixture"},
    verdict:{intrinsicValue:100,referenceValue:100,referenceKind:"oe_dcf_neutral",requiredMargin:.38,strikePrice:62,
      bucket:row.verdict_bucket as "below",inStrikeZone:Boolean(row.in_strike_zone),rangeLo:Number(row.range_lo),rangeHi:Number(row.range_hi),price:Number(row.price),priceDate:fixtureDate,
      marginPct:Number(row.margin_pct),coverage:"full",reliable:Boolean(row.reliable),methods}};
  const record=buildTrackingRecord(run,{identity,modelVersion:(row.payload as {model_version?:string})?.model_version ?? VALUATION_MODEL_VERSION,
    currency:"USD",perShareBasis:"ordinary",priceSource:"fixture",fundamentalAsOf:fixtureDate,filedAt:fixtureDate,
    computedAt:fixtureDate,publishedAt:null,nonPriceInputs:{fundamentals:{fixture:true},assumptions:{rate:4},shareBasis:{adsRatio:1}},
    sources:[{url:"https://www.sec.gov/fixture",asOf:fixtureDate}]});
  return {identity_key:identity.key,ticker,identity:{...identity,ticker},is_current:true,
    valuation_publication:{identity_key:identity.key,generation:1,public_result:{record,presentation:run},tracking_result:null,
      tracking_generation:null,publication_status:"pending",safety:{status:record.status === "valid" ? "valid" : "pending",reasons:record.reasons,observedAt:new Date().toISOString()}}};
}

export function projectPublicationFixture(row:ReturnType<typeof publicationFixture>, select:string|null) {
  if (!select?.includes("public_record:")) return row;
  const {record,presentation}=row.valuation_publication.public_result;
  return {...row,valuation_publication:{...row.valuation_publication,public_result:undefined,public_record:record,
    public_verdict:presentation.verdict,public_currency:presentation.currency,public_expectations:presentation.expectations,public_methods:presentation.methods,public_moat_cap:presentation.oeDcf?.moatCap}};
}
