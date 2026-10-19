/** Run: cd web && npx tsx src/lib/reports/email.check.ts */
import fs from "node:fs";
import path from "node:path";
import { renderReportEmail, UNSUBSCRIBE_TOKEN } from "./email";
import type { ReportPayload } from "./types";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const p = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/v1-final.json"), "utf8")) as ReportPayload;
const meta = { status: "final" as const, coverageFiled: 94, coverageTotal: 97, finalizedAt: "2026-10-25T00:00:00Z", valuationAsOf: "2026-10-24", isFirstIssue: true };

const en = renderReportEmail(p, meta, "en");
assert(en.subject.includes("Q2 2026"), `en subject: ${en.subject}`);
assert(en.previewText.length > 0 && en.previewText.length <= 200, "previewText 非空且不过长");
assert(en.html.includes(UNSUBSCRIBE_TOKEN) && en.text.includes(UNSUBSCRIBE_TOKEN), "退订占位符两版都有");
assert(en.html.includes("AT&amp;T INC") || en.html.includes(">T<"), "AT&T 转义或以 ticker 显示");
assert(en.html.includes("SMITH &lt;&amp;&gt; &quot;JONES&quot; HOLDINGS"), "未解析 issuer 在 HTML 中完整转义");
assert(!/<&>/.test(en.html), "HTML 中不出现未转义的 <&>");
assert(en.text.includes('SMITH <&> "JONES" HOLDINGS'), "纯文本版原样");
assert(!en.html.includes("/stocks/C_UNRES"), "未解析 ticker 不出链接");
assert(en.html.includes("https://thecompounder.fyi/learn/q2-2026-superinvestor-consensus"), "en 完整报告链接");
assert(en.html.includes("https://thecompounder.fyi/zh/learn/q2-2026-superinvestor-consensus"), "en 版顶部有中文版链接");
assert(/first issue/i.test(en.text), "首期提醒句");
assert(en.text.includes("2026-10-24"), "价值位置日期");
assert(/not investment advice/i.test(en.text), "不构成投资建议");
assert((en.html.match(/<tr/g) ?? []).length >= 3, "板块有表格行");

const zh = renderReportEmail(p, { ...meta, isFirstIssue: false }, "zh");
assert(zh.subject.includes("Q2 2026"), "zh subject");
assert(zh.html.includes("https://thecompounder.fyi/zh/learn/q2-2026-superinvestor-consensus"), "zh 完整报告链接");
assert(!zh.html.includes("中文版 →"), "zh 版不放中文版链接");
assert(!/这是第一期/.test(zh.text), "非首期不出现首期句");
assert(zh.text.includes("巴菲特"), "zh 用中文名");
assert(zh.text.includes("未申报"), "未申报名家标注");
assert(zh.text.includes("不构成投资建议"), "zh 免责");

const addr = renderReportEmail(p, { ...meta, postalAddress: "PO Box 1, Ann Arbor, MI" }, "en");
assert(addr.text.includes("PO Box 1"), "可选通讯地址");
assert(!en.text.includes("PO Box"), "未配置地址时不渲染");

// 恶意 ticker:引号、& 必须在 href 中被编码/转义,不能逃出属性
const hostile = JSON.parse(JSON.stringify(p)) as ReportPayload;
hostile.bought.items[0] = { ...hostile.bought.items[0], key: 'A"B&C', ticker: 'A"B&C' };
const hx = renderReportEmail(hostile, meta, "en");
assert(hx.html.includes('href="https://thecompounder.fyi/stocks/A%22B%26C"'), "ticker 编码进 href");
assert(!hx.html.includes('"B&C'), "HTML 中无未转义的引号/&");
assert(hx.text.includes('A"B&C'), "纯文本版原样");

console.log("email.check OK");
