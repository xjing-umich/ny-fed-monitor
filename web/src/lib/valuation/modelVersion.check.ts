import assert from "node:assert/strict";
import { projectPublicationFixture, publicationFixture } from "../../../scripts/tests/publication-fixture";
import * as readers from "./valuationSnapshot";
process.env.SUPABASE_URL="http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_KEY="fixture";
const base={reliable:true,in_strike_zone:true,verdict_bucket:"below",range_lo:60,range_hi:120,price:50,margin_pct:.5};
const rows=[publicationFixture({...base,ticker:"NEW"},1),publicationFixture({...base,ticker:"OLD",payload:{model_version:"old"}},2),publicationFixture({...base,ticker:"SATS"},3)];
let requests=0;
globalThis.fetch=async input=>{
 const url=new URL(input instanceof Request ? input.url : String(input));
 assert.equal(url.origin,"http://127.0.0.1:54321");
 if (url.pathname.endsWith("/consensus_holdings")) return Response.json([{ticker:"NEW",issuer:"New",holder_count:5}]);
 assert(url.pathname.endsWith("/tracking_securities"));requests++;
 return Response.json(rows.map(row=>projectPublicationFixture(row,url.searchParams.get("select"))));
};
async function main() {
 assert.deepEqual([...(await readers.readValuationVerdicts(["OLD","NEW","SATS"])).keys()],["NEW"]);
 assert.deepEqual([...(await readers.readBargainVerdicts()).keys()],["NEW"]);
 const leaders=await readers.readStrikeZoneLeaders(5);assert.equal(leaders.total,1);assert.equal(leaders.leaders[0].ticker,"NEW");
 const screen=await readers.readValuationScreen("all");assert.deepEqual(screen.rows.map(row=>row.ticker),["NEW"]);
 const conviction=await readers.readConvictionScreen();assert.deepEqual(conviction.rows.map(row=>row.ticker),["NEW"]);
 assert(requests>=5);
 console.log("publication version and identity behavior checks passed");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
