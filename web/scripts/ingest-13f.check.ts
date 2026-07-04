import { isRealHolding } from "./lib/holdingFilters";
function assert(c: boolean, msg: string) { if (!c) { console.error("FAIL:", msg); process.exit(1); } }
assert(isRealHolding({ cusip: "037833100", issuer: "APPLE INC", value: 1e9, shares: 1000 }), "real holding kept");
assert(!isRealHolding({ cusip: "000000000", issuer: "NONE", value: 0, shares: 0 }), "NONE placeholder dropped");
assert(!isRealHolding({ cusip: "000000000", issuer: "NONE", value: 0, shares: 0 }) === true, "NONE dropped (bool)");
assert(!isRealHolding({ cusip: "", issuer: "X", value: 1, shares: 1 }), "empty cusip dropped");
console.log("ingest-13f.check OK");
