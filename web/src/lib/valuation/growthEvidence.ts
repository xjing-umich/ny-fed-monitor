import type { FundamentalPeriod } from '../sec/normalize-facts';

export type GrowthCoverageGap = 'missing_interim' | 'missing_comparables' | 'uncovered_filing' | 'missing_period' | 'missing_reinvestment';
export type GrowthEvidence = {
  basis: 'fy' | 'interim';
  period_end?: string;
  annual_period_end?: string;
  latest_period_end?: string;
  latest_filing_period_end?: string;
  revenue_growth?: number;
  earnings_growth?: number;
  pairs: number;
  missing_comparables: boolean;
  current_earnings_nonpositive?: boolean;
};
export type GrowthFiling = { form: string; report_date?: string | null };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const day = (date: string) => Date.parse(date) / 86_400_000;
const yoy = (current: unknown, prior: unknown): number | undefined =>
  finite(current) && finite(prior) && prior > 0 ? current / prior - 1 : undefined;

/** Compare complete, same-season interim sums; never cherry-pick the matching quarters. */
export function buildGrowthEvidence(
  annual: FundamentalPeriod[],
  quarterly: FundamentalPeriod[],
  filings: GrowthFiling[] = [],
): GrowthEvidence {
  const fy = annual.filter(r => r.fiscal_period === 'FY' && r.period_end)
    .sort((a,b) => b.period_end.localeCompare(a.period_end));
  const latest = fy[0];
  const prior = latest && fy.slice(1).find(r => day(latest.period_end)-day(r.period_end)>=350 && day(latest.period_end)-day(r.period_end)<=380);
  // FY/derived Q4 and 6-K submission dates are not evidence of a real quarterly period.
  const real = quarterly.filter(r => ['10-Q','6-K'].includes(r.form) && r.is_derived !== true && /^Q[1-4]$/.test(r.fiscal_period ?? "") && r.period_end);
  const dedup = [...new Map(real.sort((a,b)=>(a.filing_date??'').localeCompare(b.filing_date??'')).map(r=>[r.period_end,r])).values()];
  const recent = latest ? dedup.filter(r => r.period_end>latest.period_end).sort((a,b)=>a.period_end.localeCompare(b.period_end)) : [];
  const latestPeriod = recent.at(-1)?.period_end ?? latest?.period_end;
  const latestFiling = filings.filter(f => ['10-Q','10-K','20-F'].includes(f.form) && f.report_date)
    .map(f=>f.report_date!).sort().at(-1);
  const result: GrowthEvidence = {
    basis:'fy', period_end:latest?.period_end, annual_period_end:latest?.period_end,
    latest_period_end:latestPeriod, latest_filing_period_end:latestFiling,
    revenue_growth:yoy(latest?.revenue,prior?.revenue), earnings_growth:yoy(latest?.net_income,prior?.net_income),
    pairs:0, missing_comparables:false, current_earnings_nonpositive: finite(latest?.net_income) && latest.net_income <= 0,
  };
  if(!recent.length) return result;
  const matches = recent.map(q => dedup.filter(p=>p.period_end<=latest!.period_end && p.fiscal_period===q.fiscal_period && Math.abs(day(q.period_end)-day(p.period_end)-365)<=45)
    .sort((a,b)=>Math.abs(day(q.period_end)-day(a.period_end)-365)-Math.abs(day(q.period_end)-day(b.period_end)-365))[0]);
  // More than three quarters beyond FY means the annual anchor is incomplete.
  if(recent.length>3 || recent.some((q,i)=>q.fiscal_period!==`Q${i+1}`) || matches.some(p=>!p) || new Set(matches.map(p=>p?.period_end)).size!==recent.length ||
    ![...recent,...matches].every(p=>p && finite(p.revenue) && finite(p.net_income))) {
    result.missing_comparables=true; return result;
  }
  const sum=(rows:FundamentalPeriod[],key:'revenue'|'net_income')=>rows.reduce((s,r)=>s+r[key]!,0);
  return {...result,basis:'interim',period_end:latestPeriod,pairs:recent.length,
    revenue_growth:yoy(sum(recent,'revenue'),sum(matches,'revenue')),
    earnings_growth:yoy(sum(recent,'net_income'),sum(matches,'net_income')), current_earnings_nonpositive:sum(recent,'net_income')<=0};
}

/** A recent refresh timestamp cannot make an old financial period current. */
export function assessGrowthCoverage(evidence: GrowthEvidence, asOf: string): GrowthCoverageGap | undefined {
  if(!evidence.latest_period_end || !Number.isFinite(day(evidence.latest_period_end)) || !Number.isFinite(day(asOf)) || day(evidence.latest_period_end)>day(asOf)) return 'missing_period';
  if(evidence.latest_filing_period_end && (!evidence.latest_period_end || evidence.latest_filing_period_end>evidence.latest_period_end)) return 'uncovered_filing';
  if(evidence.missing_comparables) return 'missing_comparables';
  if(day(asOf)-day(evidence.latest_period_end)>180) return 'missing_interim';
  return undefined;
}
