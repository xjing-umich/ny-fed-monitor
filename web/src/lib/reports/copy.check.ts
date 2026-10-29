/** Run: cd web && npx tsx src/lib/reports/copy.check.ts */
import {
  reportTitle, reportDescription, statusLine, stockHref, reportUrl, pct, emptyText, kindLabel,
  positionLabel, notFiledText, noComparableMovesText, disclaimerText, valuationNote, holderDeltaCell,
  methodologyCoverageText, featuredMoveText, featuredWeightNote, STRIKE_ZONE_VISIBLE, strikeZoneMoreLabel,
} from "./copy";
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
assert(reportTitle("2026-09-30", "zh").includes("2026Q3"), "zh 标题含季度");

const enLive = reportDescription(p, "live", "en");
assert(enLive.includes("61 of 97"), `live 结论带覆盖率: ${enLive}`);
assert(enLive.includes("12 superinvestors") && enLive.includes("GOOG"), `买入条目以 ticker 出现: ${enLive}`);
assert(enLive.includes("17") && enLive.includes("+2"), "持有人数与环比");
assert(enLive.includes("1 stock held by two or more sits"), `击球区单数: ${enLive}`);
const enFinal = reportDescription(p, "final", "en");
assert(!enFinal.includes("61 of 97"), "final 结论不带覆盖率前缀");
const zh = reportDescription(p, "live", "zh");
assert(zh.includes("97 位中 61 位") && zh.includes("12 位") && zh.includes("17 位"), `zh 结论: ${zh}`);
assert(!/—/.test(enLive + zh), "不出现 —");

const empty = reportDescription({ ...p, bought: { items: [], emptyReason: "no_filers" }, mostHeld: { items: [], emptyReason: "no_filers" }, strikeZone: { items: [], emptyReason: "no_filers" } }, "live", "en");
assert(empty.length > 0 && !empty.includes("undefined"), `全空也能出一句: ${empty}`);

assert(statusLine({ status: "live", coverageFiled: 61, coverageTotal: 97, finalizedAt: null }, "zh").includes("97 位中已有 61 位申报"), "zh live 状态条");
assert(statusLine({ status: "final", coverageFiled: 94, coverageTotal: 97, finalizedAt: "2026-11-18T03:00:00Z" }, "en").includes("Nov 18, 2026"), "en final 状态条带日期");

assert(stockHref({ key: "C_UNRES", ticker: null, issuer: "MYSTERY" }, "en") === null, "未解析 ticker 不出链接");
assert(stockHref({ key: "GOOG", ticker: "GOOG", issuer: "A" }, "en") === "/stocks/GOOG", "en 链接无前缀");
assert(stockHref({ key: "GOOG", ticker: "GOOG", issuer: "A" }, "zh") === "/zh/stocks/GOOG", "zh 链接");
assert(reportUrl("2026-09-30", "en") === "https://thecompounder.fyi/learn/q3-2026-superinvestor-consensus", "en 绝对 URL");
assert(reportUrl("2026-09-30", "zh") === "https://thecompounder.fyi/zh/learn/q3-2026-superinvestor-consensus", "zh 绝对 URL");
assert(pct(0.042) === "4.2%" && pct(0) === "0%", "百分比");
assert(emptyText("no_valuation", "zh").length > 0 && kindLabel("exited", "en").length > 0, "标签非空");
assert(stockHref({ key: 'A"B&C', ticker: 'A"B&C', issuer: "X" }, "en") === "/stocks/A%22B%26C", "ticker 做 URI 编码");

assert(positionLabel("strike_zone", "zh") === "击球区" && positionLabel("below", "zh") === "低于内在价值", "zh 位置标签");
assert(positionLabel("strike_zone", "en") === "Strike zone" && positionLabel("below", "en") === "Below intrinsic value", "en 位置标签");
assert(notFiledText("zh") === "未申报" && notFiledText("en") === "Not filed yet", "申报标签");
assert(noComparableMovesText("zh") === "本季无可比动作（缺上一季申报）" && noComparableMovesText("en") === "No comparable moves (no prior filing)", "无可比动作标签");
assert(disclaimerText("zh") === "仅供学习，不构成投资建议。" && disclaimerText("en") === "For education only. Not investment advice.", "免责标签");

// —— live 结论保留季度标签
assert(enLive.startsWith("Q3 2026, so far (61 of 97 filed): "), `en live 前缀带季度: ${enLive}`);
assert(zh.startsWith("2026Q3，截至目前（97 位中 61 位已申报）："), `zh live 前缀带季度: ${zh}`);
assert(enFinal.startsWith("Q3 2026: "), `final 前缀只有季度: ${enFinal}`);

// —— 环比 0 写“持平”,不写 +0 / 0
const flat: ReportPayload = { ...p, mostHeld: { items: [{ ...p.mostHeld.items[0], holderDelta: 0 }], emptyReason: null } };
const enFlat = reportDescription(flat, "final", "en");
const zhFlat = reportDescription(flat, "final", "zh");
assert(enFlat.includes("(17 holders, unchanged vs. last quarter)"), `en 持平: ${enFlat}`);
assert(zhFlat.includes("（17 位，较上季持平）"), `zh 持平: ${zhFlat}`);
assert(!/[+]0\b|较上季 0/.test(enFlat + zhFlat), "不出现 +0 / 较上季 0");
assert(reportDescription(p, "final", "zh").includes("较上季 +2"), "非 0 仍带符号");
assert(holderDeltaCell(0, "zh") === "持平" && holderDeltaCell(0, "en") === "unchanged", "表格列:0 → 持平/unchanged");
assert(holderDeltaCell(2, "en") === "+2" && holderDeltaCell(-1, "zh") === "-1", "表格列:非 0 带符号");

// —— 英文单数
const one: ReportPayload = {
  ...p,
  bought: { items: [{ ...p.bought.items[0], managerCount: 1 }], emptyReason: null },
  mostHeld: { items: [{ ...p.mostHeld.items[0], holderCount: 1, holderDelta: 1 }], emptyReason: null },
};
const enOne = reportDescription(one, "final", "en");
assert(enOne.includes("1 superinvestor opened or added to GOOG") && !enOne.includes("1 superinvestors"), `单数 superinvestor: ${enOne}`);
assert(enOne.includes("(1 holder, +1 vs. last quarter)") && !enOne.includes("1 holders"), `单数 holder: ${enOne}`);

// —— 估值晚于申报季的提示(spec §3.6):asOf 晚于实际截止日 30 天以上才加
assert(valuationNote("2026-10-24", "zh", "2026-06-30") === "价值位置按 2026年10月24日 收盘价计算（晚于该季申报季）。", `zh 晚于申报季: ${valuationNote("2026-10-24", "zh", "2026-06-30")}`);
assert(valuationNote("2026-10-24", "en", "2026-06-30") === "Valuation positions use closing prices as of Oct 24, 2026 (later than that quarter's filing season).", `en 晚于申报季: ${valuationNote("2026-10-24", "en", "2026-06-30")}`);
// Q3 2026 实际截止 11/16:12/16 = +30 天不加,12/17 加
assert(valuationNote("2026-12-16", "en", "2026-09-30") === "Valuation positions use closing prices as of Dec 16, 2026.", "恰好 30 天不加");
assert(valuationNote("2026-12-17", "en", "2026-09-30").includes("later than that quarter's filing season"), "31 天加");
assert(valuationNote("2026-11-17", "zh", "2026-09-30") === "价值位置按 2026年11月17日 收盘价计算。", "申报季内不加");
assert(valuationNote("2026-10-24", "en") === "Valuation positions use closing prices as of Oct 24, 2026.", "不传 period 不加");
assert(!/—/.test(valuationNote("2026-10-24", "en", "2026-06-30") + valuationNote(null, "zh", "2026-06-30")), "不出现 —");

// 名家动作:动作按股数口径说,权重放括号里并注明会受股价影响(避免“减仓但权重上升”的误读)。
const dy = { key: "AAPL", ticker: "AAPL", issuer: "APPLE INC", kind: "decreased" as const, weightBefore: 0.367, weightAfter: 0.411 };
assert(featuredMoveText(dy, "zh") === "减持 AAPL（占组合 36.7% → 41.1%）", `zh 股数口径: ${featuredMoveText(dy, "zh")}`);
assert(featuredMoveText({ ...dy, weightBefore: 0.00001, weightAfter: 0.00002 }, "zh").includes("<0.1% → <0.1%"), "极小持仓占比不显示为零");
assert(featuredMoveText(dy, "en") === "Sold some AAPL (portfolio weight 36.7% → 41.1%)", `en 股数口径: ${featuredMoveText(dy, "en")}`);
assert(featuredMoveText({ ...dy, kind: "increased" }, "zh").startsWith("增持 "), "zh 增持");
assert(featuredMoveText({ ...dy, kind: "new", weightBefore: 0, weightAfter: 0.047 }, "zh") === "新进 AAPL（占组合 0% → 4.7%）", "zh 新进");
assert(featuredMoveText({ ...dy, kind: "exited", weightAfter: 0 }, "en") === "Exited AAPL (portfolio weight 36.7% → 0%)", "en 清仓");
assert(featuredMoveText({ ...dy, ticker: null, key: "C_X", issuer: "MYSTERY CORP" }, "en").includes("MYSTERY CORP"), "未解析用 issuer");
assert(/股数/.test(featuredWeightNote("zh")) && /股价/.test(featuredWeightNote("zh")), "zh 说明提到股数与股价");
assert(/shares/.test(featuredWeightNote("en")) && /price/.test(featuredWeightNote("en")), "en 说明提到 shares 与 price");
assert(!/—/.test(featuredWeightNote("zh") + featuredWeightNote("en")), "不出现 —");

// 击球区交集:页面先显示 15 条,其余收进 details
assert(STRIKE_ZONE_VISIBLE === 15, "首屏 15 条");
assert(strikeZoneMoreLabel(46, "zh") === "展开其余 46 只", "zh 展开文案");
assert(strikeZoneMoreLabel(46, "en") === "Show the other 46 stocks", "en 展开文案");
assert(strikeZoneMoreLabel(1, "en") === "Show the other stock", "en 单数");

assert(
  statusLine({ status: "live", coverageFiled: 2, coverageTotal: 94, finalizedAt: null }, "zh", 3).includes("94 位中已有 2 位申报（另有 3 位上季未申报，不计入）"),
  "zh live 状态条写明未计入人数",
);
assert(
  statusLine({ status: "live", coverageFiled: 2, coverageTotal: 94, finalizedAt: null }, "en", 1).includes("2 of 94 have filed (1 other missed last quarter and isn't counted)"),
  "en live 状态条单数",
);
assert(
  !statusLine({ status: "final", coverageFiled: 94, coverageTotal: 94, finalizedAt: "2026-11-18T03:00:00Z" }, "zh").includes("另有"),
  "excluded 缺省 = 0 → 不出括号",
);

// 方法说明首句:旧 payload(无 excluded)原句不变;新 payload 写明口径与未计入人数
assert(
  methodologyCoverageText({ filed: 91, total: 97 }, "zh") === "数据来自 SEC EDGAR 上的 13F 申报，覆盖本站跟踪的 97 位活跃超级投资者（一年以上未申报者不计）。同季有修正申报时取合并后的版本。",
  "excluded 缺省 zh 原句不变",
);
assert(
  methodologyCoverageText({ filed: 91, total: 97 }, "en") === "Data comes from 13F filings on SEC EDGAR for the 97 active superinvestors this site tracks (funds silent for a year or more are excluded). Where a quarter was amended, the merged version is used.",
  "excluded 缺省 en 原句不变",
);
assert(
  methodologyCoverageText({ filed: 2, total: 94, excluded: 3 }, "zh").includes("覆盖本站追踪的 97 位中、上一季及之后有申报的 94 位超级投资者（另有 3 位上季未申报，不计入）。同季"),
  "zh excluded=3 写明口径与人数",
);
assert(
  methodologyCoverageText({ filed: 2, total: 94, excluded: 3 }, "en").includes("for the 94 of the 97 superinvestors this site tracks that filed for the prior quarter or later (3 others missed last quarter and aren't counted). Where"),
  "en excluded=3",
);
assert(methodologyCoverageText({ filed: 2, total: 94, excluded: 1 }, "en").includes("the 94 of the 95 superinvestors this site tracks that filed for the prior quarter or later (1 other missed last quarter and isn't counted)"), "en 单数 + 名单 = total+excluded");
for (const lang of ["zh", "en"] as const) {
  const t0 = methodologyCoverageText({ filed: 2, total: 94, excluded: 0 }, lang);
  assert(!t0.includes("一年以上") && !t0.includes("silent") && !t0.includes("另有") && !t0.includes("missed last quarter"), `excluded=0 不出人数从句 (${lang})`);
  assert(t0.includes(lang === "zh" ? "追踪的 94 位中、上一季及之后有申报的 94 位" : "the 94 of the 94 superinvestors"), `excluded=0 名单 = total (${lang})`);
}

console.log("copy.check OK");
