import assert from "node:assert/strict";
async function main() {
  const { targetedPaths, parseTickers, parsePublicationPaths, publicationRevalidationPaths } = await import("./targets");
  const paths = targetedPaths(parseTickers(["msft", "MSFT", "GOOG"]), false);
  assert.ok(paths.includes("/en/stocks/MSFT"));
  assert.ok(paths.includes("/zh/stocks/MSFT"));
  assert.ok(paths.includes("/api/sec/company/MSFT"));
  assert.ok(
    !paths.includes("/[lang]/stocks/[ticker]"),
    "changed data must not invalidate every stock",
  );
  assert.ok(!paths.includes("/en/stocks/PDD"));
  assert.equal(paths.filter((p: string) => p === "/en/stocks/MSFT").length, 1);
  const v = targetedPaths(["MSFT"], true);
  assert.ok(
    v.includes("/[lang]/investors/[slug]"),
    "holder valuation badges also refresh",
  );
  assert.ok(v.includes("/[lang]/stocks/screener/[variant]"));
  assert.throws(() => parseTickers(["../investors"]), /ticker/i);
  assert.throws(() => parseTickers("MSFT"), /ticker/i);
  assert.deepEqual(publicationRevalidationPaths(parsePublicationPaths(["/stocks?page=2", "/zh/stocks/screener/cheap", "/stocks?page=2"])),["/en/stocks","/zh/stocks/screener/cheap"]);
  assert.throws(()=>parsePublicationPaths(["https://other.invalid/stocks"]),/publication/i);
  assert.throws(()=>parsePublicationPaths(["/api/revalidate"]),/publication/i);
  assert.throws(()=>parsePublicationPaths(["//other.invalid"]),/publication/i);
  console.log("targeted financial page revalidation checks OK");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
