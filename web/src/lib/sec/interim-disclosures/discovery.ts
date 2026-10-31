import {createHash} from "node:crypto";
import {normalizeRecentFilings, type NormalizedFiling, type SecSubmission}from'../company-submissions';
import{filingIndexUrl,secFetchJson,secFetchText}from'../sec-client';
import{INTERIM_PARSER_VERSION,parseInterimDisclosure}from'./parsers';
import{htmlText}from'./html';
import type{StoredInterimDisclosure}from'./store';
import {acceptedTime,normalizedAcceptance}from'./chronology';
export const MAX_INTERIM_FILINGS_PER_PASS=40;
type Dependencies={json:(url:string)=>Promise<unknown>;text:(url:string)=>Promise<string>};
export type InterimDiscoveryFiling=NormalizedFiling&{source_accepted_at?:string|null};
/** Transient discovery metadata: never add this field to sec_filings upserts. */
export function filingsForInterimDiscovery(ticker:string,submission:SecSubmission):InterimDiscoveryFiling[]{
 const recent=submission.filings.recent;
 const acceptance=new Map(recent.accessionNumber.map((accession,index)=>[accession,normalizedAcceptance(recent.acceptanceDateTime?.[index])]));
 return normalizeRecentFilings(ticker,submission,200).map(f=>({...f,source_accepted_at:acceptance.get(f.accession_number)??null}));
}
const financial=(html:string)=>{
 const text=htmlText(html);
 return /CONSOLIDATED\s+(?:STATEMENTS?\s+OF\s+)?(?:INCOME|OPERATIONS|PROFIT|FINANCIAL)/i.test(text)
   && /(?:Net\s+(?:income|earnings|profit|loss)|Profit\s+for)/i.test(text)
   && /(?:revenues?|net sales|research and development|operating expenses)/i.test(text)
   && (text.match(/\d[\d,]*(?:\.\d+)?/g)?.length??0)>=10;
};
/** Inspect actual financial documents; generic 6-K report_date is never a financial period. */
export async function discoverInterimDisclosures(ticker:string,filings:InterimDiscoveryFiling[],previous:StoredInterimDisclosure[],asOf:string,dependencies:Dependencies={json:secFetchJson,text:secFetchText}):Promise<{rows:StoredInterimDisclosure[];issues:string[]}>{
 const updates:StoredInterimDisclosure[]=[];const issues:string[]=[];
 const acceptance=new Map(filings.map(f=>[f.accession_number,normalizedAcceptance(f.source_accepted_at)]));
 // Hydrate all cached accessions before a supported boundary can stop scanning.
 previous=previous.map(r=>{
  const known=acceptance.get(r.accession_number);
  if(known&&acceptedTime(known)!==acceptedTime(r.source_accepted_at)){const hydrated={...r,source_accepted_at:known};updates.push(hydrated);return hydrated;}
  return r;
 });
 const cutoff=Date.parse(asOf)-550*864e5;
 const candidates=filings.filter(f=>f.form==='6-K'&&f.filing_date&&Date.parse(f.filing_date)>=cutoff&&f.filing_date<=asOf.slice(0,10)&&f.primary_document).sort((a,b)=>b.filing_date!.localeCompare(a.filing_date!)||((acceptedTime(b.source_accepted_at)??Infinity)-(acceptedTime(a.source_accepted_at)??Infinity))||b.accession_number.localeCompare(a.accession_number));
 const mayStopAt=(f:InterimDiscoveryFiling,index:number)=>!candidates.slice(index+1).some(next=>next.filing_date===f.filing_date&&(acceptedTime(f.source_accepted_at)==null||acceptedTime(next.source_accepted_at)==null));
 let examined=0;
 for(const[index,f]of candidates.entries()){
  const cached=previous.filter(r=>r.accession_number===f.accession_number);
  if(cached.some(r=>r.parser_version===INTERIM_PARSER_VERSION&&r.status==='supported')){if(mayStopAt(f,index))break;continue;}
  if(cached.length&&cached.every(r=>r.parser_version===INTERIM_PARSER_VERSION&&r.status!=='error')){
   if(cached.some(r=>r.status==='supported'||(r.status==='unsupported'&&r.financial_document)))break;
   continue;
  }
  if(examined++>=MAX_INTERIM_FILINGS_PER_PASS){
    issues.push('interim_discovery_limit');
    updates.push({ticker,cik:f.cik,accession_number:f.accession_number,source_url:filingIndexUrl(f.cik,f.accession_number)+f.primary_document,source_filed_at:f.filing_date!,source_accepted_at:normalizedAcceptance(f.source_accepted_at),parser_version:INTERIM_PARSER_VERSION,status:'error',financial_document:false,report_period_end:null,payload:null,error:'Interim discovery scan incomplete'});
    break;
  }
  const root=filingIndexUrl(f.cik,f.accession_number);
  const primary=root+f.primary_document;
  let urls:string[]=[];let indexFailed=false;
  try{
   const index=await dependencies.json(root+'index.json')as{directory?:{item?:{name?:string}[]}};
   urls=(index.directory?.item??[]).map(i=>i.name??'').filter(n=>/\.html?$/i.test(n)&&/(?:ex(?:hibit)?[-_]?99|financial.?statements|earnings)/i.test(n)).slice(0,4).map(n=>root+n);
  }catch{ indexFailed=true; /* A primary body with complete statements can still recover. */ }
  urls=[...new Set([...urls,primary])];
  for(const url of urls){
   const row:StoredInterimDisclosure={ticker,cik:f.cik,accession_number:f.accession_number,source_url:url,source_filed_at:f.filing_date!,source_accepted_at:normalizedAcceptance(f.source_accepted_at),parser_version:INTERIM_PARSER_VERSION,status:'error',financial_document:false,report_period_end:null,payload:null,error:null};
   try{
    const html=await dependencies.text(url);row.financial_document=financial(html);
    const parsed=parseInterimDisclosure({ticker,html,accessionNumber:f.accession_number,exhibitUrl:url,publishedAt:f.filing_date!});
    if(parsed.status==='supported'){row.status='supported';row.financial_document=true;row.payload={...parsed.evidence,source:{...parsed.evidence.source,documentSha256:createHash('sha256').update(html).digest('hex')}};row.report_period_end=parsed.evidence.current.end;}
    else{row.status=row.financial_document?'unsupported':'no_evidence';row.error=parsed.reason;}
    if(indexFailed&&row.status!=='supported'){row.status='error';row.error='Interim filing directory unavailable and primary statement not recovered';issues.push(row.error);}
   }catch(e){row.error=e instanceof Error?e.message:'Interim document fetch failed';issues.push(row.error);}
   const prior=previous.find(p=>p.accession_number===row.accession_number&&p.source_url===row.source_url);
   // A parser regression cannot erase a previously verified, immutable exhibit.
   updates.push(prior?.status==='supported'&&row.status!=='supported'?{...prior,parser_version:INTERIM_PARSER_VERSION,error:row.error}:row);
   if(row.status==='supported')break;
  }
  if(updates.some(r=>r.accession_number===f.accession_number&&((r.status==='supported'&&mayStopAt(f,index))||(r.status==='unsupported'&&r.financial_document))))break;
 }
 return{rows:[...new Map(updates.map(r=>[`${r.accession_number}|${r.source_url}`,r])).values()],issues};
}
