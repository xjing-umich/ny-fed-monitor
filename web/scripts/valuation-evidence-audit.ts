/** Read-only replay over a complete paginated capture. No database client or write path. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fundamentalsToFloorInput } from "../src/lib/valuation/fundamentalsToFloorInput";
import { runValuation } from "../src/lib/valuation/runValuation";
import { resolveAds } from "../src/lib/valuation/adsNormalization";
import { isFundamentalsStale } from "../src/lib/valuation/fundamentalsStale";
import { isPriceStale } from "../src/lib/valuation/priceAge";
import { isSplitCoverageStale } from "../src/lib/valuation/splitCoverage";
import { isRealSplit } from "../src/lib/managers/splitAdjust";
import { computeHoldcoSotpFromRows } from "../src/lib/valuation/holdcoSotpFromDb";
import { needsHoldcoSotp } from "../src/lib/sec/holdco-gate";
import { historicalGrowthBaseRate } from "../src/lib/valuation/growthBaseRate";
import { isOperatingSecurity } from "../src/lib/securities/openfigi";
import { isLikelyTicker } from "../src/lib/externalLinks";
import { VALUATION_MODEL_VERSION } from "../src/lib/valuation/modelVersion";

type Row = Record<string, any>;
export function validateCapture(
  manifest: { source_rows: Record<string, number>; server_counts?: Record<string, number> },
  tables: Record<string, Row[]>,
): void {
  for (const [name, count] of Object.entries(manifest.source_rows)) {
    if (manifest.server_counts && manifest.server_counts[name] !== count) {
      throw new Error(`Server count mismatch: ${name}`);
    }
    if (!tables[name] || tables[name].length !== count)
      throw new Error(
        `Incomplete capture: ${name}; expected ${count}, received ${tables[name]?.length ?? "missing"}`,
      );
  }
}
export function summarizeAudit(rows: Row[]) {
  const status: Record<string, number> = {};
  for (const r of rows) status[r.status] = (status[r.status] ?? 0) + 1;
  return {
    total: rows.length,
    issuers: new Set(rows.map((r) => r.cik ?? r.ticker)).size,
    status,
    snapshotCount: rows.filter((r) => r.snapshot).length,
    dcf: rows.filter((r) => r.dcfAssessable === true).length,
    negativeHistoryPositiveGrowth: rows.filter((r) => r.gRaw < 0 && r.g1 > 0)
      .length,
    aboveTenYearHorizon: rows.filter((r) => r.cap > 10).length,
    positiveGrowth: rows.filter((r) => r.dcfAssessable === true && r.g1 > 0).length,
    coverageGaps: rows.filter((r) => r.coverageGap).length,
    gapReasons: rows
      .filter((r) => r.coverageGap)
      .reduce(
        (a: Record<string, number>, r) => (
          (a[r.coverageGap] = (a[r.coverageGap] ?? 0) + 1),
          a
        ),
        {},
      ),
    ivLower: rows.filter(
      (r) => r.newIv != null && r.oldIv != null && r.newIv < r.oldIv * 0.99,
    ).length,
    ivHigher: rows.filter(
      (r) => r.newIv != null && r.oldIv != null && r.newIv > r.oldIv * 1.01,
    ).length,
    strikeBefore: rows.filter((r) => r.oldStrike).length,
    strikeAfter: rows.filter((r) => r.newStrike).length,
  };
}
const group = (rows: Row[]) => {
  const out = new Map<string, Row[]>();
  for (const r of rows) out.set(r.ticker, [...(out.get(r.ticker) ?? []), r]);
  return out;
};

export async function auditCapture(
  inputDir: string,
  baselineDir: string,
  outputDir: string,
  asOf: string,
) {
  const names = [
    "valuation_snapshot",
    "sec_companies",
    "securities",
    "consensus_holdings",
    "market_rates",
    "prices",
    "stock_splits",
    "company_holdco_investments",
    "company_segment_years",
    "sec_filings",
    "company_fundamentals_periods",
  ];
  const tables = Object.fromEntries(
    names.map((n) => [
      n,
      JSON.parse(
        fs.readFileSync(path.join(inputDir, n + ".json"), "utf8"),
      ) as Row[],
    ]),
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(inputDir, "manifest.json"), "utf8"),
  );
  validateCapture(manifest, tables);
  const maps = Object.fromEntries(names.map((n) => [n, group(tables[n])]));
  const oldMap = await import(
    pathToFileURL(
      path.join(
        baselineDir,
        "web/src/lib/valuation/fundamentalsToFloorInput.ts",
      ),
    ).href
  );
  const oldEngine = await import(
    pathToFileURL(
      path.join(baselineDir, "web/src/lib/valuation/runValuation.ts"),
    ).href
  );
  const rate = tables.market_rates.find((r) => r.series_id === "DGS10");
  if (!rate) throw new Error("Missing DGS10 source");
  const universe = [
    ...new Set(
      [
        "securities",
        "sec_companies",
        "consensus_holdings",
        "valuation_snapshot",
      ].flatMap((n) => [...maps[n].keys()]),
    ),
  ].sort();
  const results: Row[] = [];
  for (const ticker of universe) {
    const company = maps.sec_companies.get(ticker)?.[0],
      security = maps.securities.get(ticker)?.[0],
      snapshot = maps.valuation_snapshot.get(ticker)?.[0];
    const out: Row = {
      ticker,
      cik: company?.cik,
      snapshot: !!snapshot,
      status: "unknown",
    };
    results.push(out);
    if (!isLikelyTicker(ticker)) {
      out.status = "unresolved_identifier";
      continue;
    }
    if (!isOperatingSecurity(security?.security_type)) {
      out.status = "non_operating";
      continue;
    }
    const ads = resolveAds(security?.security_type, security?.ads_ratio);
    if (ads.suppressed) {
      out.status = "ads_suppressed";
      continue;
    }
    const raw = (maps.company_fundamentals_periods.get(ticker) ?? [])
      .slice()
      .sort((a, b) => b.period_end.localeCompare(a.period_end))
      .slice(0, 32);
    const annual = raw.filter((r) => r.fiscal_period === "FY"),
      quarterly = raw.filter((r) => r.fiscal_period !== "FY").slice(0, 12);
    if (!company && !annual.length) {
      out.status = "no_SEC_data";
      continue;
    }
    const priceRow = maps.prices.get(ticker)?.[0];
    const price = priceRow
      ? {
          close: Number(priceRow.close),
          date: priceRow.date,
          currency: priceRow.currency ?? "USD",
          source: priceRow.source,
        }
      : null;
    const lastSplit = (maps.stock_splits.get(ticker) ?? []).find((r) =>
      isRealSplit(Number(r.ratio)),
    );
    try {
      const execute = (
        mapper: typeof fundamentalsToFloorInput,
        engine: typeof runValuation,
      ) => {
        const input = mapper(
          ticker,
          ticker,
          annual as any,
          ads.ratio,
          company?.sic == null ? undefined : Number(company.sic),
          quarterly as any,
          (maps.sec_filings.get(ticker) ?? []) as any,
        );
        if (needsHoldcoSotp(annual as any)) {
          const sotp = computeHoldcoSotpFromRows({
            annual: annual as any,
            floorInput: input,
            investments: (
              maps.company_holdco_investments.get(ticker) ?? []
            ).slice(0, 8) as any,
            years: (maps.company_segment_years.get(ticker) ?? []).slice(
              0,
              8,
            ) as any,
          });
          if (sotp.assessable) input.holdcoSotp = sotp;
        }
        const basis = input.ttm?.period_end ?? annual[0]?.period_end ?? null;
        const splitBasis =
          input.ttm && !input.ttm.shares_from_fy
            ? input.ttm.period_end
            : (annual[0]?.period_end ?? null);
        return engine({
          floorInput: input,
          price,
          dgs10: { value: Number(rate.value), date: rate.as_of },
          asOf,
          guards: {
            adsSuppressed: false,
            fundamentalsStale: isFundamentalsStale(basis, asOf),
            priceStale: !!price && isPriceStale(price.date, new Date(asOf)),
            splitCoverageStale: isSplitCoverageStale({
              fundamentalsAsOf: splitBasis,
              latestSplitDate: lastSplit?.split_date ?? null,
            }),
          },
        });
      };
      const before = execute(
          oldMap.fundamentalsToFloorInput,
          oldEngine.runValuation,
        ),
        after = execute(fundamentalsToFloorInput, runValuation);
      const input = fundamentalsToFloorInput(
        ticker,
        ticker,
        annual as any,
        ads.ratio,
        company?.sic == null ? undefined : Number(company.sic),
        quarterly as any,
        (maps.sec_filings.get(ticker) ?? []) as any,
      );
      Object.assign(out, {
        status: after.verdict
          ? "verdict"
          : (after.suppressedReason ?? "no_verdict"),
        gRaw: historicalGrowthBaseRate(input.years),
        oldG1: before.oeDcf?.growth_g1,
        g1: after.oeDcf?.growth_g1,
        dcfAssessable: after.oeDcf?.assessable === true,
        oldCap: before.oeDcf?.expectations_inputs?.capYears,
        cap: after.oeDcf?.expectations_inputs?.capYears,
        oldIv: before.oeDcf?.tiers?.neutral.per_share,
        newIv: after.oeDcf?.tiers?.neutral.per_share,
        oldStrike: before.verdict?.inStrikeZone ?? false,
        newStrike: after.verdict?.inStrikeZone ?? false,
        oldReliable: before.verdict?.reliable,
        newReliable: after.verdict?.reliable,
        coverageGap: after.oeDcf?.growth_coverage_gap,
        limitedBy: after.oeDcf?.growth_g1_limited_by,
        basisDate: input.ttm?.period_end ?? annual[0]?.period_end,
        priceDate: price?.date,
        sourceUpdatedAt: raw[0]?.updated_at,
        evidence: after.oeDcf?.growth_evidence,
        oldVerdict: before.verdict?.bucket,
        newVerdict: after.verdict?.bucket,
      });
    } catch (e) {
      out.status = "calculation_failure";
      out.error = e instanceof Error ? e.message : String(e);
    }
  }
  const summary = {
    model_version: VALUATION_MODEL_VERSION,
    asOf,
    capture: manifest,
    rate,
    all: summarizeAudit(results),
    snapshots: summarizeAudit(results.filter((r) => r.snapshot)),
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "results.json"),
    JSON.stringify(results, null, 2),
  );
  fs.writeFileSync(
    path.join(outputDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  const keys = [...new Set(results.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) =>
    '"' +
    (v == null
      ? ""
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v)
    ).replaceAll('"', '""') +
    '"';
  fs.writeFileSync(
    path.join(outputDir, "results.csv"),
    "\uFEFF" +
      keys.map(cell).join(",") +
      "\n" +
      results.map((r) => keys.map((k) => cell(r[k])).join(",")).join("\n"),
  );
  return summary;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname)
) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    if (i < 0 || !process.argv[i + 1]) throw new Error(`Required: ${name}`);
    return process.argv[i + 1];
  };
  auditCapture(
    arg("--input-dir"),
    arg("--baseline-dir"),
    arg("--output-dir"),
    arg("--as-of"),
  )
    .then((s) => console.log(JSON.stringify(s, null, 2)))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
