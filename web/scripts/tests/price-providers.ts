/** 价格 provider 纯函数测试。用法: npm run test:price-providers */
import { toStooqSymbol, toYahooSymbol } from "../../src/lib/prices/providers/symbol";
import { parseStooqHistory, parseStooqQuote } from "../../src/lib/prices/providers/stooq";
import { parseYahooChart, parseYahooLatest, parseYahooRecent } from "../../src/lib/prices/providers/yahoo";
import { parseEastmoneyKline } from "../../src/lib/prices/providers/eastmoney";
import { isStale, resolveDaily, resolveRecent } from "../../src/lib/prices/providers";
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

// --- parseYahooRecent:收盘后当日日线未落地时,用 meta 补出当日收盘(2026-10 价格晚一天的根因) ---
// 2026-10-15(周四)、10-16(周五)两根日线(13:30Z 开盘时刻);美东 gmtoffset = -14400。
const T15 = Date.UTC(2026, 9, 15, 13, 30) / 1000, T16 = Date.UTC(2026, 9, 16, 13, 30) / 1000;
const close16 = Date.UTC(2026, 9, 16, 20, 0, 1) / 1000;           // 周五 16:00:01 ET 最后成交
const fri = { start: Date.UTC(2026, 9, 16, 13, 30) / 1000, end: Date.UTC(2026, 9, 16, 20, 0) / 1000 };
const lagging = (closes: Array<number | null>, period = fri) => ({ chart: { result: [ {
  meta: { currency: "USD", regularMarketPrice: 343.46, regularMarketTime: close16, gmtoffset: -14400, currentTradingPeriod: { regular: period } },
  timestamp: [T15, T16].slice(0, closes.length),
  indicators: { quote: [ { close: closes } ] },
} ] } });
const fri8pmEt = Date.UTC(2026, 9, 17, 0, 11) / 1000;                // 实际任务运行时刻
eq(parseYahooRecent(lagging([342.0, null]), "AAPL", fri8pmEt).map((r) => [r.date, r.close]), [["2026-10-15", 342], ["2026-10-16", 343.46]], "当日 close=null → 用 meta 补周五");
eq(parseYahooRecent(lagging([342.0]), "AAPL", fri8pmEt).map((r) => r.date), ["2026-10-15", "2026-10-16"], "当日日线整根缺席 → 用 meta 补周五");
eq(parseYahooRecent(lagging([342.0, 343.4599]), "AAPL", fri8pmEt).length, 2, "当日日线已落地 → 不重复补");
const intraday = Date.UTC(2026, 9, 16, 17, 0) / 1000;               // 周五盘中
eq(parseYahooRecent(lagging([342.0, null]), "AAPL", intraday).map((r) => r.date), ["2026-10-15"], "盘中不补(盘中价≠收盘价)");
const monPeriod = { start: Date.UTC(2026, 9, 19, 13, 30) / 1000, end: Date.UTC(2026, 9, 19, 20, 0) / 1000 };
const monPremarket = Date.UTC(2026, 9, 19, 5, 0) / 1000;           // 周一盘前:currentTradingPeriod 已指向周一
eq(parseYahooLatest(lagging([342.0, null], monPeriod), "AAPL", monPremarket)?.date, "2026-10-16", "次场盘前 → 上一场 meta 价可用");
eq(parseYahooRecent({ chart: { result: [ { meta: {}, timestamp: [T15], indicators: { quote: [ { close: [342.0] } ] } } ] } }, "AAPL", fri8pmEt).length, 1, "meta 缺价 → 只用日线");

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

  // resolveRecent:有 fetchRecent 的源整段返回;无则退化为单根;选源规则同 resolveDaily。
  const yesterdayIso = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const recentYahoo: PriceProvider = { ...mk("yahoo", freshYahoo), fetchRecent: async () => [{ ...freshYahoo, date: yesterdayIso, close: 9 }, freshYahoo] };
  eq((await resolveRecent("X", [recentYahoo, mk("eastmoney", emRow)])).map((r) => r.close), [9, 10], "resolveRecent 整段返回近几日");
  eq((await resolveRecent("X", [mk("eastmoney", emRow)])).map((r) => r.source), ["eastmoney"], "resolveRecent 无 fetchRecent → 单根");
  const staleRecent: PriceProvider = { ...mk("yahoo", staleYahoo), fetchRecent: async () => [staleYahoo] };
  eq((await resolveRecent("X", [staleRecent, mk("eastmoney", emRow)]))[0].source, "eastmoney", "resolveRecent 主源陈旧 → 顺延兜底");
  eq(await resolveRecent("X", [mk("yahoo", null)]), [], "resolveRecent 全空→[]");

  if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
  console.log("\n全部通过");
})();
