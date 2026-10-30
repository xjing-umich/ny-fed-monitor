import { XMLParser } from "fast-xml-parser";
import type { CompanyFacts, SecFactUnit } from "./company-facts";
import type { NormalizedFiling } from "./company-submissions";
import { FUNDAMENTAL_TAGS } from "./fundamental-tags";
import { filingIndexUrl, secFetchJson, secFetchText, sleep } from "./sec-client";

/**
 * companyfacts 漏收的 10-Q/10-K → 读原始申报的 XBRL instance 回填。
 *
 * 为什么:SEC 的 companyfacts 汇总接口会漏掉部分申报。2026-10 审计:约 200 家(V/ABT/CB/MDLZ…)
 * 7–8 月就交了 Q2 10-Q,companyfacts 里却最新只到 Q1,而我们只读 companyfacts,每周任务照报
 * "success",估值一直用旧一季的基本面。
 *
 * 做法:把 instance 里的无维度 us-gaap 事实转成 companyfacts 同形的条目,注入 facts 后再交给
 * 现有 normalizer;TTM / 完整性闸 / 估值全部沿用,零分叉。
 *
 * 两条规则保证「不改历史」:
 *  - 只注入申报**自身报告期**的事实(end ≈ reportDate)。比较期数一律不注入 —— normalizer 按
 *    「同概念最早申报」取值,但不同概念之间是「优先级靠前的概念先到先得」,若注入的比较数用了
 *    更靠前的概念,就会顶掉历史上用次级概念报的原值。只注入本期,这条缝就不存在。
 *  - 同期仍按最早申报取值(normalizer 既有规则):补进来的原始申报比后来申报里的比较数更早。
 *
 * 范围(2026-10 扩展):除「晚于 companyfacts 最新一期」的新一期外,也补最新一期之前 3 年内的
 * 历史空洞 —— 那一期在 companyfacts 里连同口径的营收/净利都没有(比较数也没有)。
 */

export type UnitKind = "USD" | "shares" | "USD/shares";

/** instance 里的一条无维度 us-gaap 事实(已应用 sign/scale)。 */
export type GaapFact = { sourceTag?: string; tag: string; unit: UnitKind; value: number; start?: string; end?: string; instant?: string };

export const CAPITAL_EXPENDITURE_EXTENSIONS = new Set([
  "PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets",
  "PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets",
]);

const FORMS = new Set(["10-Q", "10-K"]);
/** 每家最多回填的申报份数:正常只差 1 份,多于 3 份说明另有问题,不靠这里补。 */
export const MAX_BACKFILL_FILINGS = 3;
/** 历史空洞只回看 companyfacts 最新一期前 3 年(≈ normalizer 保留的 12 季),不去翻没有 XBRL 的远古申报。 */
export const HOLE_LOOKBACK_DAYS = 3 * 365;
/** 「自身报告期」容差:52/53 周制的事实 end 与 reportDate 可能差几天。 */
const OWN_PERIOD_TOLERANCE_DAYS = 7;

/** 判断某期在 companyfacts 里「已有数据」只看撑起一行基本面的核心概念(营收 / 净利)。 */
const CORE_TAGS = new Set([...FUNDAMENTAL_TAGS.revenue, ...FUNDAMENTAL_TAGS.net_income]);

const dayNum = (d: string) => Date.parse(d) / 86_400_000;
/** 事实的 end 是否落在申报自身报告期上(而不是去年同期 / 上年末等比较期)。 */
export function isOwnPeriod(end: string, reportDate: string): boolean {
  return Math.abs(dayNum(end) - dayNum(reportDate)) <= OWN_PERIOD_TOLERANCE_DAYS;
}

const localName = (k: string) => k.split(":").pop() ?? k;
const prefixOf = (k: string) => (k.includes(":") ? k.split(":")[0] : "");
const asArray = <T,>(x: T | T[] | undefined | null): T[] => (Array.isArray(x) ? x : x == null ? [] : [x]);
type AnyObj = Record<string, unknown>;
const findByLocalName = (o: AnyObj, name: string): unknown => {
  for (const [k, v] of Object.entries(o)) if (localName(k) === name) return v;
  return undefined;
};
const text = (x: unknown): string | undefined =>
  typeof x === "string" ? x : typeof (x as AnyObj)?.["#text"] === "string" ? ((x as AnyObj)["#text"] as string) : undefined;

function classifyUnit(u: AnyObj): UnitKind | null {
  const measure = text(findByLocalName(u, "measure"));
  if (measure) {
    if (/(^|:)USD$/.test(measure) && measure.startsWith("iso4217")) return "USD";
    if (localName(measure) === "shares") return "shares";
    return null;
  }
  const div = findByLocalName(u, "divide") as AnyObj | undefined;
  if (!div) return null;
  const num = text(findByLocalName(findByLocalName(div, "unitNumerator") as AnyObj ?? {}, "measure"));
  const den = text(findByLocalName(findByLocalName(div, "unitDenominator") as AnyObj ?? {}, "measure"));
  return num === "iso4217:USD" && den != null && localName(den) === "shares" ? "USD/shares" : null;
}

/**
 * 抽取 instance 的无维度 us-gaap 事实(USD / shares / USD per share)。
 * 只收无维度事实 —— companyfacts 本身只含无维度事实,收了分部/分类维度就会串值。
 * 同 (tag, unit, 期间) 重复出现时保留第一条(同一申报内重复即同值)。
 */
export function extractGaapFacts(xml: string): GaapFact[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false });
  const root = findByLocalName(parser.parse(xml) as AnyObj, "xbrl") as AnyObj | undefined;
  if (!root) return [];

  const units = new Map<string, UnitKind>();
  for (const [k, v] of Object.entries(root)) {
    if (localName(k) !== "unit") continue;
    for (const u of asArray(v as AnyObj | AnyObj[])) {
      const id = (u as AnyObj)["@_id"];
      const kind = classifyUnit(u as AnyObj);
      if (typeof id === "string" && kind) units.set(id, kind);
    }
  }

  type Ctx = { start?: string; end?: string; instant?: string };
  const contexts = new Map<string, Ctx>();
  for (const [k, v] of Object.entries(root)) {
    if (localName(k) !== "context") continue;
    for (const c of asArray(v as AnyObj | AnyObj[])) {
      const ctx = c as AnyObj;
      const id = ctx["@_id"];
      const entity = findByLocalName(ctx, "entity") as AnyObj | undefined;
      const dimensional = (entity && findByLocalName(entity, "segment") != null) || findByLocalName(ctx, "scenario") != null;
      const period = findByLocalName(ctx, "period") as AnyObj | undefined;
      if (typeof id !== "string" || !period || dimensional) continue;
      contexts.set(id, {
        start: text(findByLocalName(period, "startDate")),
        end: text(findByLocalName(period, "endDate")),
        instant: text(findByLocalName(period, "instant")),
      });
    }
  }

  const out: GaapFact[] = [];
  const seen = new Set<string>();
  for (const [k, v] of Object.entries(root)) {
    const tag = localName(k);
    // Exact semantic aliases only: arbitrary custom tags and investments stay excluded.
    const capexExtension = CAPITAL_EXPENDITURE_EXTENSIONS.has(tag);
    if (prefixOf(k) !== "us-gaap" && !capexExtension) continue;
    for (const f of asArray(v as AnyObj | AnyObj[])) {
      if (typeof f !== "object" || f === null) continue;
      const fact = f as AnyObj;
      const unit = units.get(String(fact["@_unitRef"]));
      const ctx = contexts.get(String(fact["@_contextRef"]));
      const raw = fact["#text"];
      if (!unit || !ctx || typeof raw !== "string") continue;
      const n = Number(raw);
      const scale = typeof fact["@_scale"] === "string" ? Number(fact["@_scale"]) : 0;
      if (!Number.isFinite(n) || !Number.isFinite(scale)) continue;
      const key = `${tag}|${unit}|${ctx.start ?? ""}|${ctx.end ?? ""}|${ctx.instant ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ tag, ...(prefixOf(k) !== "us-gaap" ? { sourceTag: k } : {}), unit, value: (fact["@_sign"] === "-" ? -1 : 1) * n * Math.pow(10, scale), ...ctx });
    }
  }
  return out;
}

function factsAccessions(facts: CompanyFacts): { accns: Set<string>; latestEnd: string | null; durationEnds: Map<string, number[]> } {
  const accns = new Set<string>();
  let latestEnd: string | null = null;
  // end → 10-Q/10-K 在该 end 上报过的营收/净利期间事实天数(判断某期在 companyfacts 里是否已有同口径数据)。
  // 不算:DEF 14A 薪酬与业绩表的全年净利、10-Q 附注里的公允价值调节表等 —— 都撑不起一行基本面。
  const durationEnds = new Map<string, number[]>();
  for (const [tag, concept] of Object.entries(facts.facts?.["us-gaap"] ?? {})) {
    for (const list of Object.values(concept.units ?? {})) {
      for (const u of list) {
        if (u.accn) accns.add(u.accn);
        if (u.end && u.form && FORMS.has(u.form) && (!latestEnd || u.end > latestEnd)) latestEnd = u.end;
        if (u.start && u.end && u.form && FORMS.has(u.form) && CORE_TAGS.has(tag)) {
          const days = Math.round(dayNum(u.end) - dayNum(u.start));
          const list = durationEnds.get(u.end);
          if (list) list.push(days);
          else durationEnds.set(u.end, [days]);
        }
      }
    }
  }
  return { accns, latestEnd, durationEnds };
}

/** companyfacts 里是否已有这份申报口径的营收/净利期间事实(10-K:全年;10-Q:单季或 YTD),来自任一 10-Q/10-K(含比较数)。 */
function periodCovered(durationEnds: Map<string, number[]>, filing: NormalizedFiling): boolean {
  const report = filing.report_date!;
  const fits = filing.form === "10-K" ? (d: number) => d >= 350 && d <= 380 : (d: number) => d >= 80 && d <= 285;
  for (const [end, days] of durationEnds) if (isOwnPeriod(end, report) && days.some(fits)) return true;
  return false;
}

/**
 * companyfacts 漏收的申报:10-Q/10-K,accession 不在 companyfacts 里,且属于以下之一:
 *  - 新一期:报告期晚于 companyfacts 已有的最新一期;
 *  - 历史空洞:报告期在最新一期前 HOLE_LOOKBACK_DAYS 内,且 companyfacts 里这一期连同口径的
 *    营收/净利都没有(后来申报的比较数已覆盖的期,不算空洞,不去拉)。
 * 按报告期升序,最多 max 份(超出时保留最新的)。
 */
export function findMissingFilings(facts: CompanyFacts, filings: NormalizedFiling[], max = MAX_BACKFILL_FILINGS): NormalizedFiling[] {
  const { accns, latestEnd, durationEnds } = factsAccessions(facts);
  const holeFloor = latestEnd == null ? null : new Date((dayNum(latestEnd) - HOLE_LOOKBACK_DAYS) * 86_400_000).toISOString().slice(0, 10);
  return filings
    .filter((f) => FORMS.has(f.form) && f.report_date && f.primary_document && !accns.has(f.accession_number))
    .filter((f) => latestEnd == null || f.report_date! > latestEnd || (f.report_date! >= holeFloor! && !periodCovered(durationEnds, f)))
    .sort((a, b) => (a.report_date! < b.report_date! ? -1 : 1))
    .slice(-max);
}

/** 把一份申报**自身报告期**的事实以 companyfacts 同形注入(就地修改 facts;比较期事实跳过)。返回注入条数。 */
export function injectFilingFacts(facts: CompanyFacts, filing: NormalizedFiling, gaap: GaapFact[]): number {
  facts.facts = facts.facts ?? {};
  const ns = (facts.facts["us-gaap"] = facts.facts["us-gaap"] ?? {});
  let n = 0;
  for (const g of gaap) {
    const end = g.end ?? g.instant;
    if (!end || (filing.report_date && !isOwnPeriod(end, filing.report_date))) continue;
    const concept = (ns[g.tag] = ns[g.tag] ?? { units: {} });
    const list = (concept.units[g.unit] = concept.units[g.unit] ?? []);
    const unit: SecFactUnit = {
      ...(g.start ? { start: g.start } : {}),
      end,
      val: g.value,
      accn: filing.accession_number,
      form: filing.form,
      filed: filing.filing_date ?? undefined,
      ...(g.sourceTag ? { source_tag: g.sourceTag } : {}),
    };
    list.push(unit);
    n++;
  }
  return n;
}

type EdgarIndex = { directory?: { item?: { name?: string }[] } };

/** 提取版 instance = primaryDocument 去 .htm 加 _htm.xml;不在则读目录 index.json 找 *_htm.xml。 */
async function fetchInstance(filing: NormalizedFiling): Promise<string | null> {
  const dir = filingIndexUrl(filing.cik, filing.accession_number);
  const guess = filing.primary_document?.replace(/\.htm$/i, "_htm.xml");
  if (guess) {
    try {
      return await secFetchText(`${dir}${guess}`);
    } catch {
      // 回退 index.json
    }
  }
  try {
    const index = await secFetchJson<EdgarIndex>(`${dir}index.json`);
    const name = index.directory?.item?.map((i) => i.name).find((n) => n?.endsWith("_htm.xml"));
    return name ? await secFetchText(`${dir}${name}`) : null;
  } catch {
    return null;
  }
}

export type BackfillResult = { filled: string[]; failed: string[] };

/**
 * 找出漏收申报并回填进 facts(就地)。任何单份失败只记入 failed,不抛 —— 回填绝不打断主 ingest。
 */
export async function backfillMissingFilings(facts: CompanyFacts, filings: NormalizedFiling[]): Promise<BackfillResult> {
  const result: BackfillResult = { filled: [], failed: [] };
  for (const filing of findMissingFilings(facts, filings)) {
    const label = `${filing.form} ${filing.report_date} ${filing.accession_number}`;
    try {
      const xml = await fetchInstance(filing);
      await sleep(150);
      const gaap = xml ? extractGaapFacts(xml) : [];
      if (!gaap.length || injectFilingFacts(facts, filing, gaap) === 0) result.failed.push(label);
      else result.filled.push(label);
    } catch {
      result.failed.push(label);
    }
  }
  return result;
}

/** Field-level annual fallback: core revenue may be present while custom CapEx is omitted. */
export function findMissingCapitalExpenditureFilings(facts: CompanyFacts, filings: NormalizedFiling[]): NormalizedFiling[] {
  const covered = FUNDAMENTAL_TAGS.capex.flatMap(tag => facts.facts?.["us-gaap"]?.[tag]?.units.USD ?? []);
  return filings.filter(f => ["10-K", "20-F"].includes(f.form) && f.report_date && f.primary_document)
    .filter(f => !covered.some(u => u.start && u.end && Number.isFinite(u.val) && isOwnPeriod(u.end,f.report_date!) && dayNum(u.end)-dayNum(u.start)>=350 && dayNum(u.end)-dayNum(u.start)<=380))
    .sort((a,b)=>b.report_date!.localeCompare(a.report_date!)).slice(0,6);
}

export async function backfillCapitalExpenditures(facts: CompanyFacts, filings: NormalizedFiling[]): Promise<BackfillResult> {
  const result: BackfillResult = {filled:[], failed:[]};
  for (const filing of findMissingCapitalExpenditureFilings(facts,filings)) {
    const label = `CapEx ${filing.form} ${filing.report_date} ${filing.accession_number}`;
    try {
      const xml=await fetchInstance(filing);
      await sleep(150);
      const selected=xml ? extractGaapFacts(xml).filter(f => f.unit === "USD" && FUNDAMENTAL_TAGS.capex.includes(f.tag) && f.start && f.end && dayNum(f.end)-dayNum(f.start)>=350 && dayNum(f.end)-dayNum(f.start)<=380) : [];
      if (injectFilingFacts(facts,filing,selected)>0) result.filled.push(label); else result.failed.push(label);
    } catch { result.failed.push(label); }
  }
  return result;
}
