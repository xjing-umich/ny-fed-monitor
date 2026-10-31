import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvestorHoldingsTable } from "./InvestorHoldingsTable";
import { AggregateRankingList } from "../aggregate/AggregateRankingList";

// Option notional can exceed the non-option portfolio: the explanation must be visible,
// including their exclusion from the aggregate value and count.
const holdings = [
  { cusip: "A", issuer: "Apple", shares: 1, value: 10, weight: 1 },
  { cusip: "A", issuer: "Apple", shares: 100, value: 1000, putCall: "Put" },
];
for (const lang of ["en", "zh"] as const) {
  const html = renderToStaticMarkup(<InvestorHoldingsTable holdings={holdings} lang={lang} cusipToTicker={new Map([["A", "AAPL"]])} verdicts={new Map()} holderCounts={new Map([["AAPL", 17]])} rowSignals={new Map()} changeByKey={new Map()} hasPrior={false} lonelyTickers={new Set()} filingUrl="https://www.sec.gov" availableStocks={new Set()} />);
  // Strip markup/attributes so a title-only tooltip cannot satisfy visible disclosure.
  const text = html.replace(/<[^>]*>/g, " ");
  assert.match(text, lang === "en" ? /Options show underlying notional value.*excluded from portfolio value and position count/ : /期权.*标的名义价值.*不计入组合市值及持仓数/);
  assert.match(text, lang === "en" ? /Position-size change/ : /持仓数量变动/);
  const ranking = renderToStaticMarkup(<AggregateRankingList lang={lang} primaryLabel="holders" rows={[{ ticker: "AAPL", issuer: "Apple", primary: 2, href: "", pctOfAggregate: .25 }]} />).replace(/<[^>]*>/g, " ");
  assert.match(ranking, lang === "en" ? /listed 1 holding.*value/ : /榜内 1 只持仓市值/);
}
console.log("filingPresentation.check OK");
