import type { ReactNode } from 'react';
import type { PublishedValuation } from '@/lib/valuation/publishedRead';
import { publicationSourceDigest, publicationRowAttributes } from '@/lib/valuation/publicationProof';
export function valuationSourceDigest(records:PublishedValuation[]):string{return publicationSourceDigest(records.map(v=>v.record));}
export function ValuationPublicationMarker({identityKey,revisionId,children}:{identityKey:string;revisionId:string;children:ReactNode}){return <div {...publicationRowAttributes({identityKey,revisionId})}>{children}</div>;}
export function ValuationUnavailable({lang,reason}:{lang:'en'|'zh';reason:string|null}){
 if(!reason)return null;
 const preparation=reason==='not_configured'||reason==='schema_missing';
 const message=preparation?(lang==='zh'?'估值数据仍在准备中。':'Valuation data is being prepared.'):(lang==='zh'?'估值暂不可用。':'Valuation is unavailable.');
 return <p className="my-3 text-sm" role="status" data-valuation-unavailable={reason}>{message} {lang==='zh'?'持仓与研究资料仍可查阅。':'Holdings and research remain available.'}</p>;
}
