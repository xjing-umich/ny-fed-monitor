import React from "react";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { LinkDirectory } from "./LinkDirectory";

// A long hub must stay crawlable without repeating styling and client-link props per row.
const items = Array.from({ length: 1200 }, (_, i) => ({
  href: `/stocks/S${i}`,
  label: `S${String(i).padStart(4, "0")}`,
  note: "Company & Partners <Class A>",
})).reverse();
const html = renderToStaticMarkup(<LinkDirectory eyebrow="Directory" title="All stocks" items={items} />);
assert.equal((html.match(/<a /g) ?? []).length, 1200, "every entry needs an SSR link");
assert.ok(html.indexOf("S0000") < html.indexOf("S1199"), "directory must stay sorted");
assert.ok(html.includes("Company &amp; Partners &lt;Class A&gt;"), "issuer names stay escaped");
assert.ok(Buffer.byteLength(html) < 180_000, `directory markup too large: ${Buffer.byteLength(html)} bytes`);
assert.equal(renderToStaticMarkup(<LinkDirectory eyebrow="Directory" title="Empty" items={[]} />), "");
console.log(`LinkDirectory.check OK (${Buffer.byteLength(html)} bytes, 1200 links)`);
