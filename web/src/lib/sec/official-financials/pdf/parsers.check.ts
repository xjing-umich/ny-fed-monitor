import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractPdfDocument, type PdfDocument } from './document';
const load=(ticker:string):PdfDocument=>JSON.parse(fs.readFileSync(new URL('./fixtures/'+ticker.toLowerCase()+'-pages.json',import.meta.url),'utf8'));
const expected=JSON.parse(fs.readFileSync(new URL('./fixtures/expected.json',import.meta.url),'utf8'));
assert.ok(fs.existsSync(new URL('./ozk.ts',import.meta.url))&&fs.existsSync(new URL('./trmlf.ts',import.meta.url)),'official annual PDF parsers are not implemented');
async function main(){
 const{parseOzkAnnual,ozkReportEnd}=await import('./ozk');const{parseTrmlfAnnual,trmlfAuthorizedAt}=await import('./trmlf');
 const copy=(d:PdfDocument)=>structuredClone(d);
 const replace=(d:PdfDocument,a:string,b:string)=>{const c=copy(d);for(const p of c.pages)p.lines=p.lines.map(l=>l.replaceAll(a,b));return c;};
 for(const [ticker,parse]of[['OZK',parseOzkAnnual],['TRMLF',parseTrmlfAnnual]]as const){
  const d=load(ticker),periods=parse(d.pages,'2025-12-31');
  assert.equal(periods.length,2);assert.equal(periods[0].is_comparative,false);assert.equal(periods[1].is_comparative,true);
  for(const p of periods){
   assert.equal(p.period_start,p.period_end.slice(0,4)+'-01-01');assert.deepEqual(p.metrics,expected[ticker][p.period_end]);
   assert.equal('profit_loss_attributable_to_owners'in p.metrics,false,'unreported owner earnings stay unknown');
   for(const e of Object.values(p.raw_facts)){assert.match(e.source_locator,/^pdf-page:\d+\/lines?:\d+/);assert.ok(e.source_label);assert.ok(e.raw_value);}
  }
  const originalPacket=await extractPdfDocument(new Uint8Array(fs.readFileSync(new URL('./fixtures/'+ticker.toLowerCase()+'-original-pages.pdf',import.meta.url))));
  const pageMap=JSON.parse(fs.readFileSync(new URL('./fixtures/'+ticker.toLowerCase()+'-page-map.json',import.meta.url),'utf8'));
  originalPacket.pages.forEach((page,i)=>{page.number=pageMap.original_pages[i];});
  assert.deepEqual(parse(originalPacket.pages,'2025-12-31').map(p=>p.metrics),periods.map(p=>p.metrics),'real original-page PDF must reach identical financial facts');
  assert.throws(()=>parse(d.pages,'2024-12-31'),/PDF|annual/i,'wrong expected fiscal year');
  const badYear=replace(d,'2025','2026');assert.throws(()=>parse(badYear.pages,'2025-12-31'),/PDF|annual/i);
  const duplicate=copy(d);duplicate.pages.push(structuredClone(d.pages.find(p=>p.lines.some(l=>l.includes(ticker==='OZK'?'CONSOLIDATED BALANCE SHEETS':'CONSOLIDATED STATEMENTS OF FINANCIAL POSITION')))!));
  assert.throws(()=>parse(duplicate.pages,'2025-12-31'),/PDF|annual/i,'duplicate statement is ambiguous');
  const missing=copy(d);const label=ticker==='OZK'?'Total assets':'Revenue from contracts with customers';for(const p of missing.pages)p.lines=p.lines.filter(l=>!l.startsWith(label));
  assert.throws(()=>parse(missing.pages,'2025-12-31'),/PDF|annual/i,'missing core row is not zero or a nearby subtotal');
  const extra=copy(d);for(const p of extra.pages)p.lines=p.lines.map(l=>l.startsWith(label)?l+' 999':l);
  assert.throws(()=>parse(extra.pages,'2025-12-31'),/PDF|annual/i,'shifted columns fail closed');
  const repeat=copy(d);for(const p of repeat.pages){const line=p.lines.find(l=>l.startsWith(label));if(line)p.lines.push(line);}
  assert.throws(()=>parse(repeat.pages,'2025-12-31'),/PDF|annual/i,'duplicate source row fails even if values equal');
 }
 const o=load('OZK');assert.equal(ozkReportEnd(o.pages),'2025-12-31');
 assert.throws(()=>parseOzkAnnual(replace(o,'FDIC Certificate No. 110','FDIC Certificate No. 111').pages,'2025-12-31'),/PDF|annual/i);
 assert.throws(()=>parseOzkAnnual(replace(o,'Dollars in thousands','Dollars in millions').pages,'2025-12-31'),/PDF|annual/i);
 const ozk=parseOzkAnnual(o.pages,'2025-12-31');assert.equal('revenue'in ozk[0].metrics,false);
 assert.equal(ozk[0].metrics.noncontrolling_interest_adjustment,21000);assert.equal(ozk[1].metrics.noncontrolling_interest_adjustment,-47000);
 assert.equal(ozk[0].raw_facts.weighted_average_shares.scale,1000);assert.equal(ozk[0].raw_facts.basic_eps.scale,1);
 const changedShareUnit=replace(o,'Denominator for basic EPS – weighted-average common shares 112,769','Denominator for basic EPS – weighted-average common shares 112,769,000');
 assert.throws(()=>parseOzkAnnual(changedShareUnit.pages,'2025-12-31'),/PDF|EPS/i,'an EPS denominator changed to actual shares must not be multiplied by1000 again');
 const t=load('TRMLF');assert.equal(trmlfAuthorizedAt(t.pages),'2026-03-04');
 assert.throws(()=>parseTrmlfAnnual(replace(t,'Canadian dollars','United States dollars').pages,'2025-12-31'),/PDF|annual/i);
 assert.throws(()=>parseTrmlfAnnual(replace(t,'Tourmaline Oil Corp.','Different Oil Corp.').pages,'2025-12-31'),/PDF|annual/i);
 assert.throws(()=>parseTrmlfAnnual(replace(t,'thousands of dollars','millions of dollars').pages,'2025-12-31'),/PDF|annual/i);
 const tour=parseTrmlfAnnual(t.pages,'2025-12-31');assert.equal('total_liabilities'in tour[0].metrics,false);
 assert.equal(tour[0].metrics.revenue,6302997000);assert.equal(tour[0].metrics.cash_and_equivalents,0);
 assert.equal(tour[1].metrics.current_debt,0);assert.equal(tour[0].raw_facts.weighted_average_shares.scale,1);
 const shiftedDiluted=copy(t);const epsPage=shiftedDiluted.pages.find(p=>p.number===86)!;
 const diluted=epsPage.lines.findIndex(l=>l==='Diluted earnings per share was calculated as follows:');
 const dilutedYears=epsPage.lines.findIndex((l,i)=>i>diluted&&l==='2025 2024');assert.ok(dilutedYears>diluted);epsPage.lines[dilutedYears]='2024 2023';
 assert.throws(()=>parseTrmlfAnnual(shiftedDiluted.pages,'2025-12-31'),/PDF|annual/i,'each EPS subtable must have its own verified current/prior header');
 console.log('official PDF annual source semantics, units, periods, columns and failure boundaries OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});
