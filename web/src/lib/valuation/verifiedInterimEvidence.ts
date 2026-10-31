import type { InterimIncomeEvidence } from '../sec/interim-disclosures/types';
import type { GrowthEvidence } from './growthEvidence';
const day=(date:string)=>Date.parse(date)/864e5;
const valid=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(day(date));

/** Native same-report ratios only: never converts these amounts into USD valuation inputs. */
export function applyVerifiedInterimEvidence(base:GrowthEvidence, records:InterimIncomeEvidence[], marksAdjusted=false):GrowthEvidence {
  if(!base.annual_period_end||base.annual_missing_comparables)return base;
  const eligible=records.filter(r=>{
    const c=r.current,p=r.prior;
    const derived=r.source.priorDerivation;
    if(derived){
      if(derived.method!=="sum_reported_quarters"||JSON.stringify(derived.quarters)!=='["Q1","Q2","Q3"]'||derived.fiscalYear!==Number(p.end.slice(0,4))||derived.revenue.length!==3||derived.netIncome.length!==3||![...derived.revenue,...derived.netIncome].every(Number.isFinite)||Math.abs(derived.revenue.reduce((s,v)=>s+v,0)-p.revenue)>1e-6||Math.abs(derived.netIncome.reduce((s,v)=>s+v,0)-p.netIncome)>1e-6||day(p.end)-day(p.start)<260||day(p.end)-day(p.start)>285)return false;
    }
    if(r.currency===null&&(r.presentationUnit!=="$"||r.sharedUnitVerified!==true))return false;
    if(![c.start,c.end,p.start,p.end,r.fiscalYearStart,r.source.publishedAt].every(valid))return false;
    if(![c.revenue,c.netIncome,p.revenue,p.netIncome].every(Number.isFinite)||c.revenue<0||p.revenue<=0)return false;
    const days=day(c.end)-day(c.start),priorDays=day(p.end)-day(p.start);
    if(days<75||days>290||Math.abs(days-priorDays)>8||Math.abs(day(c.end)-day(p.end)-365)>15)return false;
    if(day(r.source.publishedAt)<day(c.end)||day(r.source.publishedAt)-day(c.end)>180)return false;
    // Complete YTD/H1 (or fiscal Q1) starting directly after the annual anchor.
    if(Math.abs(day(c.start)-day(base.annual_period_end!)-1)>7||c.start!==r.fiscalYearStart)return false;
    if(r.comparisonBasis==='quarter'&&days>110)return false;
    if(c.end<(base.latest_period_end??base.annual_period_end!))return false;
    return true;
  }).sort((a,b)=>b.current.end.localeCompare(a.current.end)||b.source.publishedAt.localeCompare(a.source.publishedAt));
  const r=eligible[0];if(!r)return base;
  const common={...base,latest_period_end:r.current.end,latest_filing_period_end:[base.latest_filing_period_end,r.current.end].filter((v):v is string=>!!v).sort().at(-1),source_url:r.source.exhibitUrl,source_available_at:r.source.publishedAt,currency:r.currency,...(r.currency===null?{presentation_unit:r.presentationUnit,shared_unit_verified:r.sharedUnitVerified}:{}),comparison_basis:r.comparisonBasis};
  if(marksAdjusted)return {...common,missing_comparables:true};
  return {...common,basis:'interim',period_end:r.current.end,pairs:1,missing_comparables:false,
    revenue_growth:r.current.revenue/r.prior.revenue-1,
    earnings_growth:r.prior.netIncome>0?r.current.netIncome/r.prior.netIncome-1:undefined,
    current_earnings_nonpositive:r.current.netIncome<=0};
}
