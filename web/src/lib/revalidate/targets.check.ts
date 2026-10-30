import assert from "node:assert/strict";
async function main() {
  const { targetedPaths, parseTickers } = await import("./targets");
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
  console.log("targeted financial page revalidation checks OK");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
