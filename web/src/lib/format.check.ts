import { formatUSD, fmtMarginPct, cleanIssuer, cleanFilerName, zhSpacing, zhJoin } from "./format";
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
// 申报主体名:法律形式写回大写(线上曾显示 "Viking Global Investors Lp"、"Harris Associates L P")。
const filers: [string, string][] = [
  ["VIKING GLOBAL INVESTORS LP", "Viking Global Investors LP"],
  ["MILLER VALUE PARTNERS, LLC", "Miller Value Partners, LLC"],
  ["HARRIS ASSOCIATES L P", "Harris Associates LP"],
  ["7G CAPITAL MANAGEMENT, LLC", "7G Capital Management, LLC"],
  ["BERKSHIRE HATHAWAY INC", "Berkshire Hathaway Inc"],
  ["VAN DEN BERG MANAGEMENT I, INC", "Van Den Berg Management I, Inc"],
  ["BANK OF AMERICA CORP", "Bank of America Corp"],
];
for (const [raw, want] of filers) {
  const got = cleanFilerName(raw);
  assert(got === want, `cleanFilerName(${raw}) → ${got}, want ${want}`);
}
// 中文模板里名字两侧的空格:两边都是汉字/全角标点才去掉,汉字与英文、数字之间保留。
const spacing: [string, string][] = [
  ["27 位超级投资者持有 苹果 Apple Inc（AAPL），最大持有人 巴菲特与阿贝尔。", "27 位超级投资者持有苹果 Apple Inc（AAPL），最大持有人巴菲特与阿贝尔。"],
  ["持有 Apple Inc（AAPL）", "持有 Apple Inc（AAPL）"],
  ["（4.5%） 和 盖纳", "（4.5%）和盖纳"],
  ["截至 Q2 2026", "截至 Q2 2026"],
];
for (const [raw, want] of spacing) {
  const got = zhSpacing(raw);
  assert(got === want, `zhSpacing(${raw}) → ${got}, want ${want}`);
}
const joined = zhJoin(["第一大持仓为 ", "苹果 Apple Inc", "，其次是 ", "Visa Inc", "（12%） 和 ", "可口可乐 Coca-Cola Co", "。"]);
assert(joined.join("") === "第一大持仓为苹果 Apple Inc，其次是 Visa Inc（12%）和可口可乐 Coca-Cola Co。", `zhJoin → ${joined.join("")}`);

console.log("format.check OK");
