import { formatUSD } from "./format";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }
assert(formatUSD(999_999_999) === "$1.00B", `边界滚B, got ${formatUSD(999_999_999)}`);
assert(formatUSD(1_500_000_000) === "$1.50B", "常规B");
assert(formatUSD(1_500_000) === "$1.5M", "常规M");
console.log("format.check OK");
