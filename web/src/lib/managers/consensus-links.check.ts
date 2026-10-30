import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const id = require.resolve('./db');
let error: {message:string} | null = { message: 'fixture lookup failed' };
require.cache[id] = { id, filename: id, loaded: true, exports: {
 hasSupabaseEnv: () => true,
 selectAllPages: async () => ({ data: [], error }),
} } as NodeJS.Module;
const { readStockLinkHolders } = require('./consensusRead');
async function main() {
 const log = console.error;
 console.error = () => {};
 try { assert.equal(await readStockLinkHolders(['TEST']), null, 'failed query must stay distinct from proven empty snapshot'); }
 finally { console.error = log; }
 error = null;
 assert.deepEqual(await readStockLinkHolders(['TEST']), [], 'successful empty lookup permits fallback proof');
 console.log('consensus-links.check OK');
}
main().catch((e) => { console.error(e); process.exit(1); });
