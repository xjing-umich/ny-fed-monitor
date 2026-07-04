import { formatUSD, fmtMarginPct } from "./format";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }
assert(formatUSD(999_999_999) === "$1.00B", `边界滚B, got ${formatUSD(999_999_999)}`);
assert(formatUSD(1_500_000_000) === "$1.50B", "常规B");
assert(formatUSD(1_500_000) === "$1.5M", "常规M");
assert(fmtMarginPct(0.002) === "<1%", `微小正margin显示<1%, got ${fmtMarginPct(0.002)}`);
assert(fmtMarginPct(0.23) === "−23%", "常规margin带负号");
console.log("format.check OK");
