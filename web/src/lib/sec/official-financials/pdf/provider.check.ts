import assert from 'node:assert/strict';import{createHash}from'node:crypto';
import{fetchOfficialFinancials}from'../source';import{getOfficialSourceRoute}from'../registry';
import{fixturePdf,pdfSourceResponse}from'./test-source-fixtures';
process.env.SEC_USER_AGENT='Compounder PDF fixtures test@example.com';
let mode='normal';
globalThis.fetch=async input=>{
 const u=new URL(input instanceof Request?input.url:String(input));assert.ok(!u.hostname.endsWith('sec.gov'),'PDF routes do not require depositary submissions or SEC companyfacts');
 if(mode==='error')return new Response('unavailable',{status:503});
 if(mode==='redirect')return new Response(null,{status:307,headers:{location:'https://evil.invalid/report.pdf'}});
 if(mode==='html'&&u.pathname.includes('/attachment/'))return new Response('not a PDF');
 return pdfSourceResponse(u)??Promise.reject(Error('unexpected URL '+u));
};
async function main(){
 for(const[ticker,cik,kind,currency]of[['OZK','0001569650','official_fdic_annual_pdf','USD'],['TRMLF','0002071881','official_issuer_annual_pdf','CAD']]){
  const route=getOfficialSourceRoute(ticker,cik)!;
  const result=await fetchOfficialFinancials(route).catch(e=>String(e));
  assert.notEqual(typeof result,'string','official annual PDFs must attach validated native facts');if(typeof result==='string')throw Error(result);
  assert.equal(result.filing,null);assert.equal(result.periods.length,2);
  for(const p of result.periods){assert.equal(p.source_kind,kind);assert.equal(p.reporting_currency,currency);assert.equal(p.source_accession,null);assert.equal(p.source_document_id,createHash('sha256').update(fixturePdf(ticker)).digest('hex'));assert.ok(p.source_pdf_page_count!>0);assert.match(p.source_pdf_extractor!,/^unpdf-1\.7\.0/);assert.equal(p.valuation_eligible,false);}
  assert.equal(result.periods[0].valuation_blockers.includes('fx_conversion_required'),ticker==='TRMLF','USD bank route does not invent FX requirement');
  for(const bad of ['error','redirect']){mode=bad;await assert.rejects(fetchOfficialFinancials(route),/503|untrusted|official/i);mode='normal';}
 }
 mode='html';await assert.rejects(fetchOfficialFinancials(getOfficialSourceRoute('OZK','0001569650')!),/PDF|size/i);
 console.log('canonical official PDF downloads, native metadata, identity and source failure boundaries OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});
