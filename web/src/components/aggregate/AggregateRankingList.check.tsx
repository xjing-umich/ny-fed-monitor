import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AggregateRankingList } from "./AggregateRankingList";
const html = renderToStaticMarkup(
  <AggregateRankingList
    lang="zh"
    primaryLabel="持有机构数"
    rows={[2, -2, 0].map((delta, i) => ({
      ticker: "FIX" + i,
      issuer: "Fixture " + i,
      primary: 5,
      href: "/zh/stocks/FIX" + i,
      delta,
    }))}
  />,
);
const tone = (text: string) =>
  [...html.matchAll(/<div class="([^"]*)">([^<]*)<\/div>/g)].find(
    (m) => m[2] === text,
  )?.[1] ?? "";
assert.ok(
  tone("+2 位").includes("text-[var(--tt-positive)]"),
  "positive holder delta keeps financial positive token",
);
assert.ok(
  tone("−2 位").includes("text-[var(--tt-negative)]"),
  "negative holder delta keeps financial negative token",
);
assert.ok(
  tone("持平").includes("text-[var(--tt-faint)]"),
  "zero holder delta stays neutral",
);
console.log(
  "AggregateRankingList.check OK — positive/negative/zero delta semantics",
);
