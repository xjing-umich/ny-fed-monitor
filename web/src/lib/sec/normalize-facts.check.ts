import { pickDebtTags, normalizeCompanyFacts } from "./normalize-facts";
import type { CompanyFacts, SecFactUnit } from "./company-facts";
import type { NormalizedFiling } from "./company-submissions";

function assert(c: boolean, m: string) {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
}
const eq = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

// 两个 noncurrent 重叠 tag 并存 → 只取合并租赁那个(原始去重不变)
const picked = pickDebtTags(
  new Set(["LongTermDebtAndFinanceLeaseObligationsNoncurrent", "LongTermDebtNoncurrent", "ShortTermBorrowings"])
);
assert(picked.includes("LongTermDebtAndFinanceLeaseObligationsNoncurrent"), "合并租赁tag优先");
assert(!picked.includes("LongTermDebtNoncurrent"), "纯LongTermDebt被去重");
assert(picked.includes("ShortTermBorrowings"), "短期借款独立组保留");

// 只报纯 tag → 退纯 tag
const picked2 = pickDebtTags(new Set(["LongTermDebtNoncurrent"]));
assert(picked2.includes("LongTermDebtNoncurrent"), "无合并tag时退纯tag");

// ── 覆盖缺口回归用例(真实公司 tag 形态,SEC companyfacts 实测)──

// HD/FDX/CMCSA: 有总额 tag → 直取,不叠加分项(否则双算)
assert(
  eq(pickDebtTags(new Set(["DebtAndCapitalLeaseObligations", "LongTermDebtAndCapitalLeaseObligations", "DebtCurrent", "ShortTermBorrowings"])),
     ["DebtAndCapitalLeaseObligations"]),
  "总额tag直取、分项不叠加(HD/FDX/CMCSA 曾算成$0)"
);

// KO: 仅 LTD&CapitalLease(老口径,非流动) → 取它(曾算成$0)
assert(
  eq(pickDebtTags(new Set(["LongTermDebtAndCapitalLeaseObligations"])),
     ["LongTermDebtAndCapitalLeaseObligations"]),
  "仅资本租赁老tag → 取它,不再归零(KO)"
);

// LUV: LTD&CapitalLease + 合并LongTermDebt(无分项非流动) → 非流动桶命中CapLease,不用合并(曾算成null)
assert(
  eq(pickDebtTags(new Set(["LongTermDebtAndCapitalLeaseObligations", "LongTermDebt"])),
     ["LongTermDebtAndCapitalLeaseObligations"]),
  "资本租赁非流动优先于合并LongTermDebt(LUV)"
);

// 纯合并LongTermDebt(无任何分项非流动)→ 兜底取合并(含流动),不再归零
assert(
  eq(pickDebtTags(new Set(["LongTermDebt", "ShortTermBorrowings"])),
     ["LongTermDebt", "ShortTermBorrowings"]),
  "无分项非流动时兜底用合并LongTermDebt+短期"
);

// ── 防 regression:既有正确的票不能被改坏 ──

// WMT: 分项齐全 + 合并LongTermDebt 并存 → 用分项三件,绝不带合并(否则双算)
assert(
  eq(pickDebtTags(new Set(["LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtCurrent", "ShortTermBorrowings"])),
     ["LongTermDebtNoncurrent", "LongTermDebtCurrent", "ShortTermBorrowings"]),
  "WMT: 有分项则弃合并LongTermDebt防双算(维持$51.5B)"
);

// CHTR: 分项非流动+流动,合并并存 → 分项,不带合并
assert(
  eq(pickDebtTags(new Set(["LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtCurrent"])),
     ["LongTermDebtNoncurrent", "LongTermDebtCurrent"]),
  "CHTR: 分项优先于合并(维持$94.4B)"
);

// ── 52/53 周财年"跨月漂移"年报归属回归(HD/PVH/CBRL/CIEN 冻结根因)──
// 零售/科技 52/53 周财年终日逐年漂移,偶尔跨越日历月界(如 HD:2024-01-28 → 2025-02-02)。
// 旧逻辑用单标量 fyeMonth + quarterOfEnd===4 判年报归属,一旦年终月份变了,整份年报被丢,
// 估值就吃到 1-2 年前的陈旧基本面。这里用 HD 式合成数据坐实:漂进 2 月后仍须出年报行,
// 且 fiscal_year 按期末中点年标注(=SEC 口径,2025-02-02 → FY2024)。
function usd(units: SecFactUnit[]) {
  return { units: { USD: units } };
}
function fyeDriftFacts(): CompanyFacts {
  return {
    cik: 354950,
    entityName: "HOME DEPOT INC",
    facts: {
      "us-gaap": {
        // 上一年(未漂移):FY2023 end 2024-01-28,~363 天 → FY 桶(中点年 2023)
        // 漂移年:FY2024 end 2025-02-02(53 周),~370 天 → FY 桶,月份从 1 月漂到 2 月
        Revenues: usd([
          { start: "2023-01-30", end: "2024-01-28", val: 150_000_000_000, filed: "2024-03-13", form: "10-K" },
          { start: "2024-01-29", end: "2025-02-02", val: 160_000_000_000, filed: "2025-03-21", form: "10-K" },
        ]),
        NetIncomeLoss: usd([
          { start: "2023-01-30", end: "2024-01-28", val: 15_000_000_000, filed: "2024-03-13", form: "10-K" },
          { start: "2024-01-29", end: "2025-02-02", val: 16_000_000_000, filed: "2025-03-21", form: "10-K" },
        ]),
        // 中段 365 天 TTM(结束于财年中,2024-07-28):绝不能被当成一份年报
        RevenueFromContractWithCustomerExcludingAssessedTax: usd([
          { start: "2023-07-30", end: "2024-07-28", val: 155_000_000_000, filed: "2024-08-20", form: "10-Q" },
        ]),
      },
    },
  } as CompanyFacts;
}
function fyeDriftFilings(): NormalizedFiling[] {
  const mk = (report: string, filed: string): NormalizedFiling => ({
    cik: "0000354950", ticker: "HD", accession_number: `acc-${report}`, form: "10-K",
    filing_date: filed, report_date: report, fiscal_year: Number(report.slice(0, 4)),
    fiscal_period: "FY", primary_document: null, filing_url: "", sec_index_url: "",
  });
  return [mk("2025-02-02", "2025-03-21"), mk("2024-01-28", "2024-03-13")];
}

// fiscalYearEnd "0128" → fyeMonth=1(SEC submissions MMDD 口径)
const drift = normalizeCompanyFacts("HD", "0000354950", fyeDriftFacts(), fyeDriftFilings(), "0128");
const driftEnds = drift.annual.map((r) => r.period_end);
assert(driftEnds.includes("2024-01-28"), "未漂移年报(2024-01-28)仍在(防 regression)");
assert(driftEnds.includes("2025-02-02"), "漂移年报(2025-02-02)必须出行,不得因跨月被丢");
const hdDrifted = drift.annual.find((r) => r.period_end === "2025-02-02");
assert(hdDrifted?.fiscal_year === 2024, "漂移年报 fiscal_year 按期末中点年=2024(SEC 口径)");
assert(hdDrifted?.revenue === 160_000_000_000, "漂移年报营收取真值 160B");
assert(!driftEnds.includes("2024-07-28"), "中段 365 天 TTM(2024-07-28)不得被误当年报");

// ── 12 月财年 53 周跨元旦碰撞回归 ──
// 结束日历年当 FY key 时:FY2023 end 2024-01-04 与 FY2024 end 2024-12-28 都进 key 2024|4,
// Map 后写覆盖前写,整份 FY2023 10-K 消失。中点年 key 后三份年报必须并存。
function dec53WeekCollisionFacts(): CompanyFacts {
  return {
    cik: 999001,
    entityName: "DEC 53-WEEK DRIFT CO",
    facts: {
      "us-gaap": {
        Revenues: usd([
          { start: "2022-01-01", end: "2022-12-31", val: 100, filed: "2023-02-15", form: "10-K" },
          { start: "2023-01-01", end: "2024-01-04", val: 110, filed: "2024-02-15", form: "10-K" },
          { start: "2024-01-05", end: "2024-12-28", val: 120, filed: "2025-02-15", form: "10-K" },
        ]),
        NetIncomeLoss: usd([
          { start: "2022-01-01", end: "2022-12-31", val: 10, filed: "2023-02-15", form: "10-K" },
          { start: "2023-01-01", end: "2024-01-04", val: 11, filed: "2024-02-15", form: "10-K" },
          { start: "2024-01-05", end: "2024-12-28", val: 12, filed: "2025-02-15", form: "10-K" },
        ]),
      },
    },
  } as CompanyFacts;
}
function dec53WeekCollisionFilings(): NormalizedFiling[] {
  const mk = (report: string, filed: string): NormalizedFiling => ({
    cik: "0000999001", ticker: "DECX", accession_number: `acc-${report}`, form: "10-K",
    filing_date: filed, report_date: report, fiscal_year: Number(report.slice(0, 4)),
    fiscal_period: "FY", primary_document: null, filing_url: "", sec_index_url: "",
  });
  return [
    mk("2022-12-31", "2023-02-15"),
    mk("2024-01-04", "2024-02-15"),
    mk("2024-12-28", "2025-02-15"),
  ];
}

const dec = normalizeCompanyFacts(
  "DECX",
  "0000999001",
  dec53WeekCollisionFacts(),
  dec53WeekCollisionFilings(),
  "1231"
);
const decEnds = dec.annual.map((r) => r.period_end).sort();
assert(decEnds.includes("2022-12-31"), "12月漂移:FY2022 end 2022-12-31 必须在");
assert(decEnds.includes("2024-01-04"), "12月漂移:FY2023 end 2024-01-04 必须在(不得被 2024-12-28 覆盖)");
assert(decEnds.includes("2024-12-28"), "12月漂移:FY2024 end 2024-12-28 必须在");
assert(decEnds.length === 3, `12月漂移:三份年报并存, got ${decEnds.length} ends=${decEnds.join(",")}`);
assert(
  dec.annual.find((r) => r.period_end === "2024-01-04")?.fiscal_year === 2023,
  "12月漂移:end 2024-01-04 → fiscal_year 2023(中点年)"
);
assert(
  dec.annual.find((r) => r.period_end === "2024-12-28")?.fiscal_year === 2024,
  "12月漂移:end 2024-12-28 → fiscal_year 2024(中点年)"
);

// ── 财年日历回归(2026-10 缺期扫描)──
// 公共小工具:按 (start, end, val, filed, form, accn) 拼 companyfacts。
type F = [start: string | null, end: string, val: number, filed: string, form: string, accn?: string];
const u = (rows: F[]): SecFactUnit[] =>
  rows.map(([start, end, val, filed, form, accn]) => ({ ...(start ? { start } : {}), end, val, filed, form, accn: accn ?? `${form}-${filed}` }));
const mkFacts = (tags: Record<string, F[]>): CompanyFacts =>
  ({ cik: 1, entityName: "FIXTURE", facts: { "us-gaap": Object.fromEntries(Object.entries(tags).map(([t, rows]) => [t, usd(u(rows))])) } }) as CompanyFacts;
const row = (rows: { period_end: string; fiscal_period: string | null }[], end: string, fp: string) =>
  rows.find((r) => r.period_end === end && r.fiscal_period === fp) as (typeof rows)[number] & Record<string, number | null>;

// 1) 52/53 周零售 16-12-12-12 周财历(KR:1 月底财年末,年末偶尔漂到 2 月 1 日)。
//    旧逻辑只认 80–100 天单季 → 16 周 Q1(112 天)整期丢;28 周 H1(196 天)也丢 → 只报 YTD 的现金流 Q2/Q3 全空;
//    年报按期中年、季度按期末年命名 → Q4 = 本财年 FY − 上一财年前三季;漂到 2/1 的单季 Q4 被当成下一年 Q1。
const kr = normalizeCompanyFacts("KRX", "0000000001", mkFacts({
  RevenueFromContractWithCustomerExcludingAssessedTax: [
    ["2023-02-26", "2024-02-03", 150_000, "2024-04-01", "10-K"],
    ["2024-02-04", "2024-05-25", 45_000, "2024-06-20", "10-Q"], // 16 周 Q1
    ["2024-05-26", "2024-08-17", 34_000, "2024-09-12", "10-Q"],
    ["2024-02-04", "2024-08-17", 79_000, "2024-09-12", "10-Q"],
    ["2024-08-18", "2024-11-09", 33_000, "2024-12-10", "10-Q"],
    ["2024-02-04", "2024-11-09", 112_000, "2024-12-10", "10-Q"],
    ["2024-02-04", "2025-02-01", 147_000, "2025-04-01", "10-K"], // 52 周,年末漂到 2 月 1 日
    ["2025-02-02", "2025-05-24", 46_000, "2025-06-20", "10-Q"],
    ["2024-02-04", "2024-05-25", 44_000, "2025-06-20", "10-Q"], // 次年比较期(重述),不得覆盖原值
  ],
  NetIncomeLoss: [
    ["2024-02-04", "2024-05-25", 900, "2024-06-20", "10-Q"],
    ["2024-11-10", "2025-02-01", 600, "2025-04-01", "10-K"], // 10-K 里直报的 12 周 Q4
    ["2024-02-04", "2025-02-01", 2_600, "2025-04-01", "10-K"],
  ],
  NetCashProvidedByUsedInOperatingActivities: [ // 现金流量表只报 YTD
    ["2024-02-04", "2024-05-25", 2_300, "2024-06-20", "10-Q"],
    ["2024-02-04", "2024-08-17", 3_400, "2024-09-12", "10-Q"], // 28 周
    ["2024-02-04", "2024-11-09", 4_300, "2024-12-10", "10-Q"], // 40 周
    ["2024-02-04", "2025-02-01", 5_800, "2025-04-01", "10-K"],
  ],
}), [], "0130");
const krQ1 = row(kr.quarterly, "2024-05-25", "Q1");
assert(krQ1?.revenue === 45_000, "16 周 Q1 必须出行,营收取原始 10-Q 值(不被次年比较期 44_000 覆盖)");
assert(row(kr.quarterly, "2025-05-24", "Q1")?.revenue === 46_000, "最新 16 周 Q1 出行");
assert(row(kr.quarterly, "2024-08-17", "Q2")?.operating_cash_flow === 1_100, "Q2 现金流 = 28 周 YTD − 16 周 Q1");
assert(row(kr.quarterly, "2024-11-09", "Q3")?.operating_cash_flow === 900, "Q3 现金流 = 40 周 YTD − 28 周 YTD");
const krQ4 = row(kr.quarterly, "2025-02-01", "Q4");
assert(krQ4?.revenue === 35_000, `Q4 营收 = 同一财年 FY − 前三季(147k − 112k), got ${krQ4?.revenue}`);
assert(krQ4?.net_income === 600, "漂到 2/1 的直报 Q4 净利归 Q4,不当成下一财年 Q1");
assert(!kr.quarterly.some((r) => r.period_end === "2025-02-01" && r.fiscal_period === "Q1"), "年末那期不得出 Q1 行");
assert(krQ4?.fiscal_year === row(kr.annual, "2025-02-01", "FY")?.fiscal_year, "Q4 与年报同一 fiscal_year 标签");
// 非财年起点起算的 110 天残段(并购过渡期之类)不得被当成 16 周 Q1
const stub = normalizeCompanyFacts("STUB", "0000000002", mkFacts({
  Revenues: [
    ["2023-01-01", "2023-12-31", 400, "2024-02-15", "10-K"],
    ["2024-01-01", "2024-03-31", 100, "2024-05-01", "10-Q"],
    ["2024-03-12", "2024-06-30", 90, "2024-08-01", "10-Q"], // 111 天,起点在财年中间
  ],
}), [], "1231");
assert(!stub.quarterly.some((r) => r.period_end === "2024-06-30"), "中段起算的 111 天残段不出季度行");

// 2) 6 月财年末(MSFT 式):旧版 Q4 = FY2026 − FY2025 前三季(生产库 MSFT Q4 营收 1266 亿)。
const jun = normalizeCompanyFacts("JUNX", "0000000003", mkFacts({
  Revenues: [
    ["2024-07-01", "2025-03-31", 200, "2025-04-25", "10-Q"],
    ["2024-07-01", "2025-06-30", 280, "2025-07-30", "10-K"],
    ["2025-07-01", "2026-03-31", 240, "2026-04-25", "10-Q"],
    ["2025-07-01", "2026-06-30", 330, "2026-07-30", "10-K"],
  ],
}), [], "0630");
assert(row(jun.quarterly, "2026-06-30", "Q4")?.revenue === 90, "6 月财年 Q4 = 330 − 240(同一财年),不是 330 − 200");
assert(row(jun.quarterly, "2025-06-30", "Q4")?.revenue === 80, "上一财年 Q4 = 280 − 200");
assert(row(jun.annual, "2026-06-30", "FY")?.fiscal_year === 2026, "6 月年报应标 FY2026,与同财年的季度一致");

// 3) submissions.fiscalYearEnd 标错(SUI 实为 12 月财年却标 "0513"):年报全被 ±1 月闸丢、季度标错季。
const sui = normalizeCompanyFacts("SUIX", "0000000004", mkFacts({
  Revenues: [
    ["2023-01-01", "2023-12-31", 3_200, "2024-02-28", "10-K"],
    ["2024-01-01", "2024-03-31", 670, "2024-04-30", "10-Q"],
    ["2024-01-01", "2024-06-30", 1_530, "2024-08-01", "10-Q"],
    ["2024-01-01", "2024-12-31", 3_220, "2025-02-28", "10-K"],
  ],
}), [], "0513");
assert(sui.annual.map((r) => r.period_end).join(",") === "2024-12-31,2023-12-31", "fiscalYearEnd 标错时年报照样出行");
assert(row(sui.quarterly, "2024-03-31", "Q1")?.revenue === 670, "3 月末那季是 Q1,不是按 5 月财年推出的 Q3");
assert(row(sui.quarterly, "2024-06-30", "Q2")?.revenue === 860, "Q2 = H1 − Q1");

// 4) 改财年(FERG:8 月起的财年 → 2026 年起改日历年,中间 10-KT 过渡 5 个月)。2026 年 10-Q 按新财历
//    重述了 2025-01-01 起的 H1 与 2025-04~06 季 —— 都落在旧财年中间,不能切断旧财年、不能占旧 Q4 槽。
const ferg = normalizeCompanyFacts("FERGX", "0000000005", mkFacts({
  Revenues: [
    ["2023-08-01", "2024-07-31", 29_600, "2024-09-25", "10-K"],
    ["2024-08-01", "2025-04-30", 22_300, "2025-06-03", "10-Q"],
    ["2024-08-01", "2025-07-31", 30_800, "2025-09-26", "10-K"],
    ["2025-08-01", "2025-12-31", 14_000, "2026-02-27", "10-KT", "kt"],
    ["2026-01-01", "2026-06-30", 16_200, "2026-08-05", "10-Q"],
    ["2025-01-01", "2025-06-30", 15_500, "2026-08-05", "10-Q"], // 新财历重述的比较期
    ["2025-04-01", "2025-06-30", 8_400, "2026-08-05", "10-Q"], // 新财历重述的比较季
  ],
}), [], "1231");
assert(ferg.annual.some((r) => r.period_end === "2025-07-31"), "改财年前的年报(2025-07-31)仍出行");
assert(row(ferg.quarterly, "2025-07-31", "Q4")?.revenue === 8_500, "旧财年 Q4 = FY − 前三季,不被重述季顶掉");
assert(!ferg.quarterly.some((r) => r.period_end === "2025-06-30"), "重述的 2025-04~06 比较季不进旧财年槽位");

// 5) 只出现在后来重述里的单季(GEF 剥离业务后 10-KT 重述 2024-08~10 季)不顶掉原始累计数推出的 Q4。
const gef = normalizeCompanyFacts("GEFX", "0000000006", mkFacts({
  Revenues: [
    ["2023-11-01", "2024-07-31", 4_000, "2024-09-01", "10-Q"],
    ["2023-11-01", "2024-10-31", 5_400, "2024-12-23", "10-K"],
    ["2024-08-01", "2024-10-31", 1_100, "2025-11-19", "10-KT"],
  ],
}), [], "1031");
assert(row(gef.quarterly, "2024-10-31", "Q4")?.revenue === 1_400, "Q4 取原始申报推出的 5400 − 4000,不取一年后的重述 1100");

// 6) 两套重叠的年报区间 = 会计主体换了(RJET:Mesa 9 月财年 → 反向并购后按 Republic 12 月财年重报)。
const rjet = normalizeCompanyFacts("RJETX", "0000000007", mkFacts({
  Revenues: [
    ["2021-10-01", "2022-09-30", 530, "2022-12-20", "10-K"], // 旧主体
    ["2022-10-01", "2023-09-30", 500, "2023-12-20", "10-K"],
    ["2023-01-01", "2023-12-31", 1_110, "2026-03-02", "10-K"], // 新主体重报
    ["2024-01-01", "2024-12-31", 1_165, "2026-03-02", "10-K"],
    ["2025-01-01", "2025-12-31", 1_346, "2026-03-02", "10-K"],
  ],
}), [], "1231");
assert(
  rjet.annual.map((r) => r.period_end).join(",") === "2025-12-31,2024-12-31,2023-12-31",
  `换会计主体后只留新主体年报, got ${rjet.annual.map((r) => r.period_end).join(",")}`
);

console.log("normalize-facts.check OK");

assert(row(jun.quarterly, "2026-06-30", "Q4")?.fiscal_year === 2026, "Q4 and FY use the same fiscal-year identity");

// Reported FY focus wins over heuristics: two January/February retailers use
// different labels for comparable calendar ends, and later comparatives cannot relabel them.
const focusedFacts=fyeDriftFacts();
for(const concept of Object.values(focusedFacts.facts["us-gaap"]))for(const units of Object.values(concept.units))for(const u of units)if(u.end==="2025-02-02")u.fy=2025;
const focused=normalizeCompanyFacts("RETAIL", "0000000009", focusedFacts, fyeDriftFilings(), "0128");
assert(focused.annual.find(r=>r.period_end==="2025-02-02")?.fiscal_year===2025,"own reported fiscal focus must override fallback retail naming");

// Real SEC 20-F metadata can carry a stale FY focus even for the original filing.
const foreignFocus=mkFacts({Revenues:[["2021-01-01","2021-12-31",100,"2022-04-25","20-F"]]});
for(const concept of Object.values(foreignFocus.facts["us-gaap"]))for(const units of Object.values(concept.units))for(const u of units)u.fy=2020;
const foreignResult=normalizeCompanyFacts("FOREIGN","0000000008",foreignFocus,[],"1231");
assert(foreignResult.annual[0]?.fiscal_year===2021,"stale 20-F fiscal focus cannot relabel the actual 2021 reporting period as 2020");

// SEC ALNY companyfacts verified 2026-10-31: Q1 total is absent; H1 and Q2 exist.
const alnyClosureFacts = (quarterStart = "2026-04-01", h1 = true) => mkFacts({
  Revenues: [
    ["2025-01-01", "2025-12-31", 3_713_937_000, "2026-02-12", "10-K"],
    ...(h1 ? [["2026-01-01", "2026-06-30", 2_458_123_000, "2026-07-30", "10-Q", "0001178670-26-000062"]] : []),
    [quarterStart, "2026-06-30", 1_290_948_000, "2026-07-30", "10-Q", "0001178670-26-000062"],
  ] as Parameters<typeof mkFacts>[0][string],
  NetIncomeLoss: [["2026-01-01", "2026-03-31", 205_991_000, "2026-04-30", "10-Q"]],
});
const alnyClosure = normalizeCompanyFacts("ALNYX", "0001178670", alnyClosureFacts(), [], "1231");
const alnyRecovered = alnyClosure.quarterly.find(r => r.period_end === "2026-03-31" && r.fiscal_period === "Q1");
assert(alnyRecovered?.revenue === 1_167_175_000, "Q1 recovered exactly from reported H1 minus reported standalone Q2");
const recoveredRaw = alnyRecovered?.raw_facts?.revenue as { filed?: string; tag?: string; derived?: boolean } | undefined;
assert(recoveredRaw?.derived === true && recoveredRaw.tag?.includes("H1-Q2") === true, "inverse closure preserves derived provenance");
assert(recoveredRaw?.filed === "2026-07-30" && alnyRecovered?.filing_date === "2026-07-30", "Q1 unavailable before both sources");
const missingH1 = normalizeCompanyFacts("NOH1", "0001178670", alnyClosureFacts("2026-04-01", false), [], "1231");
assert(row(missingH1.quarterly, "2026-03-31", "Q1")?.revenue == null, "Q2 alone cannot invent Q1");
const nonQuarter = normalizeCompanyFacts("STUBQ2", "0001178670", alnyClosureFacts("2026-03-12"), [], "1231");
assert(row(nonQuarter.quarterly, "2026-03-31", "Q1")?.revenue == null, "partial Q2 cannot invent Q1");
const crossFiscal = normalizeCompanyFacts("CROSS", "0001178670", mkFacts({
  Revenues: [["2024-08-01", "2025-07-31", 30_000, "2025-09-26", "10-K"],
    ["2025-01-01", "2025-06-30", 15_500, "2026-08-05", "10-Q"],
    ["2025-04-01", "2025-06-30", 8_400, "2026-08-05", "10-Q"]],
}), [], "0731");
assert(!crossFiscal.quarterly.some(r => r.period_end === "2025-03-31"), "another fiscal calendar cannot create Q1");
const invalidInverse = mkFacts({Revenues: [
  ["2025-01-01", "2025-12-31", 400, "2026-02-01", "10-K"],
  ["2026-01-01", "2026-06-30", 100, "2026-08-01", "10-Q"],
  ["2026-04-01", "2026-06-30", 200, "2026-08-01", "10-Q"],
], EarningsPerShareDiluted: [
  ["2026-01-01", "2026-06-30", 4, "2026-08-01", "10-Q"],
  ["2026-04-01", "2026-06-30", 3, "2026-08-01", "10-Q"],
]});
const invalidResult = normalizeCompanyFacts("INVALID", "0000000001", invalidInverse, [], "1231");
assert(!invalidResult.quarterly.some(r => r.fiscal_period === "Q1" && (r.revenue != null || r.eps_diluted != null)), "inverse recovery cannot create negative revenue or subtract nonadditive EPS");
const futureInverse = alnyClosureFacts();
for (const c of Object.values(futureInverse.facts["us-gaap"])) for (const units of Object.values(c.units)) for (const f of units) {
  if (f.start) f.start = f.start.replace(/^202[56]/, "2033");
  if (f.end) f.end = f.end.replace(/^202[56]/, "2033");
}
const futureRecovered = normalizeCompanyFacts("FUTUREINVERSE", "0000000001", futureInverse, [], "1231");
assert(!futureRecovered.quarterly.some(r => r.period_end.startsWith("2033")), "inverse recovery preserves the future-period guard");

// SWX source-backed continuing revenue must not publish a Centuri-inclusive YoY.
const swxComparableFacts:CompanyFacts={cik:1692115,entityName:"Southwest Gas Holdings",facts:{"us-gaap":{
 RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[
 {start:"2025-01-01",end:"2025-12-31",val:1000,form:"10-K",filed:"2026-02-25",accn:"old"},
 {start:"2026-04-01",end:"2026-06-30",val:358154000,form:"10-Q",filed:"2026-08-06",accn:"new",source_tag:"us-gaap:RegulatedOperatingRevenue"} as SecFactUnit,
 {start:"2025-04-01",end:"2025-06-30",val:1120346000,form:"10-Q",filed:"2025-08-06",accn:"prior"}
 ]}},NetIncomeLoss:{units:{USD:[{start:"2026-04-01",end:"2026-06-30",val:10,form:"10-Q",filed:"2026-08-06",accn:"new"}]}}
}}};
const swxNormalized=normalizeCompanyFacts("SWX","0001692115",swxComparableFacts,[],"1231").quarterly.find(r=>r.period_end==="2026-06-30");
assert(swxNormalized?.revenue===358154000,"verified SWX revenue retained");
assert(swxNormalized?.missing_fields.revenue_comparability===true,"SWX continuing revenue flagged before growth computation");
assert(swxNormalized?.revenue_yoy===null,"SWX incompatible revenue comparison stays null");

const mixedInverse=alnyClosureFacts();
for(const u of mixedInverse.facts["us-gaap"].Revenues.units.USD)if(u.start==="2026-04-01"){u.accn="later-recast-filing";u.filed="2026-10-30";}
assert(normalizeCompanyFacts("RECASTINVERSE","0001178670",mixedInverse,[],"1231").quarterly.find(r=>r.period_end==="2026-03-31")?.revenue==null,"H1 and Q2 from different filings cannot manufacture a mixed-basis Q1");
