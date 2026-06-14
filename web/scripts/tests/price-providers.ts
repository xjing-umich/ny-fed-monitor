/** 价格 provider 纯函数测试。用法: npm run test:price-providers */
import { toStooqSymbol } from "../../src/lib/prices/providers/symbol";

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

if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log("\n全部通过");
