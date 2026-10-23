/** Run: cd web && npx tsx scripts/lib/loadReportInput.check.ts */
import { parseFeaturedConfig, pickFilingsForPeriod } from "./loadReportInput";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const rows = [
  { id: 30, period: "2026-09-30", filed_at: "2026-11-10" },
  { id: 31, period: "2026-09-30", filed_at: "2026-11-20" }, // 同季修正件,更新
  { id: 20, period: "2026-06-30", filed_at: "2026-08-14" },
  { id: 10, period: "2026-03-31", filed_at: "2026-05-15" },
];
const a = pickFilingsForPeriod(rows, "2026-09-30");
assert(a.current?.id === 31, `current 取同季最新, got ${a.current?.id}`);
assert(a.prior?.id === 20, `prior 取早于 P 的最近一季, got ${a.prior?.id}`);

const b = pickFilingsForPeriod(rows, "2026-06-30");
assert(b.current?.id === 20 && b.prior?.id === 10, "历史季度 Q2:current Q2、prior Q1(不被更新的 Q3 干扰)");

const c = pickFilingsForPeriod(rows.filter((r) => r.period !== "2026-09-30"), "2026-09-30");
assert(c.current === null && c.prior?.id === 20, "未申报 P:current null");

const d = pickFilingsForPeriod([{ id: 5, period: "2026-09-30", filed_at: "2026-11-01" }], "2026-09-30");
assert(d.current?.id === 5 && d.prior === null, "新纳入:无更早申报");

const e = pickFilingsForPeriod([{ id: 1, period: "2026-09-30", filed_at: "2026-11-01" }, { id: 2, period: "2025-12-31", filed_at: "2026-02-10" }], "2026-09-30");
assert(e.prior?.period === "2025-12-31", "跳季:prior 取早于 P 的最近一季(与全站口径一致)");

const fc = parseFeaturedConfig([{ slug: "himalaya-capital", zh: "李录" }, "oaktree", { slug: "x", zh: "  " }]);
assert(fc.slugs.join() === "himalaya-capital,oaktree,x", "slug 顺序保留,兼容纯字符串");
assert(fc.zhBySlug.get("himalaya-capital") === "李录" && !fc.zhBySlug.has("oaktree") && !fc.zhBySlug.has("x"), "中文名只收非空");
let threw = false; try { parseFeaturedConfig([{ zh: "无 slug" }]); } catch { threw = true; }
assert(threw, "缺 slug 报错");

console.log("loadReportInput.check OK");
