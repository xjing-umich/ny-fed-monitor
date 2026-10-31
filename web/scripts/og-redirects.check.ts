import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
Object.assign(globalThis, { AsyncLocalStorage });
import config from "../next.config";
async function main() {
  const { unstable_getResponseFromNextConfig } = await import("next/experimental/testing/server");
  for (const path of ["/opengraph-image", "/zh/opengraph-image", "/learn/opengraph-image", "/zh/learn/test/opengraph-image", "/stocks/BRK.B/opengraph-image"]) {
    const response = await unstable_getResponseFromNextConfig({ url: `https://thecompounder.fyi${path}?v=old`, nextConfig: config });
    assert.equal(response.status, 308, path);
    assert.equal(response.headers.get("location"), `https://thecompounder.fyi${path}/default?v=old`, "preserve locale, path and cached query");
  }
  const current = await unstable_getResponseFromNextConfig({ url: "https://thecompounder.fyi/zh/learn/opengraph-image/default", nextConfig: config });
  assert.notEqual(current.status, 308, "no redirect loop for current image URLs");
  console.log("og-redirects.check OK");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
