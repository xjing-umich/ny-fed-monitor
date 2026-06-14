// App ticker → Stooq 符号。美股：小写 + ".us"；点号转连字符（BRK.B → brk-b.us）。
export function toStooqSymbol(ticker: string): string {
  return `${ticker.trim().toLowerCase().replace(/\./g, "-")}.us`;
}
