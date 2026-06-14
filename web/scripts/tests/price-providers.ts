/** 价格 provider 纯函数测试。用法: npm run test:price-providers */
import { toStooqSymbol, toYahooSymbol } from "../../src/lib/prices/providers/symbol";
import { parseStooqHistory, parseStooqQuote } from "../../src/lib/prices/providers/stooq";
import { parseYahooChart, parseYahooLatest } from "../../src/lib/prices/providers/yahoo";
import { parseEastmoneyKline } from "../../src/lib/prices/providers/eastmoney";
import { isStale, resolveDaily } from "../../src/lib/prices/providers";
import type { DailyClose, PriceProvider } from "../../src/lib/prices/providers/types";

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`FAIL ${label}: got ${a}, want ${e}`); }
  else console.log(`ok   ${label}`);
}

// --- toStooqSymbol ---
eq(toStooqSymbol("AAPL"), "aapl.us", "symbol AAPL");
eq(toStooqSymbol("BRK.B"), "brk-b.us", "symbol BRK.B 点号转连字符");
eq(toStooqSymbol(" goog "), "goog.us", "symbol 去空格");

// --- parseStooqHistory ---
const histCsv = "Date,Open,High,Low,Close,Volume\n2026-06-11,180.0,186.0,179.0,185.5,1000\n2026-06-12,185.0,190.0,184.0,188.25,2000\n";
const hist = parseStooqHistory(histCsv, "AAPL");
eq(hist.length, 2, "hist 行数");
eq(hist[1], { ticker: "AAPL", date: "2026-06-12", close: 188.25, currency: "USD", source: "stooq" }, "hist 末行映射");

// 脏行/无数据应被丢弃
const dirty = "Date,Open,High,Low,Close,Volume\n2026-06-12,N/D,N/D,N/D,N/D,N/D\n";
eq(parseStooqHistory(dirty, "AAPL").length, 0, "hist 丢弃 N/D 行");
eq(parseStooqHistory("", "AAPL").length, 0, "hist 空输入");

// --- parseStooqQuote（取末行）---
const quoteCsv = "Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-06-12,22:00:02,185.0,190.0,184.0,188.25,2000\n";
eq(parseStooqQuote(quoteCsv, "AAPL"), { ticker: "AAPL", date: "2026-06-12", close: 188.25, currency: "USD", source: "stooq" }, "quote 解析");
eq(parseStooqQuote("Symbol,Date,Time,Close\nAAPL.US,N/D,N/D,N/D\n", "AAPL"), null, "quote 无数据→null");

// --- toYahooSymbol ---
eq(toYahooSymbol("AAPL"), "AAPL", "yahoo symbol AAPL");
eq(toYahooSymbol("BRK.B"), "BRK-B", "yahoo symbol BRK.B 点号转连字符");

// --- parseYahooChart / parseYahooLatest ---
const yj = { chart: { result: [ {
  meta: { currency: "USD" },
  timestamp: [1749600000, 1749686400],
  indicators: { quote: [ { close: [185.5, 188.25] } ] },
} ], error: null } };
const yrows = parseYahooChart(yj, "AAPL");
eq(yrows.length, 2, "yahoo chart 行数");
eq(yrows[1].close, 188.25, "yahoo chart 末行 close");
eq(yrows[1].source, "yahoo", "yahoo chart source");
eq(/^\d{4}-\d{2}-\d{2}$/.test(yrows[1].date), true, "yahoo chart date 格式");
eq(parseYahooLatest(yj, "AAPL")?.close, 188.25, "yahoo latest 取末行");
eq(parseYahooChart({ chart: { result: [], error: "x" } }, "AAPL").length, 0, "yahoo 错误→空");

// --- parseEastmoneyKline ---
const ej = { data: { code: "AAPL", klines: ["2026-06-11,295.630", "2026-06-12,291.130"] } };
const erows = parseEastmoneyKline(ej, "AAPL");
eq(erows.length, 2, "eastmoney kline 行数");
eq(erows[1], { ticker: "AAPL", date: "2026-06-12", close: 291.13, currency: "USD", source: "eastmoney" }, "eastmoney 末行映射");
eq(parseEastmoneyKline({ data: null }, "AAPL").length, 0, "eastmoney 无 data→空");
eq(parseEastmoneyKline({ data: { klines: [] } }, "AAPL").length, 0, "eastmoney 空 klines→空");

// --- isStale ---
const todayIso = new Date().toISOString().slice(0, 10);
eq(isStale({ ticker: "X", date: todayIso, close: 1, currency: "USD", source: "yahoo" }), false, "isStale 今日→false");
eq(isStale({ ticker: "X", date: "2000-01-01", close: 1, currency: "USD", source: "yahoo" }), true, "isStale 远古→true");
eq(isStale(null), true, "isStale null→true");

// --- resolveDaily：假 provider, 按列表顺序降级 ---
const mk = (name: "yahoo" | "eastmoney", row: DailyClose | null): PriceProvider => ({
  name,
  fetchDaily: async () => row,
  fetchHistory: async () => (row ? [row] : []),
});
const freshYahoo = { ticker: "X", date: todayIso, close: 10, currency: "USD", source: "yahoo" } as DailyClose;
const emRow = { ticker: "X", date: todayIso, close: 20, currency: "USD", source: "eastmoney" } as DailyClose;
const staleYahoo = { ticker: "X", date: "2000-01-01", close: 9, currency: "USD", source: "yahoo" } as DailyClose;

(async () => {
  eq((await resolveDaily("X", [mk("yahoo", freshYahoo), mk("eastmoney", emRow)]))?.source, "yahoo", "resolve 首个新鲜直接用");
  eq((await resolveDaily("X", [mk("yahoo", null), mk("eastmoney", emRow)]))?.source, "eastmoney", "resolve 顺延到兜底");
  eq(await resolveDaily("X", [mk("yahoo", null)]), null, "resolve 全空→null");
  eq((await resolveDaily("X", [mk("yahoo", staleYahoo), mk("eastmoney", null)]))?.source, "yahoo", "resolve 都不新鲜→返回首个非空");

  if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
  console.log("\n全部通过");
})();
