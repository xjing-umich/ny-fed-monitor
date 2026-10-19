/**
 * predecessor 行为校验。跑法: npx tsx src/lib/sec/predecessor.check.ts
 * 无 IO:假 companyfacts 复刻 XOM 2026-07 控股重组(新 CIK 只有一份由前身代交的 10-Q)。
 */
import { isPredecessorMatch, mergePredecessorFacts, predecessorCandidates, predecessorMatch, MIN_OVERLAP } from "./predecessor";
import type { CompanyFacts, SecFactUnit } from "./company-facts";
import type { NormalizedFiling } from "./company-submissions";
import { normalizeCompanyFacts } from "./normalize-facts";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) return console.log(`  ✓ ${name}`);
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const NEW_CIK = "0002115436";
const OLD_CIK = "0000034088";
const TODAY = new Date("2026-10-19T00:00:00Z");

const filing = (cik: string, acc: string, form: string, report: string, filed: string): NormalizedFiling => ({
  cik, ticker: "XOM", accession_number: acc, form, filing_date: filed, report_date: report,
  fiscal_year: null, fiscal_period: null, primary_document: "xom.htm", filing_url: "", sec_index_url: "",
} as NormalizedFiling);

const u = (start: string | undefined, end: string, val: number, accn: string, form: string, filed: string): SecFactUnit =>
  ({ ...(start ? { start } : {}), end, val, accn, form, filed });

// 前身(旧 CIK):FY2025 10-K + 2025 各季 10-Q + 2026Q1 10-Q,营收用次级概念 Revenues。
const predecessor: CompanyFacts = {
  cik: 34088, entityName: "EXXON MOBIL CORP",
  facts: { "us-gaap": {
    Revenues: { units: { USD: [
      u("2025-01-01", "2025-03-31", 83_130, `${OLD_CIK}-25-000024`, "10-Q", "2025-05-05"),
      u("2025-04-01", "2025-06-30", 81_506, `${OLD_CIK}-25-000042`, "10-Q", "2025-08-04"),
      u("2025-01-01", "2025-06-30", 164_636, `${OLD_CIK}-25-000042`, "10-Q", "2025-08-04"),
      u("2025-07-01", "2025-09-30", 85_294, `${OLD_CIK}-25-000061`, "10-Q", "2025-11-03"),
      u("2025-01-01", "2025-12-31", 332_238, `${OLD_CIK}-26-000045`, "10-K", "2026-02-18"),
      u("2026-01-01", "2026-03-31", 85_138, `${OLD_CIK}-26-000067`, "10-Q", "2026-05-04"),
    ] } },
    Assets: { units: { USD: [
      u(undefined, "2025-12-31", 450_000, `${OLD_CIK}-26-000045`, "10-K", "2026-02-18"),
      u(undefined, "2026-03-31", 455_000, `${OLD_CIK}-26-000067`, "10-Q", "2026-05-04"),
    ] } },
  } },
};

// 继任者(新 CIK):只有 2026Q2 10-Q(前身代交,accession 前缀 = 旧 CIK)。
// 去年同期比较数一份与前身原样一致(Revenues),一份用了优先级更高的概念且数值不同 —— 不能顶掉历史。
const Q2_26 = `${OLD_CIK}-26-000093`;
const successor: CompanyFacts = {
  cik: 2115436, entityName: "ExxonMobil Holdings Corp",
  facts: { "us-gaap": {
    Revenues: { units: { USD: [
      u("2026-04-01", "2026-06-30", 116_017, Q2_26, "10-Q", "2026-08-03"),
      u("2025-04-01", "2025-06-30", 81_506, Q2_26, "10-Q", "2026-08-03"),
      u("2025-01-01", "2025-06-30", 164_636, Q2_26, "10-Q", "2026-08-03"),
      u("2026-01-01", "2026-06-30", 201_155, Q2_26, "10-Q", "2026-08-03"),
    ] } },
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
      u("2025-04-01", "2025-06-30", 79_999, Q2_26, "10-Q", "2026-08-03"),
    ] } },
    Assets: { units: { USD: [
      u(undefined, "2026-06-30", 460_000, Q2_26, "10-Q", "2026-08-03"),
      u(undefined, "2025-12-31", 450_000, Q2_26, "10-Q", "2026-08-03"),
    ] } },
    // 继任者自己的 DEF 14A 事实(非 10-Q/10-K):拼接时不带入
    NetIncomeLoss: { units: { USD: [u("2025-01-01", "2025-12-31", 28_844, "0001193125-26-000001", "DEF 14A", "2026-09-01")] } },
  } },
};
// 让一致条数达到闸值:多复制几条一致的非零美元比较数(真实 XOM 为 111/111 条)
for (let i = 1; i <= MIN_OVERLAP; i++) {
  const tag = `Filler${i}`;
  predecessor.facts["us-gaap"][tag] = { units: { USD: [u("2025-04-01", "2025-06-30", i * 1_000, `${OLD_CIK}-25-000042`, "10-Q", "2025-08-04")] } };
  successor.facts["us-gaap"][tag] = { units: { USD: [u("2025-04-01", "2025-06-30", i * 1_000, Q2_26, "10-Q", "2026-08-03")] } };
}

const successorFilings = [
  filing(NEW_CIK, Q2_26, "10-Q", "2026-06-30", "2026-08-03"),
  filing(NEW_CIK, "0002115436-26-000013", "8-K", "2026-10-16", "2026-10-16"),
];

console.log("predecessorCandidates");
check("年轻继任者:前身代交的 10-Q 前缀成为候选", predecessorCandidates(NEW_CIK, successor, successorFilings, TODAY).join() === OLD_CIK);
check("8-K 等非 10-Q/10-K 的前缀不算", !predecessorCandidates(NEW_CIK, successor, successorFilings, TODAY).includes("0002115436"));
check(
  "老公司(最早申报早于 3 年前)零候选、零额外请求",
  predecessorCandidates(OLD_CIK, predecessor, [filing(OLD_CIK, "0001193125-25-000001", "10-Q", "2025-06-30", "2025-08-04")], new Date("2029-01-01")).length === 0,
);
check(
  "自交申报(前缀 = 本 CIK)无候选",
  predecessorCandidates(NEW_CIK, successor, [filing(NEW_CIK, "0002115436-26-000020", "10-Q", "2026-09-30", "2026-11-03")], TODAY).length === 0,
);

console.log("predecessorMatch");
const match = predecessorMatch(successor, predecessor, successorFilings);
check(`同一家公司:前身时期比较数几乎全一致(≥ ${MIN_OVERLAP} 条且 ≥ 80%)`, isPredecessorMatch(match), JSON.stringify(match));
check("继任者本期事实不进分母", match.total === 14, JSON.stringify(match));
const stranger: CompanyFacts = { cik: 1, entityName: "OTHER", facts: { "us-gaap": { Revenues: { units: { USD: [u("2025-04-01", "2025-06-30", 5, "x", "10-Q", "2025-08-01")] } } } } };
check("无关公司 / 申报代理对不上", !isPredecessorMatch(predecessorMatch(successor, stranger, successorFilings)));

// 分拆公司 vs 母公司(GEV/GE 型):同期末日的 0 值、每股数大量相同,另有十来笔交易额相同,但分拆公司自己的
// 历史(carve-out)绝大部分与母公司不同 —— 实测一致率 < 1%,必须拒绝。
const spinoff: CompanyFacts = { cik: 2, entityName: "SPINCO", facts: { "us-gaap": {} } };
const parent: CompanyFacts = { cik: 3, entityName: "PARENT", facts: { "us-gaap": {} } };
for (let i = 1; i <= 200; i++) {
  const zero = u("2025-01-01", "2025-12-31", 0, "p", "10-K", "2026-02-01");
  const eps = { ...u("2025-01-01", "2025-12-31", 1.5, "p", "10-K", "2026-02-01") };
  spinoff.facts["us-gaap"][`Zero${i}`] = { units: { USD: [zero], "USD/shares": [eps] } };
  parent.facts["us-gaap"][`Zero${i}`] = { units: { USD: [zero], "USD/shares": [eps] } };
  spinoff.facts["us-gaap"][`Own${i}`] = { units: { USD: [u("2025-01-01", "2025-12-31", 1_000_000 + i, "s", "10-Q", "2026-05-01")] } };
  parent.facts["us-gaap"][`Own${i}`] = { units: { USD: [u("2025-01-01", "2025-12-31", i <= 12 ? 1_000_000 + i : 9_000_000 + i, "p", "10-K", "2026-02-01")] } };
}
const spinFilings = [filing("0000000002", "0000000003-26-000001", "10-Q", "2026-03-31", "2026-05-01")];
const spinMatch = predecessorMatch(spinoff, parent, spinFilings);
check("分拆公司对母公司:0 值与每股数不计,12/200 笔交易额一致仍拒绝", !isPredecessorMatch(spinMatch) && spinMatch.matched === 12 && spinMatch.total === 200, JSON.stringify(spinMatch));

console.log("mergePredecessorFacts");
const merged = mergePredecessorFacts(successor, predecessor, successorFilings);
const units = (tag: string) => merged.facts["us-gaap"][tag]?.units.USD ?? [];
check("前身历史保留(FY2025 10-K)", units("Revenues").some((x) => x.end === "2025-12-31" && x.accn === `${OLD_CIK}-26-000045`));
check("继任者本期事实带入", units("Revenues").some((x) => x.end === "2026-06-30" && x.accn === Q2_26));
check("继任者比较期事实不带入", !units("Revenues").some((x) => x.end === "2025-06-30" && x.accn === Q2_26));
check("跨概念比较数不带入", units("RevenueFromContractWithCustomerExcludingAssessedTax").length === 0);
check("继任者非 10-Q/10-K 事实不带入", units("NetIncomeLoss").length === 0);
check("不改入参", successor.facts["us-gaap"].Revenues.units.USD.length === 4 && predecessor.facts["us-gaap"].Revenues.units.USD.length === 6);

console.log("端到端(normalizer)");
const allFilings = [
  ...successorFilings,
  filing(OLD_CIK, `${OLD_CIK}-26-000067`, "10-Q", "2026-03-31", "2026-05-04"),
  filing(OLD_CIK, `${OLD_CIK}-26-000045`, "10-K", "2025-12-31", "2026-02-18"),
  filing(OLD_CIK, `${OLD_CIK}-25-000061`, "10-Q", "2025-09-30", "2025-11-03"),
  filing(OLD_CIK, `${OLD_CIK}-25-000042`, "10-Q", "2025-06-30", "2025-08-04"),
  filing(OLD_CIK, `${OLD_CIK}-25-000024`, "10-Q", "2025-03-31", "2025-05-05"),
];
const norm = normalizeCompanyFacts("XOM", NEW_CIK, merged, allFilings, "1231");
const q = (end: string) => norm.quarterly.find((r) => r.period_end === end);
check("annual 有 FY2025", norm.annual.some((r) => r.period_end === "2025-12-31" && r.revenue === 332_238));
check("quarterly 有 2025-09-30", q("2025-09-30")?.revenue === 85_294);
check("quarterly 有 2026-03-31", q("2026-03-31")?.revenue === 85_138);
check("quarterly 有 2026-06-30(继任者)", q("2026-06-30")?.revenue === 116_017 && q("2026-06-30")?.accession_number === Q2_26);
check(
  "2025-06-30 取前身原始 10-Q,不是继任者比较期",
  q("2025-06-30")?.revenue === 81_506 && q("2025-06-30")?.accession_number === `${OLD_CIK}-25-000042`,
  `${q("2025-06-30")?.revenue} ${q("2025-06-30")?.accession_number}`,
);
const naive = normalizeCompanyFacts("XOM", NEW_CIK, successor, successorFilings, "1231");
check("对照:不拼接时没有带营收的年度行(线上 2026-10-19 annual 为空)", !naive.annual.some((r) => r.revenue != null));
check("对照:不拼接时 2025-06-30 落在继任者比较期上", naive.quarterly.find((r) => r.period_end === "2025-06-30")?.accession_number === Q2_26);

if (failed) {
  console.error(`\npredecessor.check: ${failed} 项失败`);
  process.exit(1);
}
console.log("\npredecessor.check OK");
