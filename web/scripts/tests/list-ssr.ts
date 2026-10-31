// Read-only acceptance: LIST_SSR_ORIGIN=http://localhost:3107 npx tsx scripts/tests/list-ssr.ts
import assert from 'node:assert/strict';
async function main() {
 const origin = process.env.LIST_SSR_ORIGIN ?? 'https://thecompounder.fyi';
 for (const path of ['/stocks', '/zh/stocks', '/investors', '/zh/investors']) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200, path);
  const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
  assert.ok(main.includes('<tbody>') && /<td\b/.test(main), `${path}: default numeric rows must exist in server HTML`);
  assert.match(main, /(?:[0-9]+(?:\.[0-9]+)?[BM亿万]|\$[0-9])/, `${path}: numeric values`);
  assert.ok(!main.includes('"type":"BailoutToCSR"'), path);
  console.log(`SSR numeric rows OK ${path}`);
 }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
