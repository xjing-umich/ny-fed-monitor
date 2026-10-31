'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Lang } from '@/lib/nav';
import type { PublicationStamp } from '@/lib/valuation/publicationProjection';
export type SafetyStamp=Pick<PublicationStamp,'ticker'|'identityKey'|'revisionId'|'priceDate'|'computedAt'>;
type Status='checking'|'verified'|'pending'|'unavailable';
const copy={en:{checking:'Historical values · checking current status',verified:'Visible valuation versions verified · aggregate counts remain historical',pending:'Publication pending or valuation withdrawn · historical values only',unavailable:'Cannot verify current status · historical values only'},zh:{checking:'历史估值 · 正在核对当前状态',verified:'可见估值版本已核实 · 汇总数量仍为历史数据',pending:'发布中或估值已撤回 · 仅保留历史数字',unavailable:'无法核实当前状态 · 仅保留历史数字'}};
export function ValuationSafetyBoundary({records,lang,children,sourceAttributes}:{records:SafetyStamp[];lang:Lang;children:ReactNode;sourceAttributes?:Record<string,string>}){
 const root=useRef<HTMLDivElement>(null);const [status,setStatus]=useState<Status>('checking');const [checkedAt,setCheckedAt]=useState<string|null>(null);
 const key=JSON.stringify(records.map(({ticker,identityKey,revisionId,priceDate,computedAt})=>({ticker,identityKey,revisionId,priceDate,computedAt})));
 useEffect(()=>{
  const rows:SafetyStamp[]=JSON.parse(key);let controller:AbortController|null=null;let queued=false;let lastBatch="";
  async function refresh(force=true){
   if(document.visibilityState!=='visible')return;
   const rendered=new Set(Array.from(root.current?.querySelectorAll<HTMLElement>('[data-valuation-revision]')??[]).filter(el=>el.getClientRects().length>0&&!el.closest('details:not([open])')).map(el=>el.dataset.valuationRevision));
   const visible=rows.filter(row=>rendered.has(row.revisionId));
   const batchKey=visible.map(row=>row.revisionId).join(',');
   if(!force&&batchKey===lastBatch)return;
   lastBatch=batchKey;
   controller?.abort();const current=new AbortController();controller=current;setStatus('checking');
   try{
    if(!visible.length){setStatus('pending');return;}
    let valid=true;
    for(let i=0;i<visible.length;i+=100){
     const batch=visible.slice(i,i+100);const response=await fetch(`/api/valuation/state?tickers=${encodeURIComponent(batch.map(r=>r.ticker).join(','))}`,{credentials:'omit',cache:'no-store',signal:current.signal});
     if(!response.ok)throw new Error('unavailable');
     const body=await response.json();if(!Array.isArray(body.states))throw new Error('invalid_response');
     valid=valid&&batch.every(row=>body.states.some((state:{ticker:string;identityKey:string;revisionId:string;status:string})=>state.ticker===row.ticker&&state.identityKey===row.identityKey&&state.revisionId===row.revisionId&&state.status==='valid'));
    }
    if(!current.signal.aborted){setStatus(valid?'verified':'pending');setCheckedAt(new Date().toISOString());}
   }catch{if(!current.signal.aborted)setStatus('unavailable');}
  }
  const trigger=()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;void refresh();});}};
  const hidden=()=>{if(document.visibilityState==='hidden'){controller?.abort();setStatus('checking');}else trigger();};
  const offline=()=>{controller?.abort();setStatus('unavailable');};
  // Client paging/filtering and disclosure openings change the currently rendered batch.
  const observer=new MutationObserver(mutations=>{if(mutations.some(m=>!(m.target instanceof Element ? m.target:m.target.parentElement)?.closest('[role="status"]')))void refresh(false);});if(root.current)observer.observe(root.current,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',hidden);window.addEventListener('online',trigger);window.addEventListener('offline',offline);root.current?.addEventListener('toggle',trigger,true);
  trigger();const element=root.current;
  return()=>{controller?.abort();observer.disconnect();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('online',trigger);window.removeEventListener('offline',offline);element?.removeEventListener('toggle',trigger,true);};
 },[key]);
 const asOf=records.reduce<string|null>((date,r)=>r.priceDate&&(!date||r.priceDate>date)?r.priceDate:date,null);
 return <div ref={root} {...sourceAttributes} data-valuation-safety={status} style={status==='verified'?undefined:{'--val-below':'var(--tt-muted)','--val-below-soft':'transparent'} as React.CSSProperties}>
  {records.length>0&&<p className="mb-3 text-xs" role="status">{copy[lang][status]}{asOf?` · ${lang==='zh'?'价格日期':'Price date'} ${asOf}`:''}{checkedAt?` · ${lang==='zh'?'最近核对':'Last checked'} ${checkedAt}`:''}</p>}
  {children}
 </div>;
}
