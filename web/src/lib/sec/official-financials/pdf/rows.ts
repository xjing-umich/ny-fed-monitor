import type { AnnualSourcePeriod } from '../types';
import type { PdfPage } from './document';

export type Block = { page: PdfPage; start: number; end: number };
type Cell = { value: number; raw: string };
export function fail(why: string): never { throw new Error(`Official annual PDF: ${why}`); }
export const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-').replace(/\s+/g, ' ').replace(/\(\s+/g,'(').replace(/\s+\)/g,')').trim();
export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function block(pages: PdfPage[], heading: RegExp, next?: RegExp, primary = false): Block {
  const hits = pages.flatMap(page => page.lines.flatMap((line, start) => heading.test(norm(line)) && (!primary || start < 8) ? [{ page, start, end: page.lines.length }] : []));
  if (hits.length !== 1) fail('missing or ambiguous statement/note heading');
  const hit = hits[0];
  if (next) { const end = hit.page.lines.findIndex((line, i) => i > hit.start && next.test(norm(line))); if (end >= 0) hit.end = end; }
  return hit;
}
export const contents = (b: Block) => b.page.lines.slice(b.start, b.end).map(norm).join(' ');
function tableHeader(b: Block) {
  const lines=b.page.lines.slice(b.start,b.end).map(norm);
  const index=lines.findIndex(line=>(line.match(/\b20\d{2}\b/g)?.length??0)>=2);
  if(index<0)fail('annual year header unavailable');
  return {yearLine:lines[index],text:lines.slice(Math.max(0,index-3),index+3).join(' ')};
}
export function columns(b: Block, year: number, count: number, annual = true) {
  const header=tableHeader(b),years=header.yearLine.match(/\b20\d{2}\b/g)?.map(Number);
  if (!years || years.length !== count || years.some((y, i) => y !== year - i)) fail('unexpected annual column years/order');
  if (!header.text.includes('December 31') || (annual && !/Years? Ended/.test(header.text))) fail('unverified annual duration header');
}
export function moneyHeader(b: Block, issuer: 'OZK' | 'TRMLF') {
  const header = tableHeader(b).text;
  if (!(issuer === 'OZK' ? /\(Dollars in thousands(?:, except per share amounts)?\)/ : /\(000s\)/).test(header)) fail('unverified monetary scale');
}
export function cells(raw: string, expected: number, dashZero = false): Cell[] {
  const text = raw.replace(/\$/g, ' '); const found: Cell[] = [];
  const residue = text.replace(/\(\s*\d[\d,]*(?:\.\d+)?\s*\)|[+\-−]?\d[\d,]*(?:\.\d+)?|[–—−-]/g, token => {
    const compact = norm(token).replace(/\s/g, '');
    if (compact === '-') { if (!dashZero) fail('unsupported dash in numeric row'); found.push({ value: 0, raw: token }); return ''; }
    const negative = compact.startsWith('('), numeric = compact.replace(/^\(|\)$/g, '');
    if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(numeric)) fail('malformed numeric cell');
    const value = Number(numeric.replaceAll(',', '')) * (negative ? -1 : 1);
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) fail('unsafe numeric cell');
    found.push({ value, raw: token }); return '';
  });
  if (residue.trim() || found.length !== expected) fail('missing, malformed or shifted numeric columns');
  return found;
}
export function periods(year: number): AnnualSourcePeriod[] {
  return [0, 1].map(i => ({ period_start: `${year - i}-01-01`, period_end: `${year - i}-12-31`, fiscal_period: 'FY', is_comparative: i === 1, metrics: {}, raw_facts: {} }));
}
export function save(out: AnnualSourcePeriod[], metric: string, b: Block, line: number, label: string, input: Cell[], unit: string, scale = 1000, indices = [0, 1], endLine = line) {
  out.forEach((p, i) => {
    const c = input[indices[i]], value = c.value * scale;
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) fail('unsafe scaled value');
    p.metrics[metric] = value;
    p.raw_facts[metric] = { value, unit, scale, raw_value: c.raw, source_label: label,
      source_locator: `pdf-page:${b.page.number}/line${line === endLine ? '' : 's'}:${line + 1}${line === endLine ? '' : '-' + (endLine + 1)}/period:${p.period_end}` };
  });
}
export function row(out: AnnualSourcePeriod[], metric: string, b: Block, label: string, count: number, unit: string, scale = 1000, dashZero = false, indices = [0, 1], continuation?: string) {
  const pattern = new RegExp('^' + esc(norm(label)) + '(?=\\s*[$(\\d+\\-−–—]|$)');
  const hits = b.page.lines.flatMap((line, index) => index >= b.start && index < b.end && pattern.test(norm(line)) ? [{ line, index }] : []);
  if (hits.length !== 1) fail(`missing or ambiguous row: ${label}`);
  const labelEnd=(line:string,text:string)=>{for(let i=1;i<=line.length;i++)if(norm(line.slice(0,i))===norm(text))return i;return fail('printed row label unavailable');};
  const hit = hits[0],printedEnd=labelEnd(hit.line,label); let raw = hit.line.slice(printedEnd), end = hit.index;
  if (continuation) {
    if (raw.trim() || end + 1 >= b.end || !norm(b.page.lines[end + 1]).startsWith(continuation + ' ')) fail('unsupported wrapped numeric row');
    end++; raw = b.page.lines[end].slice(labelEnd(b.page.lines[end],continuation));
  }
  save(out, metric, b, hit.index, continuation ? hit.line+' '+continuation : hit.line.slice(0,printedEnd), cells(raw, count, dashZero), unit, scale, indices, end);
}
export function calendarDate(month: string, day: string, year: string): string {
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const value = `${year}-${String(names.indexOf(month) + 1).padStart(2,'0')}-${day.padStart(2,'0')}`;
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) fail('invalid document date');
  return value;
}
