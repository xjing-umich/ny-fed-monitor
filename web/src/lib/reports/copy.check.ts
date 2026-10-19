/** Run: cd web && npx tsx src/lib/reports/copy.check.ts */
import { reportTitle, reportDescription, statusLine, stockHref, reportUrl, pct, emptyText, kindLabel } from "./copy";
import type { ReportPayload } from "./types";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const p: ReportPayload = {
  schemaVersion: 1, period: "2026-09-30", coverage: { filed: 61, total: 97 },
  bought: { items: [{ key: "GOOG", ticker: "GOOG", issuer: "ALPHABET INC", managerCount: 12, netValue: 1, dominantKind: "increased" }], emptyReason: null },
  sold: { items: [], emptyReason: "no_qualifying" },
  mostHeld: { items: [{ key: "GOOG", ticker: "GOOG", issuer: "ALPHABET INC", holderCount: 17, holderDelta: 2 }], emptyReason: null },
  strikeZone: { items: [{ key: "X", ticker: "X", issuer: "X", holderCount: 2, position: "strike_zone", marginPct: 0.3 }], emptyReason: null },
  featured: [],
};

assert(reportTitle("2026-09-30", "en").includes("Q3 2026"), "en 标题含季度");
assert(reportTitle("2026-09-30", "zh").includes("Q3 2026"), "zh 标题含季度");

const enLive = reportDescription(p, "live", "en");
assert(enLive.includes("61 of 97"), `live 结论带覆盖率: ${enLive}`);
assert(enLive.includes("12 superinvestors") && enLive.includes("GOOG"), `买入条目以 ticker 出现: ${enLive}`);
assert(enLive.includes("17") && enLive.includes("+2"), "持有人数与环比");
assert(enLive.includes("1 stock"), `击球区单数: ${enLive}`);
const enFinal = reportDescription(p, "final", "en");
assert(!enFinal.includes("61 of 97"), "final 结论不带覆盖率前缀");
const zh = reportDescription(p, "live", "zh");
assert(zh.includes("97 位中 61 位") && zh.includes("12 位") && zh.includes("17 位"), `zh 结论: ${zh}`);
assert(!/—/.test(enLive + zh), "不出现 —");

const empty = reportDescription({ ...p, bought: { items: [], emptyReason: "no_filers" }, mostHeld: { items: [], emptyReason: "no_filers" }, strikeZone: { items: [], emptyReason: "no_filers" } }, "live", "en");
assert(empty.length > 0 && !empty.includes("undefined"), `全空也能出一句: ${empty}`);

assert(statusLine({ status: "live", coverageFiled: 61, coverageTotal: 97, finalizedAt: null }, "zh").includes("97 位中已有 61 位申报"), "zh live 状态条");
assert(statusLine({ status: "final", coverageFiled: 94, coverageTotal: 97, finalizedAt: "2026-11-18T03:00:00Z" }, "en").includes("2026-11-18"), "en final 状态条带日期");

assert(stockHref({ key: "C_UNRES", ticker: null, issuer: "MYSTERY" }, "en") === null, "未解析 ticker 不出链接");
assert(stockHref({ key: "GOOG", ticker: "GOOG", issuer: "A" }, "en") === "/stocks/GOOG", "en 链接无前缀");
assert(stockHref({ key: "GOOG", ticker: "GOOG", issuer: "A" }, "zh") === "/zh/stocks/GOOG", "zh 链接");
assert(reportUrl("2026-09-30", "en") === "https://thecompounder.fyi/learn/q3-2026-superinvestor-consensus", "en 绝对 URL");
assert(reportUrl("2026-09-30", "zh") === "https://thecompounder.fyi/zh/learn/q3-2026-superinvestor-consensus", "zh 绝对 URL");
assert(pct(0.042) === "4.2%" && pct(0) === "0%", "百分比");
assert(emptyText("no_valuation", "zh").length > 0 && kindLabel("exited", "en").length > 0, "标签非空");

console.log("copy.check OK");
