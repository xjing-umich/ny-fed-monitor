import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { NormalizedFiling } from "./company-submissions";

// Audited 2026-10-31. Do not enable arbitrary foreign issuers without reviewing
// their accounting, reporting currency and listed security/share basis.
export const NATIVE_40F_ISSUERS: Readonly<Record<string, string>> = {
  BMM: "0001732379", NICM: "0001526475",
};
const FIELDS = {
  revenue: ["Revenue", "money"],
  profit_loss: ["ProfitLoss", "money"],
  profit_loss_attributable_to_owners: ["ProfitLossAttributableToOwnersOfParent", "money"],
  gross_profit: ["GrossProfit", "money"],
  operating_profit: ["ProfitLossFromOperatingActivities", "money"],
  cash_and_equivalents: ["CashAndCashEquivalents", "money"],
  total_assets: ["Assets", "money"],
  total_liabilities: ["Liabilities", "money"],
  equity: ["Equity", "money"],
  equity_attributable_to_owners: ["EquityAttributableToOwnersOfParent", "money"],
  operating_cash_flow: ["CashFlowsFromUsedInOperatingActivities", "money"],
  purchases_of_ppe: ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "money"],
  basic_eps: ["BasicEarningsLossPerShare", "eps"],
  diluted_eps: ["DilutedEarningsLossPerShare", "eps"],
  weighted_average_shares: ["WeightedAverageShares", "shares"],
  diluted_weighted_average_shares: ["AdjustedWeightedAverageShares", "shares"],
} as const;
type Metric = keyof typeof FIELDS;
type Context = { start?: string; end: string; instant: boolean };
type Evidence = {
  concept: string; context_id: string; unit: string; value: number;
  period_start?: string; period_end: string;
};
export type NativeFinancialPeriod = Record<Metric, number | null> & {
  ticker: string; cik: string; form: "40-F"; fiscal_period: "FY";
  period_start: string; period_end: string; filing_date: string;
  accession_number: string; source_filing_url: string; source_instance_url: string;
  reporting_currency: "CAD"; accounting_standard: "IFRS";
  share_basis: "issuer_ordinary"; valuation_eligible: false;
  valuation_blockers: string[]; is_comparative: boolean;
  raw_facts: Partial<Record<Metric, Evidence>>;
};
type Obj = Record<string, unknown>;
const local = (key: string) => key.split(":").at(-1)!;
const array = (value: unknown): Obj[] => (Array.isArray(value) ? value : value == null ? [] : [value]) as Obj[];
const child = (obj: Obj, key: string): unknown => Object.entries(obj).find(([k]) => local(k) === key)?.[1];
const content = (value: unknown): string | undefined => typeof value === "string" ? value.trim()
  : value && typeof value === "object" ? content((value as Obj)["#text"]) : undefined;
const day = (value: string) => Date.parse(`${value}T00:00:00Z`) / 86400000;
function date(value: unknown): string | undefined {
  const s = content(value);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(day(s))) return;
  return new Date(day(s) * 86400000).toISOString().slice(0, 10) === s ? s : undefined;
}

/** Native CAD consolidated annual values only; never fed to the USD normalizer. */
export function parseNativeFinancials(ticker: string, filing: NormalizedFiling, xml: string, sourceUrl: string): NativeFinancialPeriod[] {
  const cik = NATIVE_40F_ISSUERS[ticker];
  if (!cik || filing.cik !== cik || filing.ticker !== ticker || filing.form !== "40-F") throw new Error("Native financial issuer identity mismatch");
  const reportDate = date(filing.report_date), filed = date(filing.filing_date);
  if (!reportDate || !filed || reportDate > filed) throw new Error("Invalid native financial filing dates");
  if (/<!DOCTYPE/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("Invalid native financial XML");
  const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false }).parse(xml) as Obj;
  const root = child(parsed, "xbrl") as Obj | undefined;
  if (!root) throw new Error("Missing native financial XBRL root");
  // This audited parser supports root-bound QNames. XML permits local rebinding;
  // fail closed instead of assigning the root's IFRS/currency URI to such facts.
  const rejectRebinding = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(rejectRebinding); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if ((key === "@_xmlns" || key.startsWith("@_xmlns:")) && root[key] !== undefined && root[key] !== nested) {
        throw new Error("Unsupported native financial namespace rebinding");
      }
      if (!key.startsWith("@_")) rejectRebinding(nested);
    }
  };
  rejectRebinding(root);
  const namespace = (qname: string) => root[`@_xmlns${qname.includes(":") ? `:${qname.split(":")[0]}` : ""}`];
  const isShares = (qname: string | undefined) => !!qname && local(qname) === "shares" && namespace(qname) === "http://www.xbrl.org/2003/instance";
  const isCAD = (qname: string | undefined) => !!qname && local(qname) === "CAD" && namespace(qname) === "http://www.xbrl.org/2003/iso4217";
  const units = new Map<string, string>();
  for (const unit of array(child(root, "unit"))) {
    const measure = content(child(unit, "measure"));
    let kind = isCAD(measure) ? "CAD" : isShares(measure) ? "shares" : undefined;
    const divide = child(unit, "divide") as Obj | undefined;
    if (divide) {
      const numerator = child(divide, "unitNumerator") as Obj ?? {};
      const denominator = child(divide, "unitDenominator") as Obj ?? {};
      if (isCAD(content(child(numerator, "measure"))) && isShares(content(child(denominator, "measure")))) kind = "CAD/shares";
    }
    if (kind && typeof unit["@_id"] === "string") units.set(unit["@_id"], kind);
  }
  const contexts = new Map<string, Context>();
  for (const context of array(child(root, "context"))) {
    const entity = child(context, "entity") as Obj ?? {};
    const identifier = child(entity, "identifier") as Obj | undefined;
    if (!identifier || content(identifier)?.padStart(10, "0") !== cik || identifier["@_scheme"] !== "http://www.sec.gov/CIK") continue;
    if (child(entity, "segment") != null || child(context, "scenario") != null) continue;
    const period = child(context, "period") as Obj ?? {};
    const start = date(child(period, "startDate"));
    const instant = date(child(period, "instant"));
    const end = instant ?? date(child(period, "endDate"));
    if (!end || end > reportDate || day(reportDate) - day(end) > 380) continue;
    if (!instant && (!start || day(end) - day(start) < 350 || day(end) - day(start) > 380)) continue;
    if (typeof context["@_id"] === "string") contexts.set(context["@_id"], { start, end, instant: !!instant });
  }
  const evidence = new Map<string, Partial<Record<Metric, Evidence>>>();
  const starts = new Map<string, string>();
  const instants = new Set<Metric>(["cash_and_equivalents", "total_assets", "total_liabilities", "equity", "equity_attributable_to_owners"]);
  for (const [qname, values] of Object.entries(root)) {
    if (!/^https:\/\/xbrl\.ifrs\.org\/taxonomy\/\d{4}-\d{2}-\d{2}\/ifrs-full$/.test(String(namespace(qname)))) continue;
    const field = (Object.keys(FIELDS) as Metric[]).find(key => FIELDS[key][0] === local(qname));
    if (!field) continue;
    const expectedUnit = FIELDS[field][1] === "money" ? "CAD" : FIELDS[field][1] === "eps" ? "CAD/shares" : "shares";
    for (const fact of array(values)) {
      const contextId = String(fact["@_contextRef"]);
      const ctx = contexts.get(contextId), unit = units.get(String(fact["@_unitRef"]));
      const raw = content(fact);
      if (!ctx || unit !== expectedUnit || ctx.instant !== instants.has(field) || raw == null || raw === "" || Object.entries(fact).some(([k,v]) => local(k) === "nil" && (v === "true" || v === "1"))) continue;
      const value = Number(raw);
      // Extracted instance facts are already scaled signed values, unlike inline ix:nonFraction.
      if (!Number.isFinite(value) || fact["@_scale"] != null || fact["@_sign"] != null) continue;
      const row = evidence.get(ctx.end) ?? {};
      if (row[field] && row[field]!.value !== value) throw new Error(`Conflicting native financial facts: ${field} ${ctx.end}`);
      row[field] = { concept: `{${namespace(qname)}}${local(qname)}`, context_id: contextId, unit, value,
        ...(ctx.start ? { period_start: ctx.start } : {}), period_end: ctx.end };
      evidence.set(ctx.end, row);
      if (ctx.start) {
        const priorStart = starts.get(ctx.end);
        if (priorStart && priorStart !== ctx.start) throw new Error(`Conflicting native financial duration: ${ctx.end}`);
        starts.set(ctx.end, ctx.start);
      }
    }
  }
  const periods: NativeFinancialPeriod[] = [];
  for (const [end, rawFacts] of [...evidence].sort(([a],[b]) => b.localeCompare(a))) {
    // A balance-sheet-only comparison is not an annual income/cash-flow period.
    if (!starts.has(end) || !rawFacts.total_assets || !rawFacts.profit_loss || !rawFacts.operating_cash_flow) continue;
    const metrics = Object.fromEntries((Object.keys(FIELDS) as Metric[]).map(key => [key, rawFacts[key]?.value ?? null])) as Record<Metric, number | null>;
    periods.push({ ...metrics, ticker, cik, form: "40-F", fiscal_period: "FY", period_start: starts.get(end)!, period_end: end,
      filing_date: filed, accession_number: filing.accession_number, source_filing_url: filing.filing_url, source_instance_url: sourceUrl,
      reporting_currency: "CAD", accounting_standard: "IFRS", share_basis: "issuer_ordinary", valuation_eligible: false,
      valuation_blockers: ticker === "NICM" ? ["fx_conversion_required", "adr_conversion_required"] : ["fx_conversion_required"],
      is_comparative: end !== reportDate, raw_facts: rawFacts });
  }
  if (!periods.some(p => p.period_end === reportDate)) throw new Error(`${ticker}: native financial CAD annual core facts unavailable`);
  return periods;
}
