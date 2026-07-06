import { hasLongHoldings, isRealHolding } from "./lib/holdingFilters";
function assert(c: boolean, msg: string) { if (!c) { console.error("FAIL:", msg); process.exit(1); } }
assert(isRealHolding({ cusip: "037833100", issuer: "APPLE INC", value: 1e9, shares: 1000 }), "real holding kept");
assert(!isRealHolding({ cusip: "000000000", issuer: "NONE", value: 0, shares: 0 }), "NONE placeholder dropped");
assert(!isRealHolding({ cusip: "000000000", issuer: "NONE", value: 0, shares: 0 }) === true, "NONE dropped (bool)");
assert(!isRealHolding({ cusip: "", issuer: "X", value: 1, shares: 1 }), "empty cusip dropped");
assert(
  !hasLongHoldings([{ cusip: "69608A108", issuer: "PALANTIR TECHNOLOGIES INC", value: 9e8, shares: 100, putCall: "Put" }]),
  "filing with only put/call rows must not become latest long-only filing"
);
assert(
  hasLongHoldings([
    { cusip: "69608A108", issuer: "PALANTIR TECHNOLOGIES INC", value: 9e8, shares: 100, putCall: "Put" },
    { cusip: "037833100", issuer: "APPLE INC", value: 1e8, shares: 1000 },
  ]),
  "filing with at least one common-stock row remains eligible"
);
console.log("ingest-13f.check OK");
