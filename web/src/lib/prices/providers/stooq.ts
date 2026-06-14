import type { DailyClose } from "./types";

// Stooq 历史与轻量 quote CSV 都含 Date / Close 列；按表头名定位，容忍列顺序。
function parseStooqCsv(csv: string, ticker: string): DailyClose[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const di = header.indexOf("date");
  const ci = header.indexOf("close");
  if (di < 0 || ci < 0) return [];
  const T = ticker.trim().toUpperCase();
  const out: DailyClose[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const date = (cols[di] ?? "").trim();
    const close = Number(cols[ci]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) continue;
    out.push({ ticker: T, date, close, currency: "USD", source: "stooq" });
  }
  return out;
}

// 完整日线历史（升序）。
export function parseStooqHistory(csv: string, ticker: string): DailyClose[] {
  return parseStooqCsv(csv, ticker);
}

// 轻量 quote：取最后一条有效行（最新 EOD）。
export function parseStooqQuote(csv: string, ticker: string): DailyClose | null {
  const rows = parseStooqCsv(csv, ticker);
  return rows.length ? rows[rows.length - 1] : null;
}
