import { XMLParser } from 'fast-xml-parser';
import type { CompanyFacts, SecFactUnit } from './company-facts';
import type { NormalizedFiling } from './company-submissions';
import { FUNDAMENTAL_TAGS } from './fundamental-tags';
import { fetchInstance, isOwnPeriod } from './filing-backfill';
import { filingIndexUrl, filingUrl, secFetchText, sleep } from './sec-client';
import { financialNumbers, htmlTables } from './interim-disclosures/html';

// Statement totals verified against original 2026 Q2 SEC statements on 2026-10-31.
// These are issuer policies, never global GAAP aliases. MTH's dimensioned
// homebuilding/financial-services revenue does not establish a unique total.
const POLICIES: Record<string, { concept: string; namespace: RegExp; soleLicense?: boolean }> = {
  '1562401': { concept: 'us-gaap:OperatingLeaseLeaseIncome', namespace: /^https?:\/\/fasb\.org\/us-gaap\// },
  '1717307': { concept: 'us-gaap:OperatingLeaseLeaseIncome', namespace: /^https?:\/\/fasb\.org\/us-gaap\// },
  '1690585': { concept: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', namespace: /^https?:\/\/fasb\.org\/us-gaap\//, soleLicense: true },
  '1841666': { concept: 'apa:RevenuesAndOther', namespace: /^https?:\/\/www\.apachecorp\.com\/\d{8}$/ },
  '1692115': { concept: 'us-gaap:RegulatedOperatingRevenue', namespace: /^https?:\/\/fasb\.org\/us-gaap\// },
};
const normalizeCik = (cik: string | number) => String(Number(cik));
const day = (d: string) => Date.parse(d) / 86_400_000;
const validDate = (d?: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(day(d));
const durationFits = (start: string, end: string, form: string) => {
  const n=day(end)-day(start);
  return form==='10-K' ? n>=350 && n<=380 : form==='10-Q' && ((n>=80&&n<=100)||(n>=160&&n<=200)||(n>=248&&n<=285));
};
type Obj=Record<string, unknown>;
const arr=(v:unknown): unknown[] => Array.isArray(v)?v:v==null?[]:[v];
const local=(o:Obj,name:string):unknown => Object.entries(o).find(([k])=>k.split(':').at(-1)===name)?.[1];
const obj=(v:unknown):Obj => typeof v==='object'&&v!==null?v as Obj:{};
const txt=(v:unknown):string|undefined => typeof v==='string'?v:typeof obj(v)['#text']==='string'?obj(v)['#text'] as string:undefined;
export type IssuerRevenue = { start:string;end:string;value:number;source_tag:string;source_url:string;source_cik:string;statement_bound?:boolean };
export type IssuerRevenueExtraction = { facts:IssuerRevenue[];reason?:string };

/** Current source statement must identify License revenue as its sole revenue row. */
function dnthStatementProof(html:string,filing:NormalizedFiling):Map<string,number>|null {
  if(filing.form!=='10-Q'||!validDate(filing.report_date))return null;
  const year=Number(filing.report_date.slice(0,4)),month=Number(filing.report_date.slice(5,7));
  const endDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  if(![3,6,9].includes(month)||filing.report_date!==`${year}-${String(month).padStart(2,'0')}-${endDay}`)return null;
  const normalize=(s:string)=>s.replace(/[\u200b-\u200d\ufeff]/g,'').replace(/STATEM\s+ENTS/gi,'STATEMENTS').replace(/\s+/g,' ').trim();
  const candidates=htmlTables(html).filter(t=>/DIANTHUS THERAPEUTICS, INC\./i.test(t.precedingText)&&/CONSOLIDATED STATEMENTS OF OPERATIONS/i.test(normalize(t.precedingText)));
  if(candidates.length!==1)return null;
  const table=candidates[0],rows=table.rows.map(r=>r.map(normalize).filter(Boolean));
  if(!/in thousands/i.test(table.precedingText)||!rows.some(r=>/^Net loss$/i.test(r[0])))return null;
  const revenues=rows.filter(r=>/revenue|sales/i.test(r[0])&&r.length>1);
  if(revenues.length!==1||revenues[0][0].toLowerCase()!=='license revenue')return null;
  const header=rows.slice(0,rows.indexOf(revenues[0])),numbers=financialNumbers(revenues[0].slice(1).filter(c=>c!=='$'));
  const windows=header.flat().flatMap(c=>[...c.matchAll(/\b(Three|Six|Nine) Months Ended\b/gi)].map(m=>({three:3,six:6,nine:9})[m[1].toLowerCase()]!));
  const expectedWindows=month===3?[3]:[3,month];
  const years=header.flat().filter(c=>/^20\d{2}$/.test(c)).map(Number);
  const monthName=['March','June','September'][month/3-1];
  const dates=header.flat().flatMap(c=>[...c.matchAll(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2},/g)].map(m=>m[0]));
  if(JSON.stringify(windows)!==JSON.stringify(expectedWindows)||JSON.stringify(years)!==JSON.stringify(expectedWindows.flatMap(()=>[year,year-1]))||dates.length!==expectedWindows.length||dates.some(c=>c!==`${monthName} ${endDay},`)||!numbers||numbers.length!==expectedWindows.length*2)return null;
  const proof=new Map<string,number>();
  expectedWindows.forEach((months,i)=>[year,year-1].forEach((y,j)=>{
    proof.set(`${y}-${String(month-months+1).padStart(2,'0')}-01|${y}-${String(month).padStart(2,'0')}-${endDay}`,numbers[i*2+j]*1000);
  }));
  return [...proof.values()].every(v=>Number.isFinite(v)&&v>=0)?proof:null;
}

/** Exact issuer totals, entity CIK, USD and own periods; only DNTH permits a verified sole-license axis. */
export function extractIssuerRevenue(xml:string, filing:NormalizedFiling, cik:string, primaryHtml?:string):IssuerRevenueExtraction {
  const key=normalizeCik(cik), policy=POLICIES[key];
  if(key==='833079')return {facts:[],reason:'unsupported_dimensional_consolidation'};
  if(!policy)return {facts:[],reason:'unsupported_issuer'};
  if(normalizeCik(filing.cik)!==key || !['10-K','10-Q'].includes(filing.form) || !validDate(filing.report_date) || !validDate(filing.filing_date))return {facts:[],reason:'invalid_original_filing'};
  const statementProof=policy.soleLicense&&primaryHtml?dnthStatementProof(primaryHtml,filing):null;
  if(policy.soleLicense&&!statementProof)return {facts:[],reason:'primary_consolidated_license_statement_required'};
  const parsed=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseTagValue:false}).parse(xml) as Obj;
  const root=obj(local(parsed,'xbrl'));
  const prefix=policy.concept.split(':')[0];
  if(!policy.namespace.test(String(root[`@_xmlns:${prefix}`]??'')))return {facts:[],reason:'unverified_namespace'};
  const usd=new Set<string>();
  for(const raw of arr(local(root,'unit'))){const u=obj(raw);if(txt(local(u,'measure'))==='iso4217:USD')usd.add(String(u['@_id']));}
  const contexts=new Map<string,{start:string;end:string;scope:'unqualified'|'license'|'product_detail'|'other_detail'}>();
  for(const raw of arr(local(root,'context'))){
    const c=obj(raw),entity=obj(local(c,'entity')),period=obj(local(c,'period')),identifier=obj(local(entity,'identifier'));
    if(identifier['@_scheme']!=='http://www.sec.gov/CIK' || normalizeCik(txt(identifier)??'')!==key || local(c,'scenario')!=null)continue;
    const segment=local(entity,'segment');
    let scope:'unqualified'|'license'|'product_detail'|'other_detail'='unqualified';
    if(segment!=null){
      if(!policy.soleLicense)continue;
      scope='other_detail';
      const members=arr(local(obj(segment),'explicitMember'));
      const single=members.length===1&&Object.keys(obj(segment)).every(k=>k.split(':').at(-1)==='explicitMember');
      const member=obj(members[0]);
      if(members.some(m=>obj(m)['@_dimension']==='srt:ProductOrServiceAxis'))scope='product_detail';
      if(root['@_xmlns:xbrldi']==='http://xbrl.org/2006/xbrldi'&&single){
        if(/^https?:\/\/fasb\.org\/srt\/\d{4}$/.test(String(root['@_xmlns:srt']??''))&&member['@_dimension']==='srt:ProductOrServiceAxis'&&txt(member)==='us-gaap:LicenseMember')scope='license';
      }
    }
    const start=txt(local(period,'startDate')),end=txt(local(period,'endDate'));
    if(!validDate(start)||!validDate(end)||!durationFits(start,end,filing.form)||!(policy.soleLicense?statementProof!.has(start+'|'+end):isOwnPeriod(end,filing.report_date)))continue;
    contexts.set(String(c['@_id']),{start,end,scope});
  }
  if(statementProof)for(const [period,expected] of statementProof){
    const matching=arr(root[policy.concept]).filter(raw=>{const f=obj(raw),c=contexts.get(String(f['@_contextRef']));return c?.scope==='license'&&c.start+'|'+c.end===period&&usd.has(String(f['@_unitRef']));});
    if(!matching.length||matching.some(raw=>{const f=obj(raw),v=txt(f),scale=Number(f['@_scale']??0);return v==null||v.trim()===''||f['@_xsi:nil']==='true'||!Number.isInteger(scale)||Number(v)*10**scale*(f['@_sign']==='-'?-1:1)!==expected;}))return {facts:[],reason:'primary_statement_revenue_mismatch'};
  }
  const byPeriod=new Map<string,IssuerRevenue>();
  // A regulated line is a consolidated total only while this issuer has no
  // contemporaneous unregulated operations revenue. Historical comparatives
  // and Southwest Gas Corporation segment contexts are excluded above.
  const scopedValues=(name:string,start:string,end:string): number[] => arr(root[name]).flatMap(raw=>{
    const f=obj(raw),c=contexts.get(String(f['@_contextRef']));
    if(!c||c.start!==start||c.end!==end||!usd.has(String(f['@_unitRef']))||f['@_xsi:nil']==='true')return [];
    const value=txt(f);
    return value==null?[]:[Number(value)*10**Number(f['@_scale']??0)*(f['@_sign']==='-'?-1:1)];
  });
  for(const raw of arr(root[policy.concept])){
    const f=obj(raw),c=contexts.get(String(f['@_contextRef']));
    if(!c||!isOwnPeriod(c.end,filing.report_date)||(policy.soleLicense&&c.scope!=='license')||!usd.has(String(f['@_unitRef']))||f['@_xsi:nil']==='true')continue;
    const rawValue=txt(f),scale=Number(f['@_scale']??0);
    if(rawValue==null||rawValue.trim()==='')continue;
    const value=Number(rawValue)*10**scale*(f['@_sign']==='-'?-1:1);
    if(!Number.isFinite(value)||value<0||!Number.isInteger(scale))continue;
    if(policy.soleLicense){
      for(const [name,values] of Object.entries(root)){
        const tag=name.split(':').at(-1)??'';
        if(!/Revenue|^NetSales$/i.test(tag)||/Deferred|Unearned|Cost|RemainingPerformance|Allowance|Margin|Percent|PerShare|TextBlock/i.test(tag))continue;
        for(const item of arr(values)){
          const other=obj(item),period=contexts.get(String(other['@_contextRef']));
          if(!period||period.start!==c.start||period.end!==c.end||!usd.has(String(other['@_unitRef'])))continue;
          // Only current statement proof permits ignoring note detail. No
          // milestone/member exception exists independent of that statement.
          if(period.scope==='other_detail'||!['unqualified','license'].includes(period.scope)&&![policy.concept,'us-gaap:Revenues'].includes(name))continue;
          const rawOther=txt(other),otherScale=Number(other['@_scale']??0);
          const amount=rawOther!=null&&rawOther.trim()!==''&&other['@_xsi:nil']!=='true'?Number(rawOther)*10**otherScale*(other['@_sign']==='-'?-1:1):NaN;
          if(!Number.isFinite(amount)||!Number.isInteger(otherScale))return {facts:[],reason:'unverified_competing_revenue'};
          if(period.scope==='license'&&[policy.concept,'us-gaap:Revenues'].includes(name)){
            if(amount!==value)return {facts:[],reason:'conflicting_consolidated_totals'};
          }else if(amount!==0)return {facts:[],reason:'license_revenue_is_partial'};
        }
      }
    }
    if(key==='1692115'){
      if(scopedValues('us-gaap:UnregulatedOperatingRevenue',c.start,c.end).some(v=>!Number.isFinite(v)||v!==0))return {facts:[],reason:'regulated_revenue_is_partial'};
      if(FUNDAMENTAL_TAGS.revenue.some(tag=>scopedValues(`us-gaap:${tag}`,c.start,c.end).some(Number.isFinite)))return {facts:[],reason:'broader_revenue_total_available'};
    }
    const id=c.start+'|'+c.end,existing=byPeriod.get(id);
    if(existing&&existing.value!==value)return {facts:[],reason:'conflicting_consolidated_totals'};
    byPeriod.set(id,{start:c.start,end:c.end,value,source_tag:policy.concept,source_cik:key,source_url:filing.filing_url,...(statementProof?{statement_bound:true}:{})});
  }
  return {facts:[...byPeriod.values()],...(!byPeriod.size?{reason:'verified_total_absent'}:{})};
}

function existingRevenue(facts:CompanyFacts,start:string,end:string):boolean {
  const duration=day(end)-day(start);
  return FUNDAMENTAL_TAGS.revenue.some(tag=>(facts.facts?.['us-gaap']?.[tag]?.units.USD??[]).some(u=>u.start&&u.end&&Number.isFinite(u.val)&&Math.abs(day(u.end)-day(end))<=7&&Math.abs((day(u.end)-day(u.start))-duration)<=7));
}

/** Fill only absent revenue. Every pre-existing finite value, including zero, wins. */
export function injectIssuerRevenue(facts:CompanyFacts,filing:NormalizedFiling,revenue:IssuerRevenue[]):number {
  const cik=normalizeCik(filing.cik),policy=POLICIES[cik];
  if(!policy||normalizeCik(facts.cik)!==cik||!validDate(filing.report_date)||!validDate(filing.filing_date))return 0;
  let n=0;
  for(const r of revenue){
    if(r.source_tag!==policy.concept||policy.soleLicense&&r.statement_bound!==true||normalizeCik(r.source_cik)!==cik||r.source_url!==filing.filing_url||!validDate(r.start)||!validDate(r.end)||!isOwnPeriod(r.end,filing.report_date)||!durationFits(r.start,r.end,filing.form)||!Number.isFinite(r.value)||r.value<0||existingRevenue(facts,r.start,r.end))continue;
    if(cik==='1692115'&&(facts.facts?.['us-gaap']?.UnregulatedOperatingRevenue?.units.USD??[]).some(u=>u.start&&u.end&&isOwnPeriod(u.end,r.end)&&Math.abs((day(u.end)-day(u.start))-(day(r.end)-day(r.start)))<=7&&(!Number.isFinite(u.val)||u.val!==0)))continue;
    const ns=(facts.facts['us-gaap']??={});
    const concept=(ns.RevenueFromContractWithCustomerExcludingAssessedTax??={units:{}});
    const list=(concept.units.USD??=[]);
    const unit:SecFactUnit & {source_url:string;source_cik:string}={start:r.start,end:r.end,val:r.value,form:filing.form,accn:filing.accession_number,filed:filing.filing_date,source_tag:r.source_tag,source_url:r.source_url,source_cik:cik};
    list.push(unit);n++;
  }
  return n;
}

/** Bounded originals: six full annual reports plus twelve real quarterly reports. */
export function findIssuerRevenueFilings(facts:CompanyFacts,filings:NormalizedFiling[],cik:string):NormalizedFiling[] {
  const key=normalizeCik(cik);
  if(!POLICIES[key]||normalizeCik(facts.cik)!==key)return [];
  const template=filings.find(f=>normalizeCik(f.cik)===key);
  const historical:NormalizedFiling[]=[];
  if(template)for(const tag of FUNDAMENTAL_TAGS.net_income)for(const u of facts.facts?.['us-gaap']?.[tag]?.units.USD??[]){
    if(u.form!=='10-K'||!u.accn||!validDate(u.filed)||!validDate(u.start)||!validDate(u.end)||!durationFits(u.start,u.end,u.form)||day(u.filed)-day(u.end)<0||day(u.filed)-day(u.end)>240)continue;
    historical.push({...template,form:'10-K',report_date:u.end,filing_date:u.filed,accession_number:u.accn,primary_document:null,filing_url:filingUrl(cik,u.accn),sec_index_url:filingIndexUrl(cik,u.accn),fiscal_year:Number(u.end.slice(0,4)),fiscal_period:'FY'});
  }
  const originals=new Map<string,NormalizedFiling>();
  for(const f of [...historical,...filings]){
    if(normalizeCik(f.cik)!==key||!['10-K','10-Q'].includes(f.form)||!validDate(f.report_date)||!validDate(f.filing_date)||day(f.filing_date)<day(f.report_date)||day(f.filing_date)-day(f.report_date)>240)continue;
    const id=f.form+'|'+f.report_date,old=originals.get(id);
    if(!old||f.filing_date<old.filing_date!||f.filing_date===old.filing_date&&f.primary_document)originals.set(id,f);
  }
  const candidates=[...originals.values()].sort((a,b)=>b.report_date!.localeCompare(a.report_date!));
  return [...candidates.filter(f=>f.form==='10-K').slice(0,6),...candidates.filter(f=>f.form==='10-Q').slice(0,12)]
    .filter(f=>!FUNDAMENTAL_TAGS.revenue.some(tag=>(facts.facts?.['us-gaap']?.[tag]?.units.USD??[]).some(u=>u.start&&u.end&&Number.isFinite(u.val)&&isOwnPeriod(u.end,f.report_date!)&&durationFits(u.start,u.end,f.form))))
    .sort((a,b)=>a.report_date!.localeCompare(b.report_date!));
}

export async function backfillConsolidatedRevenue(facts:CompanyFacts,filings:NormalizedFiling[],cik:string):Promise<{filled:string[];failed:string[]}> {
  const result={filled:[] as string[],failed:[] as string[]};
  if(normalizeCik(cik)==='833079'){result.failed.push('MTH unsupported_dimensional_consolidation');return result;}
  for(const filing of findIssuerRevenueFilings(facts,filings,cik)){
    const label=`Revenue ${filing.form} ${filing.report_date} ${filing.accession_number}`;
    try{
      const xml=await fetchInstance(filing);await sleep(600);
      const primaryHtml=POLICIES[normalizeCik(cik)]?.soleLicense&&filing.primary_document?await secFetchText(filingUrl(filing.cik,filing.accession_number,filing.primary_document)):undefined;
      if(primaryHtml)await sleep(600);
      const extracted=xml?extractIssuerRevenue(xml,filing,cik,primaryHtml):{facts:[],reason:'missing_instance'};
      if(injectIssuerRevenue(facts,filing,extracted.facts)>0)result.filled.push(label);
      else result.failed.push(`${label} ${extracted.reason??'no_missing_revenue'}`);
    }catch{result.failed.push(`${label} source_fetch_failed`);}
  }
  return result;
}
