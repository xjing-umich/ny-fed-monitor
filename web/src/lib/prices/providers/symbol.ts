// App ticker → Stooq 符号。美股：小写 + ".us"；点号转连字符（BRK.B → brk-b.us）。
export function toStooqSymbol(ticker: string): string {
  return `${ticker.trim().toLowerCase().replace(/\./g, "-")}.us`;
}

// App ticker → Yahoo 符号。美股原样大写；点号转连字符（BRK.B → BRK-B）。
export function toYahooSymbol(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

// App ticker → Eastmoney secid 用的符号。原样大写（secid 前缀 105/106 在 provider 内探测）。
export function toEastmoneySymbol(ticker: string): string {
  return ticker.trim().toUpperCase();
}
