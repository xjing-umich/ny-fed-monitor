import { getDocumentProxy } from 'unpdf';

export type PdfPage = { number: number; lines: string[] };
export type PdfDocument = { pages: PdfPage[]; page_count: number; extractor: string };
type TextItem = { str: string; transform: number[]; width: number; height: number };
export const PDF_EXTRACTOR = 'unpdf-1.7.0/positioned-lines-v1';
const fail = (message: string): never => { throw new Error(`Official PDF: ${message}`); };

/** Text only: no canvas, OCR, JavaScript execution or external font fetches. */
export async function extractPdfDocument(bytes: Uint8Array): Promise<PdfDocument> {
  if (bytes.byteLength > 16_000_000 || !new TextDecoder().decode(bytes.subarray(0, 8)).startsWith('%PDF-')) fail('invalid or oversized PDF');
  const started = performance.now();
  // PDF.js transfers/detaches its input buffer; the caller retains the original
  // download for source-byte identity and SHA provenance.
  const pdf = await getDocumentProxy(bytes.slice(), { isEvalSupported: false, disableFontFace: true, useSystemFonts: false,
    useWorkerFetch: false, disableAutoFetch: true, disableStream: true, maxImageSize: 1, stopAtErrors: true });
  try {
    if (pdf.numPages < 1 || pdf.numPages > 200) fail('unsupported PDF page count');
    const pages: PdfPage[] = []; let chars = 0, count = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      if (performance.now() - started > 60_000) fail('PDF extraction time budget exceeded');
      const page = await pdf.getPage(number);
      try {
        const content = await page.getTextContent();
        if (content.items.length > 20_000) fail('PDF page item limit exceeded');
        const items = content.items.filter((item): item is TextItem & typeof item => 'str' in item && !!item.str.trim());
        count += items.length; if (count > 400_000) fail('PDF total item limit exceeded');
        const rows: { y: number; items: TextItem[] }[] = [];
        for (const item of items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
          if (item.transform.some(v => !Number.isFinite(v))) fail('invalid PDF text position');
          let row = rows.at(-1);
          if (!row || Math.abs(row.y - item.transform[5]) > 1.5) { row = { y: item.transform[5], items: [] }; rows.push(row); }
          row.items.push(item);
        }
        const lines = rows.map(row => row.items.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
        if(lines.some(line=>line.length>4096))fail('PDF line length limit exceeded');
        chars += lines.reduce((n, line) => n + line.length, 0); if (chars > 8_000_000) fail('PDF text limit exceeded');
        pages.push({ number, lines });
      } finally { page.cleanup(); }
    }
    if (!pages.some(page => page.lines.length)) fail('PDF has no usable text; OCR is unsupported');
    return { pages, page_count: pdf.numPages, extractor: PDF_EXTRACTOR };
  } catch (error) { throw new Error(`Official PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`); }
  finally { await pdf.destroy(); }
}
