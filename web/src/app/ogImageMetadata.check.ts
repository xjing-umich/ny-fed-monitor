import assert from "node:assert/strict";
import { generateImageMetadata } from "./[lang]/learn/[slug]/opengraph-image";
import { getArticle } from "@/lib/learn";
import { reportTitle } from "@/lib/reports/copy";
import { generateImageMetadata as home } from "./[lang]/opengraph-image";
import { generateImageMetadata as about } from "./[lang]/about/opengraph-image";
import { generateImageMetadata as learn } from "./[lang]/learn/opengraph-image";
import { generateImageMetadata as buys } from "./[lang]/investors/buys/opengraph-image";
import { generateImageMetadata as sells } from "./[lang]/investors/sells/opengraph-image";
import { generateImageMetadata as consensus } from "./[lang]/investors/consensus/opengraph-image";
import { generateImageMetadata as stock } from "./[lang]/stocks/[ticker]/opengraph-image";

async function main() {
  for (const slug of ["how-to-read-a-13f", "q2-2026-superinvestor-consensus"]) {
    for (const lang of ["en", "zh"] as const) {
      const article = getArticle(slug, lang);
      assert.ok(article, `fixture article exists: ${slug}`);
      const metadata = await generateImageMetadata({ params: { lang, slug } });
      assert.ok(metadata[0].alt.includes(article.title), "article image alternative text identifies the actual article in its selected language");
      assert.ok(metadata[0].id, "generated image metadata supplies a stable route id");
      assert.deepEqual(metadata[0].size, { width: 1200, height: 630 });
    }
  }
  for (const lang of ["en", "zh"] as const) {
    const report = generateImageMetadata({ params: { lang, slug: "q3-2026-superinvestor-consensus" } });
    assert.ok(report[0].alt.includes(reportTitle("2026-09-30", lang)), "generated quarterly reports use their quarter title without reading unpublished payloads");
    for (const generate of [home, about, learn, buys, sells, consensus]) {
      const metadata = generate({ params: { lang } });
      assert.equal(/[\u4e00-\u9fff]/.test(metadata[0].alt), lang === "zh", "locale determines image alternative text independently of image rendering");
      assert.equal(metadata[0].id, "default", "image URL stays aligned with the shared SEO helper");
    }
    assert.ok(stock({ params: { lang, ticker: "AAPL" } })[0].alt.includes("AAPL"), "stock image alternatives identify the requested security");
  }
  console.log("ogImageMetadata.check OK");
}
void main();
