import { fail } from './rows';
export type PdfAnnualSelection = { url: string; publishedAt: string; reportEnd?: string; byteSize: number };
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail('malformed official catalogue object'); return v as Obj; };
const string = (v: unknown) => typeof v === 'string' ? v : fail('malformed official catalogue text');
function isoDate(v: unknown): string {
  const value=string(v);if(!/^20\d{2}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('invalid official annual date');return value;
}
function size(v: unknown): number { const value=Number(v);if(!Number.isInteger(value)||value<100||value>16_000_000)fail('invalid original PDF byte size');return value; }
export function discoverFdicAnnual(input: unknown): PdfAnnualSelection {
  if(!Array.isArray(input)||!input.length||input.length>5000)fail('invalid FDIC catalogue');
  const ids=new Set<number>();
  const candidates=input.flatMap(value=>{
    const r=object(value),form=string(object(r.instFlngForm).instFlngFormNme).split('~')[0].trim();
    if(!['Form 10-K','Form 10-K/A'].includes(form))return[];
    const id=Number(r.instFlngId);if(!Number.isSafeInteger(id)||id<1||ids.has(id))fail('missing or duplicate FDIC filing identity');ids.add(id);
    if(r.orgCertNum!==110||!/^bank (ozk|of the ozarks)$/i.test(string(r.instFincLglName).trim()))fail('FDIC corporate issuer identity mismatch');
    return[{r,form,id,date:isoDate(r.instFlngEvtCausDttm)}];
  }).sort((a,b)=>b.date.localeCompare(a.date));
  if(!candidates.length||candidates[0].form!=='Form 10-K')fail('latest FDIC annual is missing or an unsupported amendment');
  const selected=candidates[0];if(candidates.filter(c=>c.date===selected.date).length!==1)fail('ambiguous latest FDIC annual');
  if(!Array.isArray(selected.r.instFlngAtchList))fail('FDIC attachments unavailable');
  const attachmentIds=new Set<number>();
  const attachments=selected.r.instFlngAtchList.flatMap(value=>{
    const a=object(value),id=Number(a.instFlngAtchId);if(a.instFlngId!==selected.id||!Number.isSafeInteger(id)||id<1||attachmentIds.has(id))fail('invalid FDIC attachment identity');attachmentIds.add(id);
    if(a.instFlngAtchDnldInd==='Y')return[];
    if(a.instFlngAtchDnldInd!=='N')fail('unknown FDIC attachment publication status');
    if(!/\.pdf$/i.test(string(a.instFlngAtchOrglNme)))return[];
    if(a.instFlngAtchStatCde!=='S'||a.instFlngAtchAmndCde!=='O')fail('unsupported FDIC original attachment status');
    return[{id,byteSize:size(a.instFlngAtchSizeQty)}];
  });
  if(attachments.length!==1)fail('missing or ambiguous public FDIC annual PDF');
  return{url:`https://securitiesfilings.fdicconnect.fdic.gov/api/instflng/${selected.id}/attachment/${attachments[0].id}`,publishedAt:selected.date,byteSize:attachments[0].byteSize};
}
export function discoverTourmalineAnnual(html: string): PdfAnnualSelection {
  const scripts=[...html.matchAll(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if(scripts.length!==1)fail('missing or ambiguous Tourmaline annual feed');
  let root:Obj;try{root=object(JSON.parse(scripts[0][1]));}catch{ return fail('invalid Tourmaline annual feed JSON'); }
  const feed=object(object(object(object(root.props).pageProps).sliceContext).documentFeeds)['Financial Reports'];
  if(!Array.isArray(feed)||feed.length>1000)fail('invalid Tourmaline financial report feed');
  const candidates=feed.flatMap(value=>{
    const r=object(value);if(r.type!=='financial_report')return[];
    const data=object(r.data),title=Array.isArray(data.title)?data.title.map(v=>string(object(v).text)).join(' ').trim():fail('missing Tourmaline report title');
    const media=object(data.link),description=title+' '+String(media.name??'')+' '+String(media.url??'');
    if(/french|fran[cç]ais|interim|annual information form|presentation|press release|news release/i.test(description))return[];
    if(!/annual|year\s*end|audited financial statements/i.test(title))return[];
    const year=title.match(/\b(20\d{2})\b/);if(!year)fail('unrecognized annual fiscal year');
    return[{r,data,media,title,year:Number(year[1])}];
  });
  if(!candidates.length)fail('latest Tourmaline annual source unavailable');
  const year=Math.max(...candidates.map(c=>c.year)),latest=candidates.filter(c=>c.year===year);
  if(latest.length!==1||latest[0].title!==`${year} Q4 and Year End Audited Financial Statements`)fail('latest annual missing/ambiguous/unsupported; refusing stale fallback');
  const c=latest[0],raw=string(c.media.url);let url:URL;try{url=new URL(raw);}catch{return fail('invalid annual PDF URL');}
  if(url.protocol!=='https:'||url.username||url.password||url.origin!=='https://tourmaline.cdn.prismic.io'||!/^\/tourmaline\/[^/]+\.pdf$/i.test(url.pathname)||url.search||url.hash||c.media.link_type!=='Media'||c.media.kind!=='file')fail('untrusted Tourmaline annual PDF');
  const first=string(c.r.first_publication_date);if(!/^20\d{2}-\d{2}-\d{2}T/.test(first)||Number.isNaN(Date.parse(first)))fail('annual first-publication date unavailable');
  const publishedAt=isoDate(new Date(first).toISOString().slice(0,10));
  return{url:url.href,publishedAt,reportEnd:`${year}-12-31`,byteSize:size(c.media.size)};
}
