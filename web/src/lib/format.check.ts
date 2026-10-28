import { formatUSD, fmtMarginPct, cleanIssuer } from "./format";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }
assert(formatUSD(999_999_999) === "$1.00B", `边界滚B, got ${formatUSD(999_999_999)}`);
assert(formatUSD(1_500_000_000) === "$1.50B", "常规B");
assert(formatUSD(1_500_000) === "$1.5M", "常规M");
assert(fmtMarginPct(0.002) === "<1%", `微小正margin显示<1%, got ${fmtMarginPct(0.002)}`);
assert(fmtMarginPct(0.23) === "23%", "常规margin不带符号(标签已是安全边际)");
// 13F 原始发行人名 → 展示名(取自线上个股页的真实样本)。
const names: [string, string][] = [
  ["MICROSOFT CORP.", "Microsoft Corp"],
  ["ALPHABET INC-CL A", "Alphabet Inc Class A"],
  ["VISA INC-CLASS A SHARES", "Visa Inc Class A"],
  ["MASTERCARD INC - A", "Mastercard Inc Class A"],
  ["WALT DISNEY CO/THE", "Walt Disney Co"],
  ["AMAZON.COM INC", "Amazon.com Inc"],
  ["TAIWAN SEMICONDUCTOR-SP ADR", "Taiwan Semiconductor ADR"],
  ["ASML HOLDING NV-NY REG SHS", "ASML Holding NV"],
  ["PETROLEO BRASIL-SP PREF  ADR", "Petroleo Brasil Preferred ADR"],
  ["BANK OF AMERICA CORP", "Bank of America Corp"],
  ["JPMORGAN CHASE & CO", "JPMorgan Chase & Co"],
  ["KEYSIGHT TECHNOLOGIES IN", "Keysight Technologies Inc"],
  ["CDW CORP/DE", "CDW Corp"],
  ["CHUBB LTD", "Chubb Ltd"],
  ["ST JOE CO/THE", "St Joe Co"],
  ["MCCORMICK & CO-NON VTG SHRS", "McCormick & Co Non-Voting"],
  ["VANGUARD FTSE EMERGING MARKE", "Vanguard FTSE Emerging Markets ETF"],
  ["SS SPDR S&P 500 ETF TRUST-US", "SPDR S&P 500 ETF Trust"],
  ["MOODY'S CORP", "Moody's Corp"],
  ["BERKSHIRE HATHAWAY INC DEL", "Berkshire Hathaway Inc"],
];
for (const [raw, want] of names) {
  const got = cleanIssuer(raw);
  assert(got === want, `cleanIssuer(${raw}) → ${got}, want ${want}`);
  assert(cleanIssuer(got) === got, `cleanIssuer 幂等: ${got} → ${cleanIssuer(got)}`);
}
console.log("format.check OK");
