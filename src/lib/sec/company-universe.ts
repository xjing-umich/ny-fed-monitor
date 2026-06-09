export const COMPANY_UNIVERSE = [
  "GOOG",
  "GOOGL",
  "BRK.B",
  "MSFT",
  "META",
  "V",
  "AAPL",
  "MCO",
  "AMZN",
  "MA",
  "TSM",
  "BRK.A",
  "AXP",
  "SPGI",
  "NVDA",
  "BAC",
  "COF",
  "CMCSA",
  "UNH",
  "ELV",
  "SCHW",
  "WFC",
  "UNP",
  "PM",
  "DIS",
  "ASML",
  "DHR",
  "PDD",
  "UBER",
  "BNY",
  "BABA",
  "AVGO",
  "MSCI",
  "JNJ",
  "PGR",
  "JPM"
] as const;

export const KNOWN_FOREIGN_ISSUERS = new Set(["TSM", "ASML", "BABA", "PDD"]);

export function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase().replace(".", "-");
}
