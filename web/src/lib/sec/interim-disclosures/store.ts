import type { SupabaseClient } from '@supabase/supabase-js';
import type { InterimIncomeEvidence } from './types';
import { acceptedTime, normalizedAcceptance } from './chronology';
export type StoredInterimDisclosure={ticker:string;cik:string;accession_number:string;source_url:string;source_filed_at:string;source_accepted_at?:string|null;parser_version:string;status:'supported'|'no_evidence'|'unsupported'|'error';financial_document:boolean;report_period_end:string|null;payload:InterimIncomeEvidence|null;error:string|null};
export type InterimDisclosureData={evidence:InterimIncomeEvidence[];incomplete:boolean;schemaAvailable:boolean;issues:string[]};
export async function readInterimDisclosureRows(db:SupabaseClient,ticker:string,strict=false):Promise<StoredInterimDisclosure[]|null>{
 const{data,error}=await db.from('company_interim_disclosures').select('ticker,cik,accession_number,source_url,source_filed_at,source_accepted_at,parser_version,status,financial_document,report_period_end,payload,error').eq('ticker',ticker).order('source_filed_at',{ascending:false}).order('accession_number',{ascending:false}).limit(200);
 if(error){if(!strict&&['42P01','PGRST205'].includes(error.code))return null;throw new Error(`Interim disclosure read failed (${ticker}): ${error.message}`);}
 return ((data??[])as StoredInterimDisclosure[]).map(r=>({...r,source_accepted_at:normalizedAcceptance(r.source_accepted_at)}));
}
export function interimDisclosureData(rows:StoredInterimDisclosure[]|null):InterimDisclosureData{
 if(rows===null)return{evidence:[],incomplete:false,schemaAvailable:false,issues:['interim_schema_unavailable']};
 const supported=rows.filter(r=>r.status==='supported'&&r.payload).sort((a,b)=>(b.report_period_end??'').localeCompare(a.report_period_end??'')||b.source_filed_at.localeCompare(a.source_filed_at)||((acceptedTime(b.source_accepted_at)??0)-(acceptedTime(a.source_accepted_at)??0)));
 const latest=supported[0];
 const incomplete=rows.some(r=>{
  if(!((r.financial_document&&r.status==='unsupported')||r.status==='error'))return false;
  if(!latest)return true;
  if(r.source_filed_at!==latest.source_filed_at)return r.source_filed_at>latest.source_filed_at;
  if(r.accession_number===latest.accession_number)return false;
  const unresolvedAt=acceptedTime(r.source_accepted_at),supportedAt=acceptedTime(latest.source_accepted_at);
  return unresolvedAt==null||supportedAt==null||unresolvedAt>=supportedAt;
 });
 return{evidence:supported.map(r=>r.payload!),incomplete,schemaAvailable:true,issues:[...new Set(rows.filter(r=>r.financial_document&&r.status!=='supported').map(r=>r.error??r.status))]};
}
export async function saveInterimDisclosures(db:SupabaseClient,rows:StoredInterimDisclosure[]):Promise<void>{
 for(let i=0;i<rows.length;i+=100){const{error}=await db.from('company_interim_disclosures').upsert(rows.slice(i,i+100).map(r=>({...r,checked_at:new Date().toISOString()})),{onConflict:'ticker,accession_number,source_url'});if(error)throw new Error(`Interim disclosure write failed: ${error.message}`);}
}
/** No checked_at timestamp: retries alone must not invalidate financial pages. */
export function interimPublicationContent(rows:StoredInterimDisclosure[]):object[]{
 return rows.filter(r=>r.financial_document||r.status==='error').map(r=>Object.fromEntries(Object.entries(r).filter(([key])=>!['checked_at','error'].includes(key))));
}
