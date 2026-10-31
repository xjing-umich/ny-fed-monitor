import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { downloadOfficialBytes as download, trustedOfficialUrl as trusted } from './download';
import { normalizeRecentFilings, type SecSubmission, type NormalizedFiling } from '../company-submissions';
import { htmlText } from '../interim-disclosures/html';
import { parseIbnAnnual } from './ibn';
import { parseOfficialInlineAnnual } from './inline';
import { OfficialSourcePendingError } from './registry';
import type { SourceRoute, OfficialFinancialPeriod } from './types';

const MAX_DOCUMENT=48_000_000,MAX_ARCHIVE=24_000_000;
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const fail=(why:string):never=>{throw new Error(`Official annual source: ${why}`);};
export function extractEsefReport(bytes:Uint8Array):{xml:string;name:string}{
 if(bytes.byteLength>MAX_ARCHIVE)fail('ESEF archive exceeds size limit');
 let invalid=false;const reports:{name:string;size:number}[]=[];
 // Inspect every directory entry without inflating. fflate's output map would
 // otherwise hide duplicate names and allocate all reports before ambiguity checks.
 unzipSync(bytes,{filter:file=>{
  if(!/\.xhtml$/i.test(file.name))return false;
  if(file.originalSize>MAX_DOCUMENT||file.name.startsWith('/')||file.name.includes('\\')||file.name.split('/').includes('..')){invalid=true;return false;}
  reports.push({name:file.name,size:file.originalSize});return false;
 }});
 if(invalid||reports.length!==1)fail('ESEF report missing, ambiguous or oversized');
 const report=reports[0],files=unzipSync(bytes,{filter:file=>file.name===report.name});
 if(files[report.name].byteLength!==report.size||files[report.name].byteLength>MAX_DOCUMENT)fail('ESEF report exceeds size limit');
 return {xml:strFromU8(files[report.name]),name:report.name};
}
export function discoverEuropeanAnnual(route:SourceRoute,html:string):{url:string;reportEnd:string;publishedAt:string|null}{
 const links=[...new Set([...html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map(m=>new URL(htmlText(m[1]),route.landing_url).href))];
 const candidates=links.flatMap(url=>{
  const m=route.ticker==='HMRZF'?url.match(/\/hm-(\d{4})-11-30-\d+-[a-z]{2}\.zip$/i):url.match(/\/heineken-holding\/ar-(\d{4})\/ixbrl-viewer\.htm$/i);
  return m?[{url,year:Number(m[1])}]:[];
 });
 const annualYears=links.flatMap(url=>{
  const m=route.ticker==='HMRZF'?url.match(/Annual-and-sustainability-report-(\d{4})\.pdf$/i):url.match(/annual-report-(\d{4})(?:-[^/]*)?\.pdf$/i);
  return m?[Number(m[1])]:[];
 });
 if(!candidates.length)fail('latest supported annual source unavailable');
 const newest=Math.max(...candidates.map(x=>x.year),...annualYears);
 let latest=candidates.filter(x=>x.year===newest);
 if(route.ticker==='HMRZF'&&latest.some(x=>/-sv\.zip$/i.test(x.url)))latest=latest.filter(x=>/-sv\.zip$/i.test(x.url));
 if(latest.length!==1)fail('latest annual source missing or ambiguous; refusing stale fallback');
 const url=latest[0].url;
 trusted(url,route.ticker==='HMRZF'?['https://hmgroup.com','https://www.hmgroup.com']:['https://staticcontents.investis.com']);
 // Publication dates are verified event dates, not archive paths/CMS timestamps.
 // A future source may be ingested with unknown publication date, never backdated.
 const publishedAt=url==='https://hmgroup.com/wp-content/uploads/2026/03/hm-2025-11-30-0-sv.zip'?'2026-03-26'
  :url==='https://staticcontents.investis.com/html/h/heineken-holding/ar-2025/ixbrl-viewer.htm'?'2026-02-11':null;
 return {url,reportEnd:`${newest}-${route.ticker==='HMRZF'?'11-30':'12-31'}`,publishedAt};
}
export async function fetchOfficialFinancials(route:SourceRoute,submission?:SecSubmission):Promise<{periods:OfficialFinancialPeriod[];filing:NormalizedFiling|null}>{
 if(route.adapter==='pdf_pending')throw new OfficialSourcePendingError(route);
 if(route.adapter==='fdic_pdf'||route.adapter==='issuer_pdf')return (await import('./pdf/provider')).fetchPdfAnnual(route);
 const retrieved=new Date().toISOString();let filing:NormalizedFiling|null=null;
 let url:string,reportEnd:string,publishedAt:string|null,document:Uint8Array,periods;
 if(route.adapter==='sec_html'){
  if(!submission||String(submission.cik).padStart(10,'0')!==route.cik)fail('SEC submission issuer identity mismatch');
  const recent=submission!.filings.recent,index=recent.form.findIndex(form=>form==='20-F'||form==='20-F/A');
  if(index<0||recent.form[index]!=='20-F')fail('latest annual 20-F is missing or an unsupported amendment');
  filing=normalizeRecentFilings(route.ticker,submission!,Infinity).find(f=>f.accession_number===recent.accessionNumber[index])??null;
  if(!filing?.report_date||!filing.filing_date||!filing.primary_document||!/^\d{10}-\d{2}-\d{6}$/.test(filing.accession_number)
    ||!/^[A-Za-z0-9_.-]+\.html?$/.test(filing.primary_document))fail('invalid latest SEC annual document identity');
  url=filing!.filing_url;reportEnd=filing!.report_date!;publishedAt=filing!.filing_date;
  document=await download(url,['https://www.sec.gov'],MAX_DOCUMENT);
  periods=parseIbnAnnual(strFromU8(document),reportEnd);
 }else{
  const origins=route.ticker==='HMRZF'?['https://hmgroup.com','https://www.hmgroup.com']:['https://www.heinekenholding.com','https://heinekenholding.com'];
  const landing=strFromU8(await download(route.landing_url,origins,5_000_000));
  const source=discoverEuropeanAnnual(route,landing);({url,reportEnd,publishedAt}=source);
  document=await download(url,route.adapter==='esef_zip'?['https://hmgroup.com','https://www.hmgroup.com']:['https://staticcontents.investis.com'],route.adapter==='esef_zip'?MAX_ARCHIVE:MAX_DOCUMENT);
  const xml=route.adapter==='esef_zip'?extractEsefReport(document).xml:strFromU8(document);
  periods=parseOfficialInlineAnnual(route.ticker,xml,reportEnd);
 }
 if(!validDate(reportEnd)||reportEnd>retrieved.slice(0,10)||(publishedAt&&(!validDate(publishedAt)||publishedAt<reportEnd||publishedAt>retrieved.slice(0,10))))fail('future or inconsistent source availability dates');
 const sha=createHash('sha256').update(document).digest('hex');
 const blockers=['fx_conversion_required','latest_interim_not_integrated',...(publishedAt?[]:['publication_date_unverified']),
  ...(route.ticker==='IBN'?['accounting_basis_not_normalized','adr_conversion_required']:route.ticker==='HKHHF'?['holding_owner_basis_not_normalized']:['share_class_basis_not_normalized'])];
 return {filing,periods:periods.map(p=>({...p,ticker:route.ticker,cik:route.cik,issuer_identifier:route.issuer_identifier,identifier_scheme:route.identifier_scheme,
  reporting_currency:route.currency,accounting_basis:route.accounting_basis,
  source_kind:route.adapter==='sec_html'?'sec_20f_html':route.adapter==='esef_zip'?'official_esef':'official_inline_viewer_copy',
  source_document_id:sha,source_sha256:sha,source_url:url,source_landing_url:route.landing_url,
  source_accession:filing?.accession_number??null,source_published_at:publishedAt,source_report_period_end:reportEnd,source_retrieved_at:retrieved,
  consolidation_scope:'consolidated',share_basis:'issuer_ordinary',valuation_eligible:false,valuation_blockers:blockers}))};
}
