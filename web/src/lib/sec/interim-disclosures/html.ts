/** Small, non-executing helpers for bounded SEC exhibit adapters; not a general HTML parser. */
export function htmlText(html: string): string {
  const entities: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", ndash: "–", mdash: "—", minus: "−" };
  return html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (full, entity: string) => {
      if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? full;
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
    }).replace(/\s+/g, " ").trim();
}
export type HtmlTable = { precedingText: string; rows: string[][] };
export function htmlTables(html: string): HtmlTable[] {
  // Nested layout tables are deliberately unsupported rather than flattened into financial columns.
  const out: HtmlTable[] = [];
  for (const match of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    if (/<table\b/i.test(match[1])) continue;
    const rows = [...match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
      [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => htmlText(cell[1])).filter(Boolean));
    out.push({ precedingText: htmlText(html.slice(0, match.index)).slice(-400), rows });
  }
  return out;
}
/** Retain parentheses even when a filer puts the closing bracket in its own cell. */
export function financialNumbers(cells: string[]): number[] | null {
  let rest = cells.join(" ").replace(/−/g, "-");
  const out: number[] = [];
  rest = rest.replace(/\(?\s*[+-]?\d[\d,]*(?:\.\d+)?\s*\)?/g, raw => {
    const compact = raw.replace(/\s/g, "");
    if (!/^(?:[+-]?\d{1,3}(?:,\d{3})+|[+-]?\d+)(?:\.\d+)?$/.test(compact.replace(/^\(|\)$/g, "")) || compact.startsWith("(") !== compact.endsWith(")")) {
      out.push(NaN); return "";
    }
    out.push(Number(compact.replace(/[(),]/g, "")) * (compact.startsWith("(") ? -1 : 1));
    return "";
  });
  return rest.trim() || !out.length || out.some(n => !Number.isFinite(n)) ? null : out;
}
