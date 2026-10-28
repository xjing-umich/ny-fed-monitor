// 运行: npx tsx src/components/valuation/EarningsPowerFloorCard.check.tsx
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { EarningsPowerFloorCard, cardSummaryMode, compactFloorReason } from "./EarningsPowerFloorCard";
import { runValuation } from "@/lib/valuation/runValuation";
import type { PerShareUnavailable, ValuationFloorYear } from "@/lib/valuation/types";

// 引擎 reason 是英文审计串,卡片按 lang 渲染自己的文案,不直出 reason(否则中文页整段英文)。
const floor: PerShareUnavailable = { kind: "per_share_unavailable", reason: "ENGINE_REASON(test)" };
const text = (part?: "all" | "summary" | "details", lang: "zh" | "en" = "zh") =>
  renderToStaticMarkup(<EarningsPowerFloorCard floor={floor} lang={lang} part={part} />).replace(/<[^>]+>/g, " ");

const all = text();
assert.ok(all.includes("多类股票") && all.includes("方法与数字"), "默认 all:两半都在");
assert.ok(!all.includes("ENGINE_REASON"), "zh 不直出引擎 reason");
assert.ok(text("all", "en").includes("more than one share class") && !text("all", "en").includes("ENGINE_REASON"), "en 用本地化文案");
const summary = text("summary");
assert.ok(summary.includes("多类股票"), "summary 含原因");
assert.ok(!summary.includes("方法与数字"), "summary 不含方法折叠");
const details = text("details");
assert.ok(details.includes("方法与数字"), "details 含方法折叠");
assert.ok(!details.includes("多类股票"), "details 不含摘要");

// ── 价值脊柱:summary 精简(手机首屏),bandHowToRead 与假设行挪到 details 顶部,每条事实全页恰好一次 ──
const years: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 10_000, operating_income: 4_500, net_income: 3_000, effective_tax_rate: 0.15, shareholders_equity: 5_000, cash: 2_000, total_debt: 1_000, shares_diluted: 1_000, d_and_a: 600, capex: 550 },
  { fiscal_year: 2024, revenue: 9_000, operating_income: 3_960, net_income: 2_700, effective_tax_rate: 0.15, shareholders_equity: 4_500, cash: 1_800, total_debt: 1_000, shares_diluted: 1_000, d_and_a: 540, capex: 500 },
  { fiscal_year: 2023, revenue: 8_000, operating_income: 3_360, net_income: 2_400, effective_tax_rate: 0.15, shareholders_equity: 4_000, cash: 1_600, total_debt: 1_000, shares_diluted: 1_000, d_and_a: 480, capex: 450 },
  { fiscal_year: 2022, revenue: 7_000, operating_income: 3_010, net_income: 2_100, effective_tax_rate: 0.15, shareholders_equity: 3_500, cash: 1_400, total_debt: 1_000, shares_diluted: 1_000, d_and_a: 420, capex: 400 },
  { fiscal_year: 2021, revenue: 6_000, operating_income: 2_460, net_income: 1_800, effective_tax_rate: 0.15, shareholders_equity: 3_000, cash: 1_200, total_debt: 1_000, shares_diluted: 1_000, d_and_a: 360, capex: 350 },
];
const run = runValuation({
  floorInput: { ticker: "RUN", years },
  price: { close: 20, date: "2026-07-01", currency: "USD", source: "test" },
  dgs10: { value: 4.2, date: "2026-07-01" },
  guards: { adsSuppressed: false, fundamentalsStale: false, priceStale: false, splitCoverageStale: false },
});
assert.ok(run.verdict && run.oeDcf?.tiers, "fixture 应产出权威判定与含增长中枢");
// 低信心版本:callouts(低信心原因)必须留在首屏。
const verdict = { ...run.verdict, reliable: false };
const spine = (part: "all" | "summary" | "details", lang: "zh" | "en" = "zh") =>
  renderToStaticMarkup(
    <EarningsPowerFloorCard
      floor={run.floor}
      strikeZone={run.strikeZone}
      oeDcf={run.oeDcf}
      reconciliation={run.reconciliation}
      issuer="Run Co"
      ticker="RUN"
      lang={lang}
      showStatus={false}
      verdict={verdict}
      part={part}
    />,
  ).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&");
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

for (const lang of ["zh", "en"] as const) {
  const fact = lang === "zh"
    ? { how: "中间是主读数", assume: "模型假设增速", asOf: "价格截至", headline: "含增长中枢内在价值", callout: "今年输入偏脆", method: "方法与数字" }
    : { how: "The middle figure is the main read", assume: "Model growth assumption", asOf: "Price as of", headline: "growth-anchored intrinsic value", callout: "Inputs look fragile", method: "Method & numbers" };
  const s = spine("summary", lang);
  const d = spine("details", lang);
  const a = spine("all", lang);
  // summary 保留:头条、结论句后的低信心原因、价格截至行。
  assert.ok(s.includes(fact.headline), `${lang} summary 含头条`);
  assert.ok(s.includes(fact.callout), `${lang} summary 含低信心原因`);
  assert.ok(s.includes(fact.asOf), `${lang} summary 含价格截至行`);
  // summary 不含:怎么读 + 假设行。
  assert.ok(!s.includes(fact.how), `${lang} summary 不含 bandHowToRead`);
  assert.ok(!s.includes(fact.assume), `${lang} summary 不含假设行`);
  // details 顶部补上这两行,且排在方法折叠之前。
  assert.ok(d.includes(fact.how) && d.includes(fact.assume), `${lang} details 含 bandHowToRead 与假设行`);
  assert.ok(d.indexOf(fact.assume) < d.indexOf(fact.method), `${lang} 假设行在方法折叠之前`);
  assert.ok(!d.includes(fact.headline) && !d.includes(fact.asOf) && !d.includes(fact.callout), `${lang} details 不重复摘要`);
  // 个股页 = summary + details:每条事实恰好一次;all 与之等量。
  const page = s + d;
  for (const f of [fact.how, fact.assume, fact.asOf, fact.headline, fact.callout, fact.method]) {
    assert.equal(count(page, f), 1, `${lang} 个股页「${f}」恰好一次`);
    assert.equal(count(a, f), 1, `${lang} all「${f}」恰好一次`);
  }
}

// verdict=null:脊柱不渲染 → details 也不补那两行(无判定就没有可解释的带)。
{
  const d = renderToStaticMarkup(
    <EarningsPowerFloorCard floor={run.floor} strikeZone={run.strikeZone} oeDcf={run.oeDcf} lang="zh" verdict={null} part="details" />,
  ).replace(/<[^>]+>/g, " ");
  assert.ok(!d.includes("中间是主读数") && !d.includes("模型假设增速"), "verdict=null 时 details 不补脊柱附注");
  assert.ok(d.includes("方法与数字"), "verdict=null 时 details 仍有方法折叠");
}
// cardSummaryMode:页面据此判断摘要是否为空(空 → 结论带补未评估原因,左栏不只剩一个价格)。
{
  assert.equal(cardSummaryMode(run.strikeZone, verdict), "spine");
  assert.equal(cardSummaryMode(run.strikeZone, undefined), "spine", "undefined = 遗留自算,脊柱照常");
  assert.equal(cardSummaryMode(run.strikeZone, null), "none", "可比但无权威判定 → 摘要为空");
  assert.equal(cardSummaryMode(undefined, null), "compactFloor", "无价格轴 → 缺价格说明");
  assert.equal(cardSummaryMode({ ...run.strikeZone!, currencyMismatch: true }, verdict), "compactFloor", "币种不匹配");
  const empty = renderToStaticMarkup(
    <EarningsPowerFloorCard floor={run.floor} strikeZone={run.strikeZone} oeDcf={run.oeDcf} lang="zh" verdict={null} part="summary" />,
  ).replace(/<[^>]+>/g, "").trim();
  assert.equal(empty, "", "mode=none 时摘要确实什么字都不出");
}
// 无价格轴的说法按真实原因:有现价时绝不说"缺价格"(IONS:现价旁边写"缺少可用市场价格"自相矛盾)。
{
  assert.equal(compactFloorReason(undefined, false), "noPrice", "无现价 → 缺价格");
  assert.equal(compactFloorReason(undefined, undefined), "noPrice", "不传 priceKnown → 按缺价格说(旧行为)");
  assert.equal(compactFloorReason(undefined, true), "noEarningsValue", "有现价但无比较轴 → 盈利撑不出正的每股价值");
  assert.equal(compactFloorReason({ ...run.strikeZone!, epv: undefined }, true), "noEarningsValue", "只有资产底、没有 EPV");
  const fx = { ...run.strikeZone!, currencyMismatch: true, epv: undefined, price: { ...run.strikeZone!.price, currency: "HKD" } };
  assert.equal(compactFloorReason(fx, true), "currency", "币种不匹配");
  const sum = (sz: typeof fx | undefined, priceKnown: boolean | undefined, lang: "zh" | "en") =>
    renderToStaticMarkup(
      <EarningsPowerFloorCard floor={run.floor} strikeZone={sz} oeDcf={run.oeDcf} lang={lang} verdict={null} part="summary" priceKnown={priceKnown} />,
    ).replace(/<[^>]+>/g, " ");
  const noEv = sum(undefined, true, "zh");
  assert.ok(noEv.includes("盈利撑不出一个为正的每股价值") && !noEv.includes("缺少可用市场价格"), "zh 有现价:不说缺价格");
  const noEvEn = sum(undefined, true, "en");
  assert.ok(noEvEn.includes("positive per-share value") && !noEvEn.includes("No usable market price"), "en 有现价:不说缺价格");
  assert.ok(sum(undefined, false, "zh").includes("缺少可用市场价格"), "zh 无现价:仍说缺价格");
  const cur = sum(fx, true, "zh");
  assert.ok(cur.includes("现价以 HKD 计价") && !cur.includes("Latest price is in"), "zh 币种:中文说法,不再夹英文原因");
  assert.ok(sum(fx, true, "en").includes("quoted in HKD"), "en 币种");
}
console.log("EarningsPowerFloorCard.check OK");
