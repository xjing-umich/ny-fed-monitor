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

console.log("normalize-facts.check OK");
