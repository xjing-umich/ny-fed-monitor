import assert from "node:assert/strict";
import { getOfficialSourceRoute, OfficialSourcePendingError } from "./registry";
for (const [ticker,cik,adapter,currency] of [
  ["IBN","0001103838","sec_html","INR"], ["HMRZF","0001396282","esef_zip","SEK"],
  ["HKHHF","0001142231","inline_viewer","EUR"], ["OZK","0001569650","fdic_pdf","USD"],
  ["TRMLF","0002071881","issuer_pdf","CAD"],
]) {
  const route=getOfficialSourceRoute(ticker,cik)!;
  assert.equal(route.adapter,adapter);assert.equal(route.currency,currency);
  assert.throws(()=>getOfficialSourceRoute(ticker,"0000000001"),/identity/i);
  assert.equal(route.is_foreign_issuer,ticker!=="OZK");
  assert.ok(route.issuer_name);
  if(ticker==="OZK") {
    const error=new OfficialSourcePendingError({...route,adapter:"pdf_pending"});
    assert.match(error.message,/PDF/);assert.equal(error.code,"official_pdf_adapter_pending");
    assert.equal(error.route.ticker,ticker);
  }
}
assert.equal(getOfficialSourceRoute("MSFT","0000789019"),null,"unregistered issuers retain SEC behavior");
console.log("official financial source routing identity and pending reason checks OK");
