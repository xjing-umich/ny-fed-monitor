import { createHash } from 'node:crypto';
import { downloadOfficialBytes } from '../download';
import type { OfficialFinancialPeriod, SourceRoute } from '../types';
import { extractPdfDocument } from './document';
import { discoverFdicAnnual, discoverTourmalineAnnual } from './discovery';
import { ozkReportEnd, parseOzkAnnual } from './ozk';
import { parseTrmlfAnnual, trmlfAuthorizedAt } from './trmlf';
import { fail } from './rows';

export async function fetchPdfAnnual(route: SourceRoute): Promise<{ periods: OfficialFinancialPeriod[]; filing: null }> {
  const bank=route.ticker==='OZK';if(!((bank&&route.adapter==='fdic_pdf')||(route.ticker==='TRMLF'&&route.adapter==='issuer_pdf')))fail('unregistered PDF issuer adapter');
  const retrieved=new Date().toISOString(),origin=bank?'https://securitiesfilings.fdicconnect.fdic.gov':'https://www.tourmalineoil.com';
  const landing=new TextDecoder().decode(await downloadOfficialBytes(route.landing_url,[origin],5_000_000));
  const selection=bank?discoverFdicAnnual(JSON.parse(landing)):discoverTourmalineAnnual(landing);
  const bytes=await downloadOfficialBytes(selection.url,[bank?origin:'https://tourmaline.cdn.prismic.io'],16_000_000);
  if(bytes.byteLength!==selection.byteSize)fail('original PDF byte size differs from official catalogue');
  const document=await extractPdfDocument(bytes),reportEnd=selection.reportEnd??ozkReportEnd(document.pages);
  const annual=bank?parseOzkAnnual(document.pages,reportEnd):parseTrmlfAnnual(document.pages,reportEnd);
  if(reportEnd>retrieved.slice(0,10)||selection.publishedAt<reportEnd||selection.publishedAt>retrieved.slice(0,10)
    ||(!bank&&selection.publishedAt<trmlfAuthorizedAt(document.pages)))fail('inconsistent annual source availability dates');
  const sha=createHash('sha256').update(bytes).digest('hex');
  return{filing:null,periods:annual.map(period=>({...period,ticker:route.ticker,cik:route.cik,
    issuer_identifier:route.issuer_identifier,identifier_scheme:route.identifier_scheme,reporting_currency:route.currency,accounting_basis:route.accounting_basis,
    source_kind:bank?'official_fdic_annual_pdf':'official_issuer_annual_pdf',source_document_id:sha,source_sha256:sha,
    source_url:selection.url,source_landing_url:route.landing_url,source_accession:null,source_published_at:selection.publishedAt,
    source_report_period_end:reportEnd,source_retrieved_at:retrieved,source_pdf_page_count:document.page_count,source_pdf_extractor:document.extractor,
    consolidation_scope:'consolidated',share_basis:'issuer_ordinary',valuation_eligible:false,
    valuation_blockers:bank?['bank_valuation_basis_not_normalized','latest_interim_not_integrated']:['fx_conversion_required','latest_interim_not_integrated'],
  }))};
}
