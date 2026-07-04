/**
 * Formats a USD dollar amount with T/B/M suffixes.
 * e.g. 1_500_000_000 → "$1.50B"
 */
export function formatUSD(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 9.995e11) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 9.995e8) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

/**
 * 安全边际展示:−N%;四舍五入到 0 但实际 >0 → "<1%"(不带负号,避免 −0%)。
 */
export function fmtMarginPct(pct: number): string {
  const n = Math.round(pct * 100);
  return n <= 0 ? "<1%" : `−${n}%`;
}

/**
 * 把全大写的发行人名(如 "AMAZON COM INC")转为标题大小写("Amazon Com Inc")。
 * 撇号后的字母保持小写,避免 "MOODY'S" → "Moody'S"(应为 "Moody's")。
 */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/('|’)([A-Za-z])/g, (_, apos, c) => apos + c.toLowerCase())
    .trim();
}

/**
 * 清洗 SEC EDGAR 发行人原始名,用于前端展示:标题化 + 去除结尾标点与 EDGAR 限定词。
 * 例:"MICROSOFT CORP." → "Microsoft Corp";"BERKSHIRE HATHAWAY INC DEL" → "Berkshire Hathaway Inc";
 *     "ELEVANCE HEALTH INC FORMERLY" → "Elevance Health Inc"。
 * 仅剥离明确的结尾限定词,不动名称主体,避免误删。
 */
export function cleanIssuer(raw: string): string {
  let s = titleCase(raw);
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s
      .replace(/[.,\s]+$/, "")              // 结尾标点/空格
      .replace(/\s+(Del|Formerly|New)$/i, ""); // EDGAR 结尾限定词
  }
  return s;
}

/**
 * Returns "up" if value starts with "+", "down" if value starts with "-" followed by a digit,
 * null otherwise (unsigned numbers, "Unavailable", etc.).
 */
export function trendDirection(value: string | undefined | null): "up" | "down" | null {
  if (value == null) return null;
  const s = String(value);
  if (s.startsWith("+")) return "up";
  // "-$3.4 billion", "-3.4", etc. — any leading minus that is followed by a non-letter
  if (/^-[^a-zA-Z]/.test(s)) return "down";
  return null;
}
