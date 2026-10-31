import React from "react";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { StockValuationSummary } from "./StockValuationSummary";
import { ValuationBadge } from "../valuation/ValuationBadge";
import { LinearValueAxis } from "./LinearValueAxis";
import { stockValueSummary, linearValueAxis } from "@/lib/stocks/stockFirstScreen";
import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";

const verdict = { rangeLo: 90, rangeHi: 180, price: 360, priceDate: "2026-10-29", reliable: true, bucket: "above" } as ValuationVerdict;
const quote = { close: 360, date: "2026-10-29", currency: "USD", source: "yahoo" };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
for (const lang of ["zh", "en"] as const) {
  const model = stockValueSummary({ verdict, quote, reference: 140, kind: "earnings" }, lang)!;
  const html = renderToStaticMarkup(<StockValuationSummary model={model} lang={lang} />);
  const plain = text(html);
  assert.ok(plain.includes(lang === "zh" ? "现价高于价值区间" : "Price is above the value range"));
  assert.ok(plain.includes(lang === "zh" ? "最近收盘价" : "Latest closing price"));
  assert.ok(plain.includes("Yahoo Finance"));
  assert.match(html, /datetime="2026-10-29"/i);
  assert.equal((plain.match(/\$360\.00/g) ?? []).length, 1, "现价只可见一次");
  assert.equal((plain.match(/\$140/g) ?? []).length, 1, "参考中枢只可见一次");
  assert.ok(html.includes("<details") && plain.includes(lang === "zh" ? "取整" : "rounded"));
  assert.ok(html.includes('role="img"') && html.includes('data-value-axis="linear"'));
  assert.ok(!html.includes("md:grid-cols-[3fr_2fr]"));
  const single = stockValueSummary({ verdict, quote, kind: "zero-growth" }, lang)!;
  const singleText = text(renderToStaticMarkup(<StockValuationSummary model={single} lang={lang} />));
  assert.ok(singleText.includes(lang === "zh" ? "零增长" : "Zero-growth"));
  assert.ok(!singleText.includes(lang === "zh" ? "内在价值参考" : "Intrinsic value reference"));
  const pendingVerdict={...verdict,reliable:false,referenceOnly:"missing_reinvestment" as const};
  const pendingModel=stockValueSummary({verdict:pendingVerdict,quote,reference:140,kind:"earnings"},lang)!;
  const pendingText=text(renderToStaticMarkup(<StockValuationSummary model={pendingModel} lang={lang}/>));
  assert.ok(pendingText.includes(lang==="zh"?"零增长参考 · 待确认":"Zero-growth reference · pending review"));
  assert.ok(pendingText.includes(lang==="zh"?"未计增长溢价":"no growth premium"));
  assert.ok(!pendingText.includes(lang==="zh"?"内在价值参考":"Intrinsic value reference"));
  const badgeText=text(renderToStaticMarkup(<ValuationBadge verdict={{...pendingVerdict,ticker:"REF",fundamentalsDate:"2026-10-31",securityUnit:"share",priceSource:"fixture",publication:{identityKey:"REF",revisionId:"fixture",ticker:"REF",priceDate:"2026-10-30",computedAt:"2026-10-31",attributes:{}},computedAt:"2026-10-31"}} lang={lang}/>));
  assert.equal((badgeText.match(lang==="zh"?/待确认/g:/pending review/g)??[]).length,1,"pending reference badge suffix appears once");
  const sotp = stockValueSummary({ verdict, quote, reference: 140, kind: "sotp" }, lang)!;
  assert.ok(text(renderToStaticMarkup(<StockValuationSummary model={sotp} lang={lang} />)).includes(lang === "zh" ? "分部估值参考" : "SOTP reference"));
}
for (const [lo, hi, price] of [[100, 100, 100], [90, 90.001, 90], [1e10, 1e11, 1e12]]) {
  const html = renderToStaticMarkup(<LinearValueAxis axis={linearValueAxis(lo, hi, price)!} low={lo} high={hi} price={price} lang="en" />);
  assert.ok(!/NaN|Infinity/.test(html));
  assert.ok(html.includes('data-point-range="' + (lo === hi) + '"'));
}
console.log("StockFirstScreen.check OK");
