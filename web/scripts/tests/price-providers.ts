/** 价格 provider 纯函数测试。用法: npm run test:price-providers */
import { toStooqSymbol } from "../../src/lib/prices/providers/symbol";
import { parseStooqHistory, parseStooqQuote } from "../../src/lib/prices/providers/stooq";

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

if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log("\n全部通过");
