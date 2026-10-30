import assert from 'node:assert/strict';
import { fundamentalsToFloorInput } from './fundamentalsToFloorInput';
import type { FundamentalPeriod } from '../sec/normalize-facts';
const row=(end:string,fp:string,revenue:number,ni:number,extra:Partial<FundamentalPeriod>={})=>({period_end:end,fiscal_year:Number(end.slice(0,4)),fiscal_period:fp,form:fp==='FY'?'10-K':'10-Q',filing_date:end,is_derived:false,revenue,net_income:ni,...extra} as FundamentalPeriod);
const fy=[row('2025-12-31','FY',110,9),row('2024-12-31','FY',100,10),row('2023-12-31','FY',90,8)];
const mapped=fundamentalsToFloorInput('ALL','All companies',fy) as ReturnType<typeof fundamentalsToFloorInput>&{growth_evidence?:unknown};
assert.ok(mapped.growth_evidence,'production mapper must carry auditable growth evidence');
async function checks(){
 const {buildGrowthEvidence,assessGrowthCoverage}=await import('./growthEvidence');
 const annual=buildGrowthEvidence(fy,[]);
 assert.ok(Math.abs(annual.revenue_growth!-.1)<1e-9);
 assert.ok(Math.abs(annual.earnings_growth!+.1)<1e-9);
 assert.equal(assessGrowthCoverage(annual,'2026-04-01'),undefined,'fresh annual has no overdue interim');
 assert.equal(assessGrowthCoverage(annual,'2026-10-30'),'missing_interim','old FY without new interim cannot support growth');
 const qs=[row('2026-03-31','Q1',30,4),row('2025-03-31','Q1',20,3)];
 const recovering=buildGrowthEvidence(fy,qs);
 assert.equal(recovering.basis,'interim');assert.equal(recovering.period_end,'2026-03-31');
 assert.equal(recovering.revenue_growth,.5);assert.ok(recovering.earnings_growth!>0,'current paired interim recovery replaces old annual decline');
 const missing=buildGrowthEvidence(fy,[...qs,row('2026-06-30','Q2',40,5)]);
 assert.equal(missing.basis,'fy','must not select only matching subset of a newer YTD');
 assert.equal(assessGrowthCoverage(missing,'2026-10-30'),'missing_comparables');
 const duplicated=buildGrowthEvidence(fy,[...qs,{...qs[0],revenue:33,filing_date:'2026-05-01'}]);
 assert.ok(Math.abs(duplicated.revenue_growth!-.65)<1e-9,'deduplicate revised periods before summing');
 const lossBase=buildGrowthEvidence([fy[0],{...fy[1],net_income:-1}],[]);
 assert.equal(lossBase.earnings_growth,undefined,'loss-to-profit is not a meaningful percentage');
 const wrongType=buildGrowthEvidence(fy,[row('2026-08-25','Q2',1,1,{form:'20-F'})]);
 assert.equal(wrongType.latest_period_end,'2025-12-31','do not treat arbitrary filing dates as quarters');
 const knownNew=buildGrowthEvidence(fy,qs,[{form:'10-Q',report_date:'2026-06-30'}]);
 assert.equal(assessGrowthCoverage(knownNew,'2026-10-30'),'uncovered_filing');
 console.log('growth evidence checks passed');
}
// An old Q1 must not keep an otherwise stale company current forever.
checks().then(async()=>{
 const {buildGrowthEvidence,assessGrowthCoverage}=await import('./growthEvidence');
 assert.equal(assessGrowthCoverage(buildGrowthEvidence(fy,[row('2026-03-31','Q1',30,4),row('2025-03-31','Q1',20,3)]),'2026-10-30'),'missing_interim');
 const missingQ1=buildGrowthEvidence(fy,[row('2026-06-30','Q2',40,5),row('2025-06-30','Q2',30,4)]);
 assert.equal(missingQ1.missing_comparables,true,'Q2 alone is not complete post-FY YTD');
});
