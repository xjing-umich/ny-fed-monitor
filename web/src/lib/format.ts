/**
 * Formats a USD dollar amount with T/B/M suffixes.
 * e.g. 1_500_000_000 → "$1.50B"
 */
export function formatUSD(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

/** 把全大写的发行人名(如 "AMAZON COM INC")转为标题大小写("Amazon Com Inc")。 */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();
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
