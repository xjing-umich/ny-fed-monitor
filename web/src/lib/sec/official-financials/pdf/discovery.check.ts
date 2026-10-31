import assert from 'node:assert/strict';import fs from 'node:fs';
const read=(name:string)=>JSON.parse(fs.readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'));
assert.ok(fs.existsSync(new URL('./discovery.ts',import.meta.url)),'official annual PDF discovery is not implemented');
async function main(){
 const{discoverFdicAnnual,discoverTourmalineAnnual}=await import('./discovery');
 const index=read('fdic-index.json'),full=index.find((r:{instFlngId:number})=>r.instFlngId===11868);
 const s=discoverFdicAnnual(index.reverse());assert.equal(s.url,'https://securitiesfilings.fdicconnect.fdic.gov/api/instflng/11868/attachment/1');assert.equal(s.publishedAt,'2026-02-25');assert.equal(s.reportEnd,undefined,'FDIC filing date is not the report period');
 for(const mutate of [
  (r:typeof index)=>{r.push({...structuredClone(full),instFlngId:99999,instFlngEvtCausDttm:'2026-03-01',instFlngForm:{instFlngFormNme:'Form 10-K/A~Annual Amendment'}});},
  (r:typeof index)=>{r.push({...structuredClone(full),instFlngId:99998});},
  (r:typeof index)=>{r.find((x:{instFlngId:number})=>x.instFlngId===11868).orgCertNum=111;},
  (r:typeof index)=>{r.find((x:{instFlngId:number})=>x.instFlngId===11868).instFlngAtchList[0].instFlngAtchDnldInd='Y';},
  (r:typeof index)=>{const f=r.find((x:{instFlngId:number})=>x.instFlngId===11868);f.instFlngAtchList.push({...f.instFlngAtchList[0],instFlngAtchId:2});},
 ]){const x=structuredClone(index);mutate(x);assert.throws(()=>discoverFdicAnnual(x),/PDF|annual|FDIC/i);}
 const data=read('tourmaline-index.json');
 const html=(d:unknown)=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(d)+'</script>';
 const t=discoverTourmalineAnnual(html(data));assert.equal(t.reportEnd,'2025-12-31');assert.equal(t.publishedAt,'2026-03-04');assert.match(t.url,/FinalQ42025MDAFinancialStatements\.pdf$/);
 const feed=(d:typeof data)=>d.props.pageProps.sliceContext.documentFeeds['Financial Reports'];
 const current=feed(data).find((r:{id:string})=>r.id==='aaidFBoAAEgAt0Ao');assert.ok(current);
 for(const mutate of [
  (d:typeof data)=>{feed(d).push(structuredClone(current));},
  (d:typeof data)=>{const c=structuredClone(current);c.id='newannual';c.data.title=[{text:'2026 Annual Financial Statements'}];feed(d).push(c);},
  (d:typeof data)=>{feed(d).find((r:{id:string})=>r.id===current.id).data.link.url='https://evil.invalid/annual.pdf';},
  (d:typeof data)=>{feed(d).find((r:{id:string})=>r.id===current.id).first_publication_date=null;},
  (d:typeof data)=>{feed(d).find((r:{id:string})=>r.id===current.id).data.link.url='http://tourmaline.cdn.prismic.io/tourmaline/annual.pdf';},
 ]){const x=structuredClone(data);mutate(x);assert.throws(()=>discoverTourmalineAnnual(html(x)),/PDF|annual|Tourmaline/i);}
 assert.throws(()=>discoverTourmalineAnnual(html(data)+html(data)),/PDF|annual/i,'multiple feed scripts are ambiguous');
 console.log('latest official PDF discovery, amendments, English feed, dates and identity checks OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});
