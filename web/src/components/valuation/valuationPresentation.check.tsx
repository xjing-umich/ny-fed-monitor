import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { EarningsPowerFloorCard, ValueBandGauge, perShare } from "./EarningsPowerFloorCard";
import { PriceBetBlock } from "./PriceBetBlock";
import { runValuation } from "@/lib/valuation/runValuation";
import type { ValuationFloorYear } from "@/lib/valuation/types";
const years: ValuationFloorYear[] = [2025, 2024, 2023, 2022, 2021].map((fiscal_year, i) => ({ fiscal_year, revenue: 10_000 - i * 1_000, operating_income: 3_000 - i * 200, net_income: 2_000 - i * 150, effective_tax_rate: 0.15, shareholders_equity: 5_000, cash: 1_000, total_debt: 500, goodwill: 300, intangibles: 100, shares_diluted: 1_000, d_and_a: 400, capex: 380, rd_expense: 100 }));
const run = (bank = false) => runValuation({ floorInput: { ticker: "TEST", years: bank ? years.map(y => ({ ...y, operating_income: undefined, rd_expense: undefined })) : years, sic: bank ? 6020 : undefined }, price: { close: 20.78, date: "2026-10-30", currency: "USD" }, dgs10: { value: 4.2, date: "2026-10-30" }, guards: { adsSuppressed: false, fundamentalsStale: false, priceStale: false, splitCoverageStale: false } });
const result = run();
assert.equal(result.floor?.kind, "floor");
if (result.floor?.kind !== "floor") throw Error("fixture floor missing");
// Keep real numerical results while poisoning legacy prose. Rendering must consume facts.
const sentinel = "RAW_ENGINE_SENTINEL audit #2 write A AV_conservative";
const floor = structuredClone(result.floor);
for (const lamp of [floor.graham_epv, floor.buffett_epv]) { lamp.label = sentinel; lamp.not_assessable_reason = sentinel; lamp.method.earnings_basis = sentinel; lamp.method.leverage_treatment = sentinel; lamp.method.denominator = sentinel; lamp.method.bridge = sentinel; lamp.method.simplifications = [sentinel]; }
floor.asset_floor.basis = sentinel; floor.moat_reading.basis_note = sentinel; floor.growth_value.not_assessable_reason = sentinel; floor.provenance.normalized_tax_rate_basis = sentinel; floor.provenance.earnings_basis_note = sentinel; floor.high_leverage_note = sentinel;
const oeDcf = result.oeDcf ? { ...result.oeDcf, no_bridge_note: sentinel, discount: result.oeDcf.discount ? { ...result.oeDcf.discount, note: sentinel } : undefined } : undefined;
for (const lang of ["zh", "en"] as const) {
 const html = renderToStaticMarkup(<EarningsPowerFloorCard floor={floor} strikeZone={result.strikeZone} oeDcf={oeDcf} reconciliation={result.reconciliation} lang={lang} securityUnit="ADS" adsRatio={4} ttmPeriodEnd="2026-06-30" ttmFiscalYear={2026} />);
 assert.ok(!html.includes("RAW_ENGINE_SENTINEL"), `${lang}: engine prose must never reach presentation`);
 assert.ok(html.includes("1 ADS = 4"), `${lang}: verified ordinary-share ratio is visible`);
 assert.ok(html.includes("/ ADS"), `${lang}: numeric estimates use ADS`);
 assert.ok(!html.includes("/ 股") && !html.includes("/ sh"), `${lang}: ADS never relabeled ordinary share`);
 assert.ok(!html.includes("FY 2026") && !html.includes("OE FY TTM"), `${lang}: synthetic TTM isn't a fiscal year`);
 const bank = run(true);
 assert.ok(bank.floor?.kind === "floor" && bank.floor.is_financial);
 const bankHtml = renderToStaticMarkup(<EarningsPowerFloorCard floor={bank.floor} strikeZone={bank.strikeZone} oeDcf={bank.oeDcf} lang={lang} />);
 assert.ok(bankHtml.includes("TBVPS"), `${lang}: bank method named tangible book value`);
 assert.ok(!bankHtml.includes("Reproduction value =") && !bankHtml.includes("重置价值 ="), `${lang}: bank isn't a replacement-cost estimate`);
 const gauge = renderToStaticMarkup(<ValueBandGauge bucket="within" rangeLo={10} rangeHi={30} price={20.78} iv={21.25} lang={lang} />);
 assert.ok(gauge.includes(`title="${lang === "zh" ? "现价" : "Price"} $20.78"`), `${lang}: cursor identifies price, retaining cents`);
 const bet = renderToStaticMarkup(<PriceBetBlock lang={lang} expectations={{ assessable: true, impliedGrowth: .068, historicalGrowth: .104, tier: "modest", impliedCapYears: 7 }} historicalSpan={{ fromYear: 2020, toYear: 2025 }} />);
 assert.ok(!bet.includes("Below what it has already done") && !bet.includes("低于它自己做到过的"), `${lang}: differing metrics do not assert performance comparison`);
 assert.ok(bet.includes(lang === "zh" ? "口径不同" : "measures differ"), `${lang}: differing metrics disclosed`);
}
assert.equal(perShare(58.89), "$59", "estimated values use shared precision");
assert.equal(perShare(3.456), "$3.46", "small estimates retain cents");

// Legacy records cannot claim an unavailable operating-income cause from arbitrary prose.
import { adsRatioDisclosure, discountDisplay, lampDisplay, valuationPeriods } from "@/lib/valuation/displayFacts";
import { resolveAds } from "@/lib/valuation/adsNormalization";
const legacyLamp = { ...floor.graham_epv, assessable: false, not_assessable_code: undefined, method: { ...floor.graham_epv.method, display: undefined } };
for (const lang of ["zh", "en"] as const) {
 const fallback = lampDisplay(legacyLamp, "operating", lang);
 assert.ok(!fallback.reason?.includes("operating income is not reported") && !fallback.reason?.includes("未单独披露"), "legacy reason does not invent missing operating income");
 assert.ok(!JSON.stringify(fallback).includes("RAW_ENGINE_SENTINEL"));
 const noSyntheticRd = valuationPeriods([2024, 2022], lang, { year: 2026, periodEnd: "2026-06-30" });
 assert.ok(!noSyntheticRd.includes("TTM") && !noSyntheticRd.includes("最近十二个月"), "R&D subset without synthetic year stays FY");
 const withSyntheticRd = valuationPeriods([2026, 2024], lang, { year: 2026, periodEnd: "2026-06-30" });
 assert.ok(!withSyntheticRd.includes("FY 2026") && withSyntheticRd.includes("FY 2024"));
 const stale = runValuation({ floorInput: { ticker: "OLD", years }, price: null, dgs10: { value: 9, date: "2000-01-01" }, guards: { adsSuppressed: false, fundamentalsStale: false, priceStale: false, splitCoverageStale: false } });
 assert.ok(stale.oeDcf?.discount?.inverted && !stale.oeDcf.discount.anchored, "real stale/inverted-rate fixture");
 const rateNote = discountDisplay(stale.oeDcf, floor, lang);
 assert.ok(rateNote.includes("FRED") && rateNote.includes(lang === "zh" ? "已过时" : "stale") && rateNote.includes(lang === "zh" ? "较低值" : "lower to higher"), "source/staleness/inversion retained");
 const noCapex = runValuation({ floorInput: { ticker: "NOCAPEX", years: years.map(y => ({ ...y, capex: undefined })) }, price: null, dgs10: null, guards: { adsSuppressed: false, fundamentalsStale: false, priceStale: false, splitCoverageStale: false } });
 assert.equal(noCapex.floor?.kind, "floor");
 if (noCapex.floor?.kind === "floor") {
   assert.equal(noCapex.floor.buffett_epv.method.display?.cashflow_adjusted, false, "producer exposes capex degradation without parsing prose");
   const note = lampDisplay(noCapex.floor.buffett_epv, "owner", lang).notes.join(" ");
   assert.ok(note.includes(lang === "zh" ? "近似所有者盈利" : "approximates owner earnings"));
 }
}
assert.equal(adsRatioDisclosure("ADS", undefined, "en"), null, "never fabricate a ratio");
const unavailableAds = resolveAds("ADR", undefined);
assert.equal(unavailableAds.suppressed, true);
const suppressed = runValuation({ floorInput: { ticker: "UNKNOWN_ADS", years }, price: { close: 20, date: "2026-10-30", currency: "USD" }, dgs10: null, guards: { adsSuppressed: unavailableAds.suppressed, fundamentalsStale: false, priceStale: false, splitCoverageStale: false } });
assert.equal(suppressed.floor, undefined, "unknown ADS ratio still suppresses per-unit valuation");
assert.equal(renderToStaticMarkup(<EarningsPowerFloorCard floor={suppressed.floor} securityUnit="ADS" lang="en" />), "");

const filteredTtm = structuredClone(floor);
filteredTtm.provenance.years_used = [2024, 2023, 2022, 2021];
filteredTtm.graham_epv.method.years_used = [2024, 2023, 2022, 2021];
filteredTtm.buffett_epv.method.years_used = [2024, 2023, 2022, 2021];
filteredTtm.asset_floor.rd_years_used = [2024, 2023];
for (const lang of ["zh", "en"] as const) {
 const text = renderToStaticMarkup(<EarningsPowerFloorCard floor={filteredTtm} lang={lang} part="details" ttmPeriodEnd="2026-06-30" ttmFiscalYear={2026} />);
 assert.ok(text.includes("FY 2024"), "an excluded TTM row must not relabel a retained fiscal year");
 assert.ok(!text.includes("TTM to") && !text.includes("最近十二个月，截至"));
}
console.log("valuationPresentation.check OK");
