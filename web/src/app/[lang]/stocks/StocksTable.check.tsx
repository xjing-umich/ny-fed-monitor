import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StockRow } from "./StocksTable";
const require = createRequire(import.meta.url);
const nav = require.resolve("next/navigation");
require.cache[nav] = {
  id: nav,
  filename: nav,
  loaded: true,
  exports: {
    useRouter: () => ({ replace: () => {} }),
    usePathname: () => "/zh/stocks",
    useSearchParams: () => new URLSearchParams(),
  },
} as NodeJS.Module;
const { StocksTable } = require("./StocksTable");
const html = renderToStaticMarkup(
  <StocksTable
    lang="zh"
    rows={[
      {
        ticker: "TEST",
        issuer: "Fixture Company",
        holderCount: 2,
        totalValue: 100,
        barWidth: 50,
        bargain: {
          inStrikeZone: true,
          marginPct: 0.3,
          publication: {
            identityKey: "fixture:TEST",
            revisionId: "a".repeat(64),
            ticker: "TEST",
            priceDate: "2026-10-31",
            computedAt: "2026-10-31",
            attributes: {},
          },
        },
      },
    ] satisfies StockRow[]}
  />,
);
const badges = [
  ...html.matchAll(/<span[^>]*class="([^"]*)"[^>]*>击球区 · 按所示价格<\/span>/g),
];
assert.ok(badges.length > 0, "strike-zone fixture renders a badge");
for (const badge of badges) {
  assert.ok(
    badge[1].includes("text-[var(--val-below)]"),
    "strike-zone text keeps its green financial semantic",
  );
  assert.ok(
    badge[1].includes("border-[var(--val-below)]"),
    "strike-zone border keeps its green financial semantic",
  );
}
console.log("StocksTable.check OK — strike zone remains semantic green");
