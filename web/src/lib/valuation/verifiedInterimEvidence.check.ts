import assert from 'node:assert/strict';
import { applyVerifiedInterimEvidence } from './verifiedInterimEvidence';
import type { InterimIncomeEvidence } from '../sec/interim-disclosures/types';
const base={basis:'fy' as const,period_end:'2025-12-31',annual_period_end:'2025-12-31',latest_period_end:'2025-12-31',latest_filing_period_end:'2025-12-31',revenue_growth:.49,earnings_growth:.4,pairs:0,missing_comparables:false};
const pdd:InterimIncomeEvidence={ticker:'PDD',currency:'CNY',accountingBasis:'US-GAAP',comparisonBasis:'ytd',fiscalYearStart:'2026-01-01',current:{start:'2026-01-01',end:'2026-06-30',revenue:218587,netIncome:39729},prior:{start:'2025-01-01',end:'2025-06-30',revenue:199657,netIncome:45496},source:{accessionNumber:'0001104659-26-100534',exhibitUrl:'https://www.sec.gov/Archives/edgar/data/1737806/000110465926100534/tm2623874d1_ex99-1.htm',publishedAt:'2026-08-25',parserVersion:'test'}};
const out=applyVerifiedInterimEvidence(base,[pdd]);
assert.equal(out.period_end,'2026-06-30');assert.equal(out.basis,'interim');assert.equal(out.pairs,1);assert.ok(Math.abs(out.revenue_growth!-(218587/199657-1))<1e-10);assert.ok(out.earnings_growth!<0);assert.equal(out.currency,'CNY');
assert.equal(base.period_end,'2025-12-31','pure operation never mutates annual source');
assert.deepEqual(applyVerifiedInterimEvidence(base,[{...pdd,current:{...pdd.current,start:'2026-04-01'}}]),base,'incomplete post-FY window cannot cherry-pick Q2');
assert.deepEqual(applyVerifiedInterimEvidence(base,[{...pdd,prior:{...pdd.prior,end:'2024-06-30'}}]),base,'mismatched comparisons rejected');
assert.deepEqual(applyVerifiedInterimEvidence({...base,latest_period_end:'2026-09-30'},[pdd]),{...base,latest_period_end:'2026-09-30'},'older disclosure cannot override a newer incomplete quarter');
const marks=applyVerifiedInterimEvidence(base,[pdd],true);assert.equal(marks.missing_comparables,true,'unadjusted GAAP cannot replace operating earnings after marks adjustment');
const half={...pdd,comparisonBasis:'half_year' as const};assert.equal(applyVerifiedInterimEvidence(base,[half]).period_end,'2026-06-30','native H1 supported without inventing quarters');
for(const prior of [0,-10])assert.equal(applyVerifiedInterimEvidence(base,[{...pdd,prior:{...pdd.prior,netIncome:prior}}]).earnings_growth,undefined,'no invented zero growth for a nonpositive comparison base');
console.log('verified native interim growth evidence checks OK');

assert.deepEqual(applyVerifiedInterimEvidence(base,[{...pdd,currency:null}]),base,"unknown currency without verified common statement unit cannot support growth");
const shared=applyVerifiedInterimEvidence(base,[{...pdd,currency:null,presentationUnit:"$",sharedUnitVerified:true}]);
assert.equal(shared.revenue_growth,out.revenue_growth,"same-statement ratios do not depend on identifying the ISO dollar code");
assert.equal(shared.currency,null,"an unknown dollar code must never be labelled USD");
assert.equal(shared.presentation_unit,"$");assert.equal(shared.shared_unit_verified,true);

const derivedNine:InterimIncomeEvidence={...pdd,current:{...pdd.current,end:"2026-09-30"},prior:{...pdd.prior,end:"2025-09-30",revenue:90,netIncome:30},source:{...pdd.source,publishedAt:"2026-10-30",priorDerivation:{method:"sum_reported_quarters",fiscalYear:2025,quarters:["Q1","Q2","Q3"],revenue:[20,30,40],netIncome:[5,10,15]}}};
assert.equal(applyVerifiedInterimEvidence(base,[derivedNine]).period_end,"2026-09-30","complete explicitly reported prior quarters may form same-statement nine-month comparison");
assert.deepEqual(applyVerifiedInterimEvidence(base,[{...derivedNine,prior:{...derivedNine.prior,netIncome:31}}]),base,"derived quarter proof must agree with prior comparable sum");
