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

{
const items = ["伊坎", "伯科威茨", "佩尔茨", "勒布", "哈尔沃森"].map((label, i) => ({ label, href: `/investors/${i}` }));
const expected = ["伯科威茨", "哈尔沃森", "勒布", "佩尔茨", "伊坎"];
const html = renderToStaticMarkup(<LinkDirectory eyebrow="目录" title="按名称拼音排序" items={items} sortLocale="zh-CN-u-co-pinyin" />);
assert.deepEqual([...html.matchAll(/<a href="[^"]+"><span>(.*?)<\/span>/g)].map((m) => m[1]), expected, "Chinese directory follows explicitly selected pinyin collation");
assert.deepEqual(items.map((i) => i.label), ["伊坎", "伯科威茨", "佩尔茨", "勒布", "哈尔沃森"], "sorting never mutates source items");
const english = [{ href: "/z", label: "Zulu" }, { href: "/a", label: "alpha" }];
assert.ok(renderToStaticMarkup(<LinkDirectory eyebrow="Directory" title="A–Z" items={english} />).indexOf("alpha") < renderToStaticMarkup(<LinkDirectory eyebrow="Directory" title="A–Z" items={english} />).indexOf("Zulu"), "existing callers retain English ordering");
console.log("LinkDirectory.check OK");

}
