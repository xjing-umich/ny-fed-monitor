import fs from 'node:fs';import path from 'node:path';
const[web,scratch]=process.argv.slice(2),rows=[];
const legacy=JSON.parse(fs.readFileSync(path.join(web,'src/lib/sec/official-financials/fixtures/expected.json'),'utf8'));
const definitions={IBN:{cik:'0001103838',issuer:'0001103838',scheme:'CIK',currency:'INR',basis:'Indian-GAAP',kind:'sec_20f_html',end:'2026-03-31',pub:'2026-07-20',url:'https://www.sec.gov/Archives/edgar/data/1103838/fixture.htm',accession:'0000950103-26-010820',sha:'a'},HMRZF:{cik:'0001396282',issuer:'529900O5RR7R39FRDM42',scheme:'LEI',currency:'SEK',basis:'IFRS',kind:'official_esef',end:'2025-11-30',pub:'2026-03-26',url:'https://hmgroup.com/fixture.zip',sha:'b'},HKHHF:{cik:'0001142231',issuer:'724500M1WJLFM9TYBS04',scheme:'LEI',currency:'EUR',basis:'IFRS',kind:'official_inline_viewer_copy',end:'2025-12-31',pub:'2026-02-11',url:'https://staticcontents.investis.com/html/h/heineken-holding/fixture.htm',sha:'c'}};
const base=(ticker,c,end)=>({ticker,cik:c.cik,issuer_identifier:c.issuer,identifier_scheme:c.scheme,reporting_currency:c.currency,accounting_basis:c.basis,source_kind:c.kind,source_document_id:c.sha.repeat(64),source_sha256:c.sha.repeat(64),source_url:c.url,source_landing_url:c.url,source_accession:c.accession??null,source_published_at:c.pub,source_report_period_end:c.end,source_retrieved_at:'2026-10-31T00:00:00Z',period_start:end.slice(0,4)+'-01-01',period_end:end,fiscal_period:'FY',is_comparative:end!==c.end,consolidation_scope:'consolidated',share_basis:'issuer_ordinary',valuation_eligible:false,valuation_blockers:[],metrics:{},raw_facts:{},created_at:'2026-10-31T00:00:00Z',updated_at:'2026-10-31T00:00:00Z'});
for(const[ticker,c]of Object.entries(definitions))for(const[end,expected]of Object.entries(legacy[ticker])){
 const r=base(ticker,c,end);r.metrics={...expected};if(!('profit_loss_attributable_to_owners'in r.metrics))r.metrics.profit_loss_attributable_to_owners=ticker==='HMRZF'?11621000000:498000000;
 if(ticker==='IBN')r.period_start=(Number(end.slice(0,4))-1)+'-04-01';if(ticker==='HMRZF')r.period_start=(Number(end.slice(0,4))-1)+'-12-01';rows.push(r);
}
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
fs.writeFileSync(path.join(scratch,'legacy.sql'),`insert into official_financial_periods select * from jsonb_populate_recordset(null::official_financial_periods,${literal(rows)}); create table pdf_fixture_legacy_before as select to_jsonb(t) as data from official_financial_periods t;`);
const expected=JSON.parse(fs.readFileSync(path.join(web,'src/lib/sec/official-financials/pdf/fixtures/expected.json'),'utf8'));const pdf=[];
for(const ticker of ['OZK','TRMLF'])for(const[end,metrics]of Object.entries(expected[ticker])){
 const bank=ticker==='OZK',c=bank?{cik:'0001569650',issuer:'110',scheme:'FDIC_CERT',currency:'USD',basis:'US-GAAP',kind:'official_fdic_annual_pdf',end:'2025-12-31',pub:'2026-02-25',url:'https://securitiesfilings.fdicconnect.fdic.gov/api/instflng/11868/attachment/1',sha:'d'}:{cik:'0002071881',issuer:'89156V106',scheme:'CUSIP',currency:'CAD',basis:'IFRS',kind:'official_issuer_annual_pdf',end:'2025-12-31',pub:'2026-03-04',url:'https://tourmaline.cdn.prismic.io/tourmaline/fixture.pdf',sha:'e'};
 const r=base(ticker,c,end);r.metrics=metrics;r.source_pdf_page_count=bank?139:90;r.source_pdf_extractor='unpdf-1.7.0/positioned-lines-v1';
 r.source_landing_url=bank?'https://securitiesfilings.fdicconnect.fdic.gov/api/instflng/cert/110':'https://www.tourmalineoil.com/investors/financial-reports';
 for(const[key,value]of Object.entries(metrics)){
  const eps=key.endsWith('_eps'),shares=key.includes('shares'),scale=eps?1:shares?(bank&&key.includes('weighted')?1000:1):1000;
  r.raw_facts[key]={value,unit:eps?c.currency+'/shares':shares?'shares':c.currency,scale,raw_value:String(value/scale),source_label:'Synthetic SQL fixture '+key,source_locator:`pdf-page:1/line:1/period:${end}`};
 }
 pdf.push(r);
}
fs.writeFileSync(path.join(scratch,'pdf.sql'),`insert into official_financial_periods select * from jsonb_populate_recordset(null::official_financial_periods,${literal(pdf)});`);
