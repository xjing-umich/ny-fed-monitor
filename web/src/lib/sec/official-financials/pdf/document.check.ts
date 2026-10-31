import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
assert.ok(fs.existsSync(new URL('./document.ts',import.meta.url)),'bounded native PDF text extraction is not implemented');
async function main(){
 const {extractPdfDocument}=await import('./document');
 for(const ticker of ['ozk','trmlf']){
  const data=new Uint8Array(fs.readFileSync(new URL('./fixtures/'+ticker+'-original-pages.pdf',import.meta.url)));
  const sourceHash=createHash('sha256').update(data).digest('hex');
  const doc=await extractPdfDocument(data);
  assert.equal(createHash('sha256').update(data).digest('hex'),sourceHash,'PDF parsing must preserve original bytes for source SHA provenance');
  const map=JSON.parse(fs.readFileSync(new URL('./fixtures/'+ticker+'-page-map.json',import.meta.url),'utf8'));
  assert.equal(doc.page_count,map.original_pages.length);
  assert.deepEqual(doc.pages.map(p=>p.number),map.original_pages.map((_:number,i:number)=>i+1));
  assert.ok(doc.pages.some(p=>p.lines.some(l=>l.includes(ticker==='ozk'?'Total assets':'Total Assets'))));
  assert.match(doc.extractor,/unpdf-1\.7\.0/);
 }
 await assert.rejects(extractPdfDocument(new TextEncoder().encode('<html>blocked</html>')),/PDF/,'wrong content must fail before parsing');
 await assert.rejects(extractPdfDocument(new Uint8Array(16_000_001)),/PDF/,'original download has a fixed byte ceiling');
 await assert.rejects(extractPdfDocument(new TextEncoder().encode('%PDF-1.4\nnot a valid document')),/PDF/i);
 for(const [name,reason]of [['encrypted-empty.pdf',/password/i],['empty.pdf',/no usable text/i],['too-many-pages.pdf',/page count/i]]as const)await assert.rejects(extractPdfDocument(new Uint8Array(fs.readFileSync(new URL('./fixtures/'+name,import.meta.url)))),reason,name+' cannot become usable text');
 await assert.rejects(extractPdfDocument(new Uint8Array(fs.readFileSync(new URL('./fixtures/offset-negative-sign.pdf',import.meta.url)))),/unassociated numeric sign/i,'a real PDF minus offset by2pt must not leave an accepted positive cash outflow');
 console.log('original PDF positioned text, byte and format boundaries OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});
